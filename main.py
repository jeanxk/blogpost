"""Single-process operating server for the personal 블로그포스트 workspace.

It serves the built React app, exposes the local provider API, and persists
drafts in SQLite. The server binds to loopback by default so the API key and
workspace are not exposed to the local network.
"""

from __future__ import annotations

import json
import mimetypes
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

from agent import demo_request, generate_draft, provider_status, validate_draft
from storage import DB_PATH, delete_post, get_post, init_db, list_posts, save_post


ROOT = Path(__file__).resolve().parent
DIST_DIR = ROOT / "dist"
INDEX_FILE = DIST_DIR / "index.html"
MAX_PAYLOAD_BYTES = 25 * 1024 * 1024


class Handler(BaseHTTPRequestHandler):
    def _cors(self) -> None:
        origin = self.headers.get("Origin", "")
        if origin in {"http://127.0.0.1:5173", "http://localhost:5173", "http://127.0.0.1:8000", "http://localhost:8000"}:
            self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")

    def _send_json(self, status: int, payload: dict, *, headers: dict[str, str] | None = None) -> None:
        data = b"" if status == 204 else json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self._cors()
        for name, value in (headers or {}).items():
            self.send_header(name, value)
        self.end_headers()
        if data:
            self.wfile.write(data)

    def _send_file(self, file_path: Path) -> None:
        content_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
        data = file_path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-cache" if file_path.name == "index.html" else "public, max-age=3600")
        self.end_headers()
        self.wfile.write(data)

    def _send_text(self, status: int, message: str) -> None:
        data = message.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _static_file(self, request_path: str) -> Path | None:
        if not INDEX_FILE.exists():
            return None
        relative = unquote(request_path).lstrip("/")
        if not relative or relative.endswith("/"):
            return INDEX_FILE
        candidate = (DIST_DIR / relative).resolve()
        dist_root = DIST_DIR.resolve()
        if dist_root not in candidate.parents and candidate != dist_root:
            return None
        if candidate.is_file():
            return candidate
        if "." not in Path(relative).name:
            return INDEX_FILE
        return None

    def do_OPTIONS(self) -> None:  # noqa: N802
        self._send_json(204, {})

    def do_HEAD(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        file_path = self._static_file(path)
        if file_path is None:
            self.send_error(404)
            return
        content_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(file_path.stat().st_size))
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path
        if path == "/health":
            self._send_json(
                200,
                {
                    "ok": True,
                    "service": "blogpost",
                    "mode": "persistent-local",
                    "storage": {"type": "sqlite", "path": str(DB_PATH.resolve())},
                    "providers": provider_status(),
                },
            )
            return
        if path == "/api/posts":
            query = parse_qs(parsed.query)
            try:
                limit = int(query.get("limit", [50])[0])
            except ValueError:
                limit = 50
            posts = list_posts(limit, query.get("search", [""])[0], query.get("status", [""])[0])
            self._send_json(200, {"posts": posts, "count": len(posts)})
            return
        post_id = self._post_id(path)
        if post_id is not None and path.startswith("/api/posts/"):
            post = get_post(post_id)
            if post is None:
                self._send_json(404, {"error": "post_not_found"})
            else:
                self._send_json(200, {"post": post})
            return
        file_path = self._static_file(path)
        if file_path is None:
            if not INDEX_FILE.exists():
                self._send_text(503, "빌드된 앱이 없습니다. 먼저 npm run build를 실행하세요.")
            else:
                self._send_json(404, {"error": "not_found"})
            return
        self._send_file(file_path)

    def _read_payload(self) -> dict:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError as error:
            raise ValueError("invalid_content_length") from error
        if length > MAX_PAYLOAD_BYTES:
            raise ValueError("payload_too_large")
        raw = self.rfile.read(length) if length else b"{}"
        payload = json.loads(raw.decode("utf-8"))
        if not isinstance(payload, dict):
            raise ValueError("payload_must_be_object")
        return payload

    @staticmethod
    def _post_id(path: str) -> int | None:
        parts = path.rstrip("/").split("/")
        if len(parts) != 4 or parts[1:3] != ["api", "posts"]:
            return None
        try:
            return int(parts[3])
        except ValueError:
            return None

    @staticmethod
    def _post_payload(request: dict, result: dict | None = None) -> dict:
        result = result or {}
        draft = result.get("draft") or {}
        return {
            **request,
            "title": draft.get("title") or request.get("title", ""),
            "body": draft.get("body") or request.get("body", ""),
            "provider": result.get("provider") or request.get("provider") or "local",
            "model": result.get("model"),
            "facts_to_verify": result.get("facts_to_verify") or draft.get("facts_to_verify") or [],
            "seo_keywords": draft.get("seo_keywords") or [],
            "image_placements": draft.get("image_placements") or [],
            "preflight": result.get("preflight") or {},
            "status": "review",
        }

    def do_POST(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path not in {"/api/validate", "/api/draft", "/api/posts"}:
            self._send_json(404, {"error": "not_found"})
            return
        try:
            payload = self._read_payload()
        except (ValueError, json.JSONDecodeError, UnicodeDecodeError):
            self._send_json(400, {"error": "invalid_json"})
            return

        if path == "/api/posts":
            try:
                post = save_post(payload)
            except (KeyError, OSError, ValueError) as error:
                self._send_json(400, {"error": "post_not_saved", "message": str(error)[:300]})
                return
            self._send_json(201, {"post": post})
            return

        request = demo_request() if path == "/api/draft" and not payload else payload
        if path == "/api/validate":
            self._send_json(200, {"request": request, "preflight": validate_draft(request)})
            return

        provider = str(request.get("provider") or "local")
        try:
            result = generate_draft(request, provider)
        except RuntimeError as error:
            self._send_json(502, {"error": "provider_unavailable", "message": str(error), "providers": provider_status()})
            return
        try:
            post = save_post(self._post_payload(request, result))
        except (KeyError, OSError, ValueError) as error:
            self._send_json(500, {"error": "post_not_saved", "message": str(error)[:300]})
            return
        self._send_json(200, {"request": request, **result, "post": post})

    def do_PUT(self) -> None:  # noqa: N802
        post_id = self._post_id(urlparse(self.path).path)
        if post_id is None:
            self._send_json(404, {"error": "not_found"})
            return
        try:
            payload = self._read_payload()
            post = save_post(payload, post_id)
        except KeyError:
            self._send_json(404, {"error": "post_not_found"})
            return
        except (ValueError, json.JSONDecodeError, UnicodeDecodeError, OSError) as error:
            self._send_json(400, {"error": "post_not_saved", "message": str(error)[:300]})
            return
        self._send_json(200, {"post": post})

    def do_DELETE(self) -> None:  # noqa: N802
        post_id = self._post_id(urlparse(self.path).path)
        if post_id is None:
            self._send_json(404, {"error": "not_found"})
            return
        if not delete_post(post_id):
            self._send_json(404, {"error": "post_not_found"})
            return
        self._send_json(200, {"deleted": post_id})

    def log_message(self, fmt: str, *args: object) -> None:
        print("[blogpost] " + fmt % args)


def main() -> None:
    init_db()
    port = int(os.getenv("PORT", "8000"))
    host = os.getenv("BLOGPOST_HOST", "127.0.0.1")
    server = ThreadingHTTPServer((host, port), Handler)
    print(f"블로그포스트 운영판 listening on http://{host}:{port}")
    print("저장소: SQLite data/blogpost.sqlite3 · 자동 게시: 비활성")
    server.serve_forever()


if __name__ == "__main__":
    main()
