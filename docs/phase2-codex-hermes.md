# Phase 2: Codex·Hermes 에이전트

v1 인스톨러는 Claude Code 에이전트와 선택적 Discord 브리지만 설치하고 검증한다. Codex 나 Hermes 로 도는 에이전트(예:
Codex 의 지수, GCP VM 에서 Hermes 로 도는 제니)도 같은 위키를 같은 규칙으로 쓸 수 있지만, 지금은 아래를 손으로 한다.
이 문서는 Claude Code 에이전트와 비교해 무엇이 달라지는지만 적는다.

## 그대로인 것

- **위키 쪽 전부.** 에이전트마다 `<이름> Sessions` 콜렉션 하나, 모두가 쓰는 공유 콜렉션 하나, 콜렉션 설명이 원본 규정.
  작업 1건당 문서 1개, 만들기 전에 검색, `작성자:` 서명, `## Update — <시각> · <머신>`, 비밀값 금지.
- **이름이 정체성이다.** Codex 에이전트는 Claude Code 에이전트와 다른 이름과 다른 콜렉션을 갖는다. 같은 Codex 에이전트를
  여러 머신에서 돌리면 그 머신들에서 같은 이름을 쓴다.
- **서명이 유일한 저자 표기다.** 위키의 작성자 필드에는 로그인이나 API key 의 소유자가 찍힌다. 에이전트들이 같은 계정을
  쓰므로 본문 서명이 없으면 누가 썼는지 알 수 없다.
- **콜렉션 만들기.** 이미 설치한 Claude Code 에이전트가 `kna-12-add-agent` 에서 새 이름으로 콜렉션을 만들어 줄 수 있다.

## 달라지는 것

| 항목 | Claude Code (v1) | Codex | Hermes형 에이전트 |
|---|---|---|---|
| 규칙이 사는 곳 | `~/.claude/CLAUDE.md` 의 관리 블록(9단계가 넣는다) | `~/.codex/AGENTS.md` 에 사용자가 붙인다 | 그 런타임의 시스템 프롬프트나 페르소나 파일 |
| 규칙 템플릿 | `templates/claude-md-block.<lang>.md` | `templates/codex-agents-md.<lang>.md` | Codex 템플릿을 고쳐 쓴다(Codex 전용 줄을 뺀다) |
| 위키 MCP 등록 | `claude mcp add --transport http --scope user ...` + `/mcp` OAuth | `codex mcp add <이름> --url https://wiki.example.com/mcp` + `codex mcp login <이름>` | 그 런타임의 MCP 설정. 서버에서 돌면 브라우저가 없으므로 Outline API key |
| 브라우저 없는 머신 | API key 를 `--header` 로 | `--bearer-token-env-var OUTLINE_API_KEY` 와 그 환경 변수 | API key |
| Discord | `AGENT_BACKEND=claude` | 같은 브리지의 `AGENT_BACKEND=codex`(`bridge/discord/.env.second-agent.example`) | 자기 Discord 연동 |
| 인스톨러가 검증하나 | 예 | 아니오 | 아니오 |

Codex 에서 따로 알아 둘 점:

- Codex 는 system prompt 를 받지 않고 작업 디렉터리의 `AGENTS.md` 와 `~/.codex/AGENTS.md` 를 읽는다. 규칙 블록을 짧게
  유지한다.
- Discord 브리지의 Codex 백엔드는 페르소나를 새 세션의 첫 프롬프트에만 붙인다. 이어지는 턴에는 붙이지 않는다.
- Claude 봇과 Codex 봇을 한 브리지 폴더에서 같이 돌리면 Discord 애플리케이션과 토큰을 따로 두고 `SESSIONS_FILE` 을 따로
  둔다(`./sessions.second-agent.json`). codex `thread_id` 와 Claude `session_id` 는 형식이 다르다.
- `CODEX_SANDBOX=danger-full-access` 는 Claude 쪽 `bypassPermissions` 와 같은 무게다. `ALLOWED_USER_IDS` 규칙이 똑같이
  적용된다.

Hermes형(서버에서 상시 도는 자체 에이전트 런타임)에서 따로 알아 둘 점:

- 설정 파일 이름과 형식은 그 런타임의 문서를 따른다. 이 레포는 Hermes 설정을 다루지 않았고 검증하지 않았다.
- 서버에서 돌면 위키 MCP 는 Outline API key 로 붙는다. 키는 그 서버의 mode 600 파일에만 두고, 에이전트가 그 파일을
  읽을 수 있다는 점을 감안해 키 이름을 에이전트별로 만든다(`hermes-<머신>`). 문제가 생기면 위키 Settings → API & Access
  에서 그 키만 지운다.
- 위키와 같은 VM 에서 돌리면 `kna-10-discord` 의 VM 보안 메모(전용 사용자, metadata 서버 차단)가 그대로 해당한다.

## 손으로 붙이는 순서 (Codex)

1. 이미 설치한 머신에서 `kna-12-add-agent` → "Codex·Hermes" → 새 이름으로 콜렉션을 만든다.
2. 같은 스킬이 `templates/codex-agents-md.<lang>.md` 를 새 이름과 페르소나로 렌더링해 `.knowanywhere/codex-agents-md.md`
   를 만든다. 파일 맨 위 주석이 순서다.
3. Codex 가 도는 머신에서 `~/.codex/AGENTS.md` 를 백업하고, 렌더링한 파일의 `<!-- knowanywhere:start -->` 부터
   `<!-- knowanywhere:end -->` 까지를 끝에 붙인다.
4. `codex mcp add outline --url https://wiki.example.com/mcp`, `codex mcp login outline`, `codex mcp list` 로 확인한다.
5. Codex 세션을 새로 열고 "이 설치에 대한 첫 세션 문서를 규칙대로 써라" 라고 한다. `<이름> Sessions` 에 `작성자: <이름>`
   으로 시작하는 문서가 생기면 끝이다. 그 뒤 설치한 머신의 state 에 `agent-add` 로 `kind: "codex"` 항목을 더한다.

다음 버전의 인스톨러가 이 순서를 단계 스킬로 옮긴다.
