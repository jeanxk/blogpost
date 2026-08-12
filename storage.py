"""Durable local storage for the personal 블로그포스트 workspace.

The app is intentionally single-user for now. SQLite keeps drafts, review
metadata, disclosure state, and image references on this Mac so restarting the
process does not erase the workspace.
"""

from __future__ import annotations

import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
DB_PATH = Path(os.getenv("BLOGPOST_DB_PATH", str(ROOT / "data" / "blogpost.sqlite3"))).expanduser()


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA journal_mode=WAL")
    connection.execute("PRAGMA foreign_keys=ON")
    return connection


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _dump(value: Any) -> str:
    return json.dumps(value if value is not None else [], ensure_ascii=False)


def _load(value: str | None, fallback: Any) -> Any:
    if not value:
        return fallback
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return fallback


def init_db() -> None:
    with _connect() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS posts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL DEFAULT '',
                body TEXT NOT NULL DEFAULT '',
                notes TEXT NOT NULL DEFAULT '',
                tone TEXT NOT NULL DEFAULT '친근하고 정보적인',
                provider TEXT NOT NULL DEFAULT 'local',
                model TEXT,
                status TEXT NOT NULL DEFAULT 'review',
                monetization_json TEXT NOT NULL DEFAULT '[]',
                disclosure TEXT NOT NULL DEFAULT '',
                photos_json TEXT NOT NULL DEFAULT '[]',
                facts_json TEXT NOT NULL DEFAULT '[]',
                seo_keywords_json TEXT NOT NULL DEFAULT '[]',
                image_placements_json TEXT NOT NULL DEFAULT '[]',
                preflight_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_posts_updated_at ON posts(updated_at DESC);
            CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
            """
        )


def _row_to_post(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "title": row["title"],
        "body": row["body"],
        "notes": row["notes"],
        "tone": row["tone"],
        "provider": row["provider"],
        "model": row["model"],
        "status": row["status"],
        "monetization": _load(row["monetization_json"], []),
        "disclosure": row["disclosure"],
        "photos": _load(row["photos_json"], []),
        "facts_to_verify": _load(row["facts_json"], []),
        "seo_keywords": _load(row["seo_keywords_json"], []),
        "image_placements": _load(row["image_placements_json"], []),
        "preflight": _load(row["preflight_json"], {}),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def get_post(post_id: int) -> dict[str, Any] | None:
    with _connect() as connection:
        row = connection.execute("SELECT * FROM posts WHERE id = ?", (post_id,)).fetchone()
    return _row_to_post(row) if row else None


def list_posts(limit: int = 50, search: str = "", status: str = "") -> list[dict[str, Any]]:
    safe_limit = max(1, min(int(limit), 200))
    clauses: list[str] = []
    params: list[Any] = []
    if search.strip():
        clauses.append("(title LIKE ? OR body LIKE ? OR notes LIKE ?)")
        query = f"%{search.strip()}%"
        params.extend([query, query, query])
    if status.strip():
        clauses.append("status = ?")
        params.append(status.strip())
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    with _connect() as connection:
        rows = connection.execute(
            f"SELECT * FROM posts {where} ORDER BY updated_at DESC, id DESC LIMIT ?",
            (*params, safe_limit),
        ).fetchall()
    return [_row_to_post(row) for row in rows]


def save_post(payload: dict[str, Any], post_id: int | None = None) -> dict[str, Any]:
    now = _now()
    title = str(payload.get("title", "")).strip()
    body = str(payload.get("body", "")).strip()
    values = (
        title,
        body,
        str(payload.get("notes", "")),
        str(payload.get("tone", "친근하고 정보적인")),
        str(payload.get("provider", "local")),
        payload.get("model"),
        str(payload.get("status", "review")),
        _dump(payload.get("monetization") or []),
        str(payload.get("disclosure", "")),
        _dump(payload.get("photos") or []),
        _dump(payload.get("facts_to_verify") or []),
        _dump(payload.get("seo_keywords") or []),
        _dump(payload.get("image_placements") or []),
        _dump(payload.get("preflight") or {}),
    )
    with _connect() as connection:
        if post_id is None:
            cursor = connection.execute(
                """
                INSERT INTO posts (
                    title, body, notes, tone, provider, model, status,
                    monetization_json, disclosure, photos_json, facts_json,
                    seo_keywords_json, image_placements_json, preflight_json,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (*values, now, now),
            )
            post_id = int(cursor.lastrowid)
        else:
            cursor = connection.execute(
                "SELECT id FROM posts WHERE id = ?",
                (post_id,),
            )
            if cursor.fetchone() is None:
                raise KeyError(f"post {post_id} not found")
            connection.execute(
                """
                UPDATE posts SET
                    title = ?, body = ?, notes = ?, tone = ?, provider = ?, model = ?, status = ?,
                    monetization_json = ?, disclosure = ?, photos_json = ?, facts_json = ?,
                    seo_keywords_json = ?, image_placements_json = ?, preflight_json = ?, updated_at = ?
                WHERE id = ?
                """,
                (*values, now, post_id),
            )
    saved = get_post(post_id)
    if saved is None:
        raise RuntimeError("saved post could not be reloaded")
    return saved


def delete_post(post_id: int) -> bool:
    with _connect() as connection:
        cursor = connection.execute("DELETE FROM posts WHERE id = ?", (post_id,))
    return cursor.rowcount > 0


init_db()
