# Sol 오케스트레이션 구조

## 역할 분리

```text
사진·메모·원문 링크
        ↓
값싼 결정론적 preflight (제목/길이/개인정보/고지문)
        ↓
Sol 오케스트레이터 역할
   ┌────┼───────────┐
   ↓    ↓           ↓
근거 큐레이터  정책 가디언  초안 라이터
   └────┼───────────┘
        ↓
편집 가능한 초안 + 확인 필요 사실 + 고지문 + 정책 결과
        ↓
사람 검토 → 직접 게시/채널별 제출
```

OpenAI Agents SDK의 “agents as tools” 방식으로 Sol 역할의 오케스트레이터가 최종 조율권을 유지하고, 서로 다른 계약이 필요한 근거·정책·문장 생성을 분리한다. 현재 사용자 API 프로젝트에서 확인된 모델을 사용하며, `BLOGPOST_ORCHESTRATOR_MODEL` 기본값은 `gpt-5.6-sol`, 일반적인 최종 보정 모델은 `gpt-5.6-luna`다. 짧은 일반 포스트는 결정론적 preflight만 통과해도 되고, 새로운 사실 조사나 복잡한 캠페인 브리프가 있을 때만 specialist를 호출한다. [Agents SDK 가이드](https://developers.openai.com/api/docs/guides/agents), [오케스트레이션](https://developers.openai.com/api/docs/guides/agents/orchestration)

## 토큰 절약 규칙

1. 입력을 사진 설명·메모·원문 URL·사용자 말투 프로필로 정규화해 한 번만 전달한다.
2. 제목 누락, 짧은 본문, 전화번호, 고지문 누락은 로컬 체크로 먼저 차단한다.
3. 정책 팩과 채널 자격은 날짜가 있는 캐시로 관리하고, 바뀔 때만 정책 가디언을 다시 부른다.
4. 글 전체를 매번 재생성하지 말고 사용자가 선택한 문단만 재작성한다.
5. 출력 스키마를 고정해 `draft`, `facts_to_verify`, `disclosure`, `policy_findings`만 반환한다.
6. 결제·게시·외부 계정 변경은 human approval이 있어야 실행한다. Agents SDK의 guardrail/approval 설계를 따른다. [Guardrails & human review](https://developers.openai.com/api/docs/guides/agents/guardrails-approvals)

## M1 초기 설치 전략

프론트엔드는 Node/Vite, 오케스트레이터는 Python 표준 라이브러리와 선택적 `openai-agents`만 사용한다. API 키가 없어도 `python agent.py --demo`와 `python main.py`로 로컬 검증이 가능하다. 실제 유료 API 모델을 켤 때만 프로젝트 루트의 무시되는 `.env.local`에 키를 저장하고, 프론트엔드로 전달하지 않는다.
