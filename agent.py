"""Provider-neutral orchestration for the personal 블로그포스트 workspace.

The default path is local-first: deterministic checks always run, Ollama is
used when the requested local models are installed, and the paid OpenAI API
provider is only called when the user explicitly chooses it. Secrets are loaded from the
ignored ``.env.local`` file without ever being printed.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

try:
    from agents import Agent, Runner
except ImportError:  # The local demo must still work on a fresh M1 laptop.
    Agent = None  # type: ignore[assignment]
    Runner = None  # type: ignore[assignment]


ROOT = Path(__file__).resolve().parent


def load_local_env(path: Path = ROOT / ".env.local") -> None:
    """Load simple KEY=VALUE pairs without logging their values."""

    if not path.exists():
        return
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return
    for raw in lines:
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        if line.startswith("export "):
            line = line[7:].lstrip()
        name, value = line.split("=", 1)
        name = name.strip()
        if name and name not in os.environ:
            os.environ[name] = value.strip().strip("'\"")


load_local_env()

OLLAMA_URL = os.getenv("BLOGPOST_OLLAMA_URL", "http://127.0.0.1:11434")
OLLAMA_TEXT_MODEL = os.getenv("BLOGPOST_OLLAMA_TEXT_MODEL", "qwen3:8b")
OLLAMA_VISION_MODEL = os.getenv("BLOGPOST_OLLAMA_VISION_MODEL", "gemma3:4b")
OPENAI_MODEL = os.getenv("BLOGPOST_OPENAI_MODEL", "gpt-5.6-luna")
ORCHESTRATOR_MODEL = os.getenv("BLOGPOST_ORCHESTRATOR_MODEL", "gpt-5.6-sol")
DISCLOSURE = "이 포스팅은 제휴 링크를 포함할 수 있으며, 구매 시 일정 수수료를 받을 수 있습니다."


def _request_json(url: str, payload: dict[str, Any] | None = None, timeout: float = 30.0) -> dict[str, Any]:
    body = None
    headers = {"Accept": "application/json"}
    if payload is not None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = Request(url, data=body, headers=headers, method="POST" if body else "GET")
    with urlopen(request, timeout=timeout) as response:
        raw = response.read().decode("utf-8")
    decoded = json.loads(raw)
    if not isinstance(decoded, dict):
        raise ValueError("provider returned a non-object response")
    return decoded


def _safe_provider_error(error: Exception) -> str:
    if isinstance(error, HTTPError):
        try:
            detail = error.read().decode("utf-8", errors="replace")
            parsed = json.loads(detail)
            message = parsed.get("error", {}).get("message") if isinstance(parsed, dict) else None
            if message:
                return str(message)[:500]
        except (OSError, ValueError, json.JSONDecodeError):
            pass
        return f"provider returned HTTP {error.code}"
    if isinstance(error, (URLError, TimeoutError)):
        return "provider is not reachable"
    return str(error)[:500]


def _ollama_models() -> tuple[bool, list[str]]:
    try:
        response = _request_json(f"{OLLAMA_URL}/api/tags", timeout=1.5)
    except (OSError, ValueError, HTTPError, URLError, TimeoutError):
        return False, []
    models = response.get("models") or []
    names = [str(item.get("name")) for item in models if isinstance(item, dict) and item.get("name")]
    return True, names


def provider_status() -> dict[str, Any]:
    """Return safe capability metadata; never return credentials."""

    load_local_env()
    reachable, models = _ollama_models()
    text_ready = OLLAMA_TEXT_MODEL in models
    vision_ready = OLLAMA_VISION_MODEL in models
    api_ready = bool(os.getenv("OPENAI_API_KEY", "").strip())
    return {
        "default_mode": "local",
        "ollama": {
            "reachable": reachable,
            "text_model": OLLAMA_TEXT_MODEL,
            "text_ready": text_ready,
            "vision_model": OLLAMA_VISION_MODEL,
            "vision_ready": vision_ready,
            "models": models,
        },
        "openai": {"configured": api_ready, "model": OPENAI_MODEL},
        "safety": {
            "paid_calls_require_explicit_mode": True,
            "automatic_publishing": False,
        },
    }


def validate_draft(payload: dict[str, Any]) -> dict[str, Any]:
    """Run cheap, repeatable checks before spending an LLM call."""

    title = str(payload.get("title", "")).strip()
    body = str(payload.get("body", "")).strip()
    sources = payload.get("sources") or []
    monetization = payload.get("monetization") or []
    disclosure = str(payload.get("disclosure", "")).strip()
    findings: list[dict[str, str]] = []

    if not title:
        findings.append({"level": "block", "code": "missing_title", "message": "제목을 입력하세요."})
    if len(body) < 160:
        findings.append({"level": "warn", "code": "short_body", "message": "본문이 짧습니다. 직접 경험·근거를 보강하세요."})
    if not sources:
        findings.append({"level": "warn", "code": "missing_sources", "message": "가격·위치·스펙을 확인할 출처를 연결하세요."})
    if monetization and not disclosure:
        findings.append({"level": "block", "code": "missing_disclosure", "message": "제휴·협찬 링크가 있어 경제적 이해관계 표기가 필요합니다."})
    if re.search(r"(무조건|100%|최저가 보장|효과 보장|절대 후회 없음)", body):
        findings.append({"level": "warn", "code": "absolute_claim", "message": "절대적·과장 표현을 실제 근거와 함께 다시 확인하세요."})
    if re.search(r"\b(010[- .]?\d{3,4}[- .]?\d{4})\b", body):
        findings.append({"level": "block", "code": "personal_data", "message": "본문에서 전화번호로 보이는 개인정보를 제거하세요."})

    blocks = sum(item["level"] == "block" for item in findings)
    score = max(0, 100 - blocks * 28 - sum(item["level"] == "warn" for item in findings) * 8)
    return {
        "score": score,
        "ready_for_human_review": blocks == 0,
        "findings": findings,
        "disclosure_template": DISCLOSURE,
        "policy_note": "네이버 자동 대량 발행은 지원하지 않습니다. 검토 후 사람이 직접 게시합니다.",
    }


def _strip_model_wrappers(text: str) -> str:
    cleaned = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL | re.IGNORECASE).strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", cleaned, flags=re.IGNORECASE | re.DOTALL).strip()
    return cleaned


def _parse_json_output(text: str) -> dict[str, Any] | None:
    cleaned = _strip_model_wrappers(text)
    try:
        parsed = json.loads(cleaned)
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        start, end = cleaned.find("{"), cleaned.rfind("}")
        if start >= 0 and end > start:
            try:
                parsed = json.loads(cleaned[start : end + 1])
                return parsed if isinstance(parsed, dict) else None
            except json.JSONDecodeError:
                return None


def _ollama_chat(model: str, messages: list[dict[str, Any]], *, json_mode: bool = True) -> tuple[str, dict[str, Any]]:
    payload: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "stream": False,
        "options": {"temperature": 0.55, "num_ctx": 8192},
    }
    if json_mode:
        payload["format"] = "json"
    response = _request_json(f"{OLLAMA_URL}/api/chat", payload, timeout=180.0)
    message = response.get("message") or {}
    content = message.get("content", "") if isinstance(message, dict) else ""
    if not isinstance(content, str):
        content = json.dumps(content, ensure_ascii=False)
    return content, response


def _image_data_url_to_base64(source: str) -> str | None:
    if not isinstance(source, str) or not source.startswith("data:image/") or "," not in source:
        return None
    return source.split(",", 1)[1]


def _describe_local_images(request: dict[str, Any], models: list[str]) -> list[str]:
    if OLLAMA_VISION_MODEL not in models:
        return []
    photos = request.get("photos") or []
    if not isinstance(photos, list):
        return []
    image_data = [_image_data_url_to_base64(item.get("src", "")) for item in photos if isinstance(item, dict)]
    image_data = [item for item in image_data if item][:3]
    if not image_data:
        return []
    prompt = (
        "이미지에서 실제로 확인 가능한 내용만 한국어로 짧게 설명하세요. "
        "장소·브랜드·가격·방문 경험을 추측하지 말고, 확인할 수 없는 항목은 생략하세요. "
        "JSON 객체 {\"observations\":[\"...\"]}만 반환하세요."
    )
    try:
        content, _ = _ollama_chat(
            OLLAMA_VISION_MODEL,
            [{"role": "user", "content": prompt, "images": image_data}],
            json_mode=True,
        )
        parsed = _parse_json_output(content) or {}
        observations = parsed.get("observations") or []
        return [str(item).strip() for item in observations if str(item).strip()][:8]
    except (OSError, ValueError, HTTPError, URLError, TimeoutError):
        return []


def _fallback_draft(request: dict[str, Any]) -> dict[str, Any]:
    notes = str(request.get("notes") or request.get("body") or "").strip()
    title = str(request.get("title") or "사진으로 기록한 오늘의 이야기").strip()
    tone = str(request.get("tone") or "친근하고 정보적인")
    if not notes:
        notes = "사진과 메모를 바탕으로 직접 확인한 내용을 정리해 보세요."
    body = (
        f"{notes}\n\n"
        f"이번 글은 {tone} 톤으로 정리한 검토용 초안입니다.\n\n"
        "사진과 메모에서 확인되는 내용만 바탕으로 구성했으며, 가격·운영시간·위치·상품 스펙은 "
        "게시 전에 공식 출처에서 다시 확인해 주세요.\n\n"
        "[직접 경험과 추가 정보 입력]\n"
        "방문 시점, 실제로 좋았던 점, 아쉬웠던 점, 독자가 알아두면 좋은 팁을 보강하면 글의 신뢰도가 높아집니다."
    )
    return {"title": title, "body": body, "facts_to_verify": ["가격·운영시간·위치·상품 스펙", "사진 속 장소·브랜드명"]}


def _normalize_draft(parsed: dict[str, Any] | None, request: dict[str, Any]) -> dict[str, Any]:
    fallback = _fallback_draft(request)
    parsed = parsed or {}
    title = str(parsed.get("title") or fallback["title"]).strip()
    body = str(parsed.get("body") or fallback["body"]).strip()
    facts = parsed.get("facts_to_verify") or fallback["facts_to_verify"]
    if not isinstance(facts, list):
        facts = [str(facts)]
    return {
        "title": title,
        "body": body,
        "facts_to_verify": [str(item).strip() for item in facts if str(item).strip()][:12],
        "seo_keywords": [str(item).strip() for item in (parsed.get("seo_keywords") or []) if str(item).strip()][:12],
        "image_placements": [str(item).strip() for item in (parsed.get("image_placements") or []) if str(item).strip()][:8],
    }


def _draft_messages(request: dict[str, Any], image_observations: list[str]) -> list[dict[str, str]]:
    brief = {
        "title_hint": request.get("title", ""),
        "notes": request.get("notes", ""),
        "tone": request.get("tone", "친근하고 정보적인"),
        "image_observations": image_observations,
        "monetization_channels": request.get("monetization", []),
    }
    system = (
        "당신은 한국어 블로그 편집자입니다. 입력에 없는 방문 경험, 가격, 위치, 스펙, 수치를 만들지 마세요. "
        "확인되지 않은 내용은 facts_to_verify에 넣고 본문에서는 단정하지 마세요. "
        "키워드를 부자연스럽게 반복하지 말고, 사람이 편집할 수 있는 자연스러운 초안을 작성하세요. "
        "제휴 채널이 있으면 광고·제휴 고지는 삭제하지 말고 별도 필드로 남기세요. "
        "다음 JSON 객체만 반환하세요: title, body, facts_to_verify, seo_keywords, image_placements."
    )
    return [{"role": "system", "content": system}, {"role": "user", "content": json.dumps(brief, ensure_ascii=False)}]


def generate_local_draft(request: dict[str, Any]) -> dict[str, Any]:
    reachable, models = _ollama_models()
    if not reachable or OLLAMA_TEXT_MODEL not in models:
        draft = _normalize_draft(None, request)
        return {
            "draft": draft,
            "provider": "local-fallback",
            "model": None,
            "usage": None,
            "message": "Ollama가 실행 중이 아니거나 Qwen3 모델이 설치되지 않아 안전한 로컬 초안을 사용했습니다.",
            "image_observations": [],
        }

    observations = _describe_local_images(request, models)
    try:
        content, response = _ollama_chat(OLLAMA_TEXT_MODEL, _draft_messages(request, observations), json_mode=True)
        draft = _normalize_draft(_parse_json_output(content), request)
        return {
            "draft": draft,
            "provider": "ollama",
            "model": OLLAMA_TEXT_MODEL,
            "usage": response.get("prompt_eval_count") or response.get("eval_count"),
            "message": "Ollama 로컬 모델로 초안을 만들었습니다.",
            "image_observations": observations,
        }
    except (OSError, ValueError, HTTPError, URLError, TimeoutError) as error:
        draft = _normalize_draft(None, request)
        return {
            "draft": draft,
            "provider": "local-fallback",
            "model": OLLAMA_TEXT_MODEL,
            "usage": None,
            "message": f"Ollama 응답을 받지 못해 안전한 로컬 초안을 사용했습니다: {_safe_provider_error(error)}",
            "image_observations": observations,
        }


def _openai_text(response: dict[str, Any]) -> str:
    if isinstance(response.get("output_text"), str) and response["output_text"].strip():
        return response["output_text"]
    chunks: list[str] = []
    for item in response.get("output") or []:
        if not isinstance(item, dict):
            continue
        for content in item.get("content") or []:
            if isinstance(content, dict) and isinstance(content.get("text"), str):
                chunks.append(content["text"])
    return "\n".join(chunks)


def generate_openai_draft(request: dict[str, Any], image_observations: list[str] | None = None) -> dict[str, Any]:
    load_local_env()
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("OpenAI API 키가 저장되지 않았습니다. 프로젝트의 .env.local을 확인하세요.")
    observations = image_observations or []
    brief = {
        "title_hint": request.get("title", ""),
        "notes": request.get("notes", ""),
        "tone": request.get("tone", "친근하고 정보적인"),
        "image_observations": observations,
        "monetization_channels": request.get("monetization", []),
    }
    prompt = (
        "한국어 블로그의 최종 편집 초안을 만드세요. 반복적인 글쓰기 작업이므로 짧고 정확하게 처리합니다. "
        "입력에 없는 경험·가격·위치·스펙을 만들지 말고 확인 필요 항목으로 분리하세요. "
        "제휴·광고 문구를 숨기지 말고 본문과 별도 필드로 유지하세요. "
        "다음 JSON 객체만 반환하세요: title, body, facts_to_verify, seo_keywords, image_placements.\n\n"
        + json.dumps(brief, ensure_ascii=False)
    )
    payload = {
        "model": OPENAI_MODEL,
        "input": [{"role": "user", "content": [{"type": "input_text", "text": prompt}]}],
        "text": {"format": {"type": "json_object"}},
        "reasoning": {"effort": "low"},
        "max_output_tokens": 1200,
        "store": False,
    }
    request_obj = Request(
        "https://api.openai.com/v1/responses",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request_obj, timeout=120.0) as response:
            raw = response.read().decode("utf-8")
        result = json.loads(raw)
        if not isinstance(result, dict):
            raise ValueError("OpenAI returned a non-object response")
        draft = _normalize_draft(_parse_json_output(_openai_text(result)), request)
        usage = result.get("usage") if isinstance(result.get("usage"), dict) else {}
        return {
            "draft": draft,
            "provider": "openai",
            "model": OPENAI_MODEL,
            "usage": usage,
            "message": "OpenAI API로 최종 보정 초안을 만들었습니다. 사용량은 Platform에서 확인하세요.",
            "image_observations": observations,
        }
    except (OSError, ValueError, HTTPError, URLError, TimeoutError, json.JSONDecodeError) as error:
        raise RuntimeError(f"OpenAI API 요청에 실패했습니다: {_safe_provider_error(error)}") from error


def generate_draft(request: dict[str, Any], provider: str = "local") -> dict[str, Any]:
    """Generate one editable draft. Paid providers are never selected implicitly."""

    if provider == "luna":  # Backward-compatible alias for the earlier UI build.
        provider = "openai"
    provider = provider if provider in {"local", "openai"} else "local"
    if provider == "local":
        result = generate_local_draft(request)
    else:
        result = generate_openai_draft(request)
    draft_payload = {
        "title": result["draft"]["title"],
        "body": result["draft"]["body"],
        "sources": request.get("sources") or [],
        "monetization": request.get("monetization") or [],
        "disclosure": request.get("disclosure") or (DISCLOSURE if request.get("monetization") else ""),
    }
    result["preflight"] = validate_draft(draft_payload)
    result["facts_to_verify"] = result["draft"].get("facts_to_verify", [])
    return result


def demo_request() -> dict[str, Any]:
    return {
        "title": "강릉 주문진 여행 코스 추천 | 바다 산책, 카페, 맛집까지",
        "notes": "주문진 해변을 걷고 창가가 예쁜 카페에서 쉬어간 여행 기록입니다.",
        "body": "주문진 해변을 걷고 창가가 예쁜 카페에서 쉬어간 여행 기록입니다. 방문 날짜와 사진 속 장소를 확인한 뒤 동선과 메뉴 정보를 정리하세요.",
        "tone": "친근하고 정보적인",
        "sources": ["https://picpo.app/"],
        "monetization": ["naver-shopping-connect"],
        "disclosure": DISCLOSURE,
        "photos": [],
    }


def build_sol_agent() -> Any:
    """Create Sol and bounded specialists for optional developer workflows."""

    if Agent is None:
        raise RuntimeError("openai-agents가 설치되지 않았습니다. `pip install openai-agents` 후 다시 실행하세요.")

    evidence_curator = Agent(
        name="Evidence Curator",
        model=ORCHESTRATOR_MODEL,
        instructions=(
            "사용자가 제공한 URL·메모·사진 설명만 근거로 사실 후보를 정리한다. "
            "확인하지 못한 가격, 위치, 방문 경험, 수치를 만들지 말고 [확인 필요]로 표시한다. "
            "결과는 짧은 JSON 형태로 반환한다."
        ),
    )
    policy_guardian = Agent(
        name="Policy Guardian",
        model=ORCHESTRATOR_MODEL,
        instructions=(
            "네이버 블로그/브랜드커넥트/쇼핑커넥트, 공정위 경제적 이해관계 표시, "
            "쿠팡 파트너스, AdSense의 기본 금지사항을 점검한다. "
            "제휴·협찬이 있으면 눈에 잘 띄는 고지문을 제안하고, 자동 게시를 승인하지 않는다."
        ),
    )
    draft_writer = Agent(
        name="Draft Writer",
        model=ORCHESTRATOR_MODEL,
        instructions=(
            "사진·메모와 근거 후보를 바탕으로 사람이 편집할 수 있는 자연스러운 한국어 초안을 쓴다. "
            "경험을 지어내지 않고, 과장·키워드 반복·문장 템플릿 냄새를 줄인다. "
            "제목, 소제목, 본문, 이미지 위치, 확인 필요 항목을 구조화한다."
        ),
    )
    return Agent(
        name="Sol Orchestrator",
        model=ORCHESTRATOR_MODEL,
        instructions=(
            "당신은 블로그포스트의 총괄 편집자 Sol이다. 한 번의 요청에서 먼저 입력을 정리하고, "
            "evidence_curator와 policy_guardian을 필요할 때만 호출한 뒤 draft_writer 결과를 조율한다. "
            "최종 결과는 원고와 별도로 facts_to_verify, disclosure, policy_findings를 포함한다. "
            "검증 전 내용은 단정하지 않으며, 네이버에 자동 게시하거나 인위적 트래픽을 만들지 않는다. "
            "짧고 구조화된 출력으로 토큰을 아낀다."
        ),
        tools=[
            evidence_curator.as_tool(tool_name="curate_evidence", tool_description="입력 자료에서 확인된 사실과 확인 필요 사실을 분리합니다."),
            policy_guardian.as_tool(tool_name="check_policies", tool_description="수익화·광고표시·게시 방식의 정책 리스크를 점검합니다."),
            draft_writer.as_tool(tool_name="write_editable_draft", tool_description="근거를 벗어나지 않는 편집 가능한 한국어 초안을 씁니다."),
        ],
    )


async def run_live(request: dict[str, Any]) -> str:
    if Runner is None:
        raise RuntimeError("openai-agents가 설치되지 않았습니다. `pip install openai-agents` 후 다시 실행하세요.")
    preflight = validate_draft(request)
    prompt = json.dumps({"request": request, "preflight": preflight}, ensure_ascii=False)
    result = await Runner.run(build_sol_agent(), prompt)
    return str(result.final_output)


def main() -> None:
    parser = argparse.ArgumentParser(description="블로그포스트 provider 오케스트레이터")
    parser.add_argument("--demo", action="store_true", help="API 키 없이 결정론적 점검 결과 출력")
    parser.add_argument("--local", action="store_true", help="Ollama 로컬 provider 실행")
    parser.add_argument("--openai", "--luna", dest="openai", action="store_true", help="명시적으로 OpenAI API 실행")
    parser.add_argument("--live", action="store_true", help="선택적 Agents SDK Sol 실행")
    parser.add_argument("--status", action="store_true", help="provider 상태를 안전한 메타데이터로 출력")
    parser.add_argument("--json", type=Path, help="요청 JSON 파일")
    args = parser.parse_args()

    request = demo_request()
    if args.json:
        request = json.loads(args.json.read_text(encoding="utf-8"))
    if args.status:
        print(json.dumps(provider_status(), ensure_ascii=False, indent=2))
        return
    if args.live:
        print(asyncio.run(run_live(request)))
        return
    if args.openai:
        print(json.dumps(generate_draft(request, "openai"), ensure_ascii=False, indent=2))
        return
    if args.local:
        print(json.dumps(generate_draft(request, "local"), ensure_ascii=False, indent=2))
        return
    if args.demo:
        print(json.dumps({"request": request, "preflight": validate_draft(request)}, ensure_ascii=False, indent=2))
        return
    parser.error("--demo, --local, --openai, --live 또는 --status 중 하나를 지정하세요.")


if __name__ == "__main__":
    main()
