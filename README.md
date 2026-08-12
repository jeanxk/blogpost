# 블로그포스트

사진과 메모를 검토 가능한 한국어 블로그 초안으로 바꾸고, 제휴·협찬 표기와 수익화 채널 연결을 함께 관리하는 개인용 로컬 반자동 도구입니다. 기본 생성은 Ollama 로컬 모델을 사용하고, 사용자가 AI 모드에서 명시적으로 선택한 경우에만 유료 OpenAI API를 호출합니다.

## 실제 운용 실행

운영판은 React 빌드 파일과 API를 한 프로세스로 제공하고, 포스트를 `data/blogpost.sqlite3`에 저장합니다. 매번 개발 서버를 두 개 띄울 필요 없이 Finder에서 [`start_blogpost.command`](start_blogpost.command)를 더블클릭하세요. 빌드 후 브라우저가 `http://127.0.0.1:8000`으로 열립니다.

화면의 `저장` 버튼으로 현재 제목·본문·사진·메모·모델·검수 결과를 저장하고, `포스트 라이브러리`에서 재실행 후에도 다시 열 수 있습니다. 데이터베이스와 WAL 파일은 `.gitignore`로 제외됩니다.

터미널에서 실행하려면:

```bash
./start_blogpost.command
# 또는
npm run operate
```

운영판을 종료하면 해당 터미널에서 `Ctrl+C`를 누릅니다. 이 개인용 버전은 기본적으로 `127.0.0.1`에만 바인딩되어 외부에 공개되지 않습니다.

## 개발 실행

```bash
npm install
npm run dev
```

기본 화면은 `http://localhost:5173`에서 열립니다. 네이버 자동 대량 발행은 지원하지 않습니다. 네이버 블로그 오픈 API 글쓰기가 종료된 정책 환경을 반영해, 초안을 수정하고 클립보드로 복사한 뒤 사람이 직접 게시하는 흐름입니다. 실제 사용은 위의 운영판 실행을 권장합니다.

## API 및 저장소

개발 화면에서 `초안 생성하기`를 연결하려면 별도 터미널에서 API를 실행합니다. 운영판에서는 `main.py`가 빌드된 화면과 API를 함께 제공합니다.

```bash
python3 main.py
```

Codex 데스크톱에서 macOS Xcode 라이선스 메시지가 나오면 README 아래의 번들 Python 경로를 사용합니다. Ollama가 없거나 모델이 설치되지 않은 상태에서도 API는 안전한 결정론적 초안을 반환하며, 유료 provider를 자동으로 호출하지 않습니다.

## Provider 모드

- `로컬 무료 · Ollama`: `qwen3:8b`로 제목·본문·SEO 구조를 만들고, 업로드한 로컬 이미지가 있으면 `gemma3:4b`로 확인 가능한 이미지 관찰을 추출합니다.
- `Luna API 보정`: 사용자가 드롭다운에서 직접 선택했을 때만 사용자 API 프로젝트에서 확인된 `gpt-5.6-luna`를 호출합니다. Sol 오케스트레이션을 사용할 때는 `gpt-5.6-sol`을 사용합니다. ChatGPT/Codex 구독료와 API 사용료는 별도이므로 Luna 호출은 Platform에서 별도 과금됩니다.
- 모든 결과는 `facts_to_verify`와 규정 점검을 포함하고, 네이버 게시 전 사람의 확인이 필요합니다.

API 키는 프로젝트 루트의 무시되는 `.env.local`에만 저장합니다.

```env
OPENAI_API_KEY=여기에_새로_발급한_키
```

키는 채팅이나 프론트엔드 코드에 넣지 마세요. `.env.local`에 주석(`#`) 없이 한 줄로 저장하고 `Cmd+S`로 저장한 뒤 백엔드를 다시 시작하세요. 이미 다른 곳에 노출된 키는 Platform에서 폐기하고 새 키를 발급해야 합니다. 모델명과 Ollama 주소는 다음 환경변수로 바꿀 수 있습니다.

```bash
BLOGPOST_OPENAI_MODEL=gpt-5.6-luna
BLOGPOST_ORCHESTRATOR_MODEL=gpt-5.6-sol
BLOGPOST_OLLAMA_TEXT_MODEL=qwen3:8b
BLOGPOST_OLLAMA_VISION_MODEL=gemma3:4b
```

## 로컬 API와 Sol 데모

```bash
python3 agent.py --demo
python3 main.py
```

Codex 데스크톱의 새 M1 환경에서 기본 `python3`가 없거나 Xcode 라이선스에 걸리면, 번들 런타임을 사용하세요.

```bash
PYTHON=/Users/mvpstuido/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3
$PYTHON agent.py --demo
$PYTHON main.py
```

API는 `GET /health`, `GET /api/posts`, `GET /api/posts/:id`, `POST /api/validate`, `POST /api/draft`, `POST /api/posts`, `PUT /api/posts/:id`를 제공합니다. `POST /api/draft`는 생성 결과를 검토 상태로 자동 저장하고, `PUT /api/posts/:id`는 편집 후 저장을 담당합니다. `POST /api/draft`의 `provider` 값은 `local` 또는 `openai`이며, 기본값은 `local`입니다. `openai` provider가 실제로 호출하는 모델은 `gpt-5.6-luna`입니다. 이전 빌드의 `luna` 값도 호환 별칭으로 처리합니다. 실제 Agents SDK 흐름을 사용할 때는 다음처럼 별도 환경에서 설치합니다.

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
python3 agent.py --live
```

`agent.py --status`로 키 값 없이 provider 준비 상태를 확인할 수 있습니다. API 키는 파일에 기록하지 마세요. 실제 앱 호출은 `.env.local`을 백엔드가 읽습니다. 명시적인 API 테스트는 `agent.py --openai`로 실행할 수 있지만, 호출마다 Platform 사용료가 발생할 수 있으므로 기본은 `--local`입니다.

## 화면 구성

- 오늘의 작업: 사진 업로드, 메모, 톤앤매너, 편집 가능한 초안
- 포스트 라이브러리: 초안·검토·게시 상태
- 수익화: Brand Connect, Shopping Connect, Coupang, AdSense, Toss 확장 슬롯
- 규정 점검: 경제적 이해관계 표기, 개인정보, 저작권, 과장 표현 확인

시장·정책 근거와 영상 흐름은 [`docs/video-analysis.md`](docs/video-analysis.md), [`docs/monetization-research.md`](docs/monetization-research.md), [`docs/agent-architecture.md`](docs/agent-architecture.md)에 정리했습니다.

## Codex 플러그인

재사용 가능한 플러그인은 `/Users/mvpstuido/plugins/blogpost-automation`에 생성했습니다. `blogpost-orchestrator` 스킬은 사진·메모 기반 초안 작성, 근거 분리, 광고표시, 사람 검토를 기본 라우팅으로 사용합니다.
