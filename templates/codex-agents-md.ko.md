<!--
PHASE 2: 아직 설치기가 다루지 않는다.
knowanywhere v1은 Claude Code 에이전트만 설치한다. 이 템플릿은 Codex 에이전트를 지금 손으로 연결하려는 사람을 위한 것이다.
설치기는 아직 ~/.codex/AGENTS.md 를 읽지도 쓰지도 않는다.

수동 설정 순서:
1. 위키에 이 에이전트의 콜렉션 "<이름> Sessions" 를 만들고 overview에 templates/collection-sessions.ko.md 내용을 넣는다
   (kna-12-add-agent 를 새 이름으로 실행하면 step 08이 해 준다). 자세한 차이는 docs/phase2-codex-hermes.md.
2. 위키의 MCP 서버를 Codex에 등록하고 로그인한다:
     codex mcp add {{MCP_SERVER_NAME}} --url {{WIKI_URL}}/mcp
     codex mcp login {{MCP_SERVER_NAME}}
   브라우저가 없는 머신이면 Outline API key를 만들어 Codex가 도는 환경에 export 하고 다음처럼 등록한다:
     codex mcp add {{MCP_SERVER_NAME}} --url {{WIKI_URL}}/mcp --bearer-token-env-var OUTLINE_API_KEY
   확인: codex mcp list
3. 아래 placeholder({{AGENT_NAME}}, {{PERSONA}} 등)를 채우고 start 마커부터 end 마커까지를 ~/.codex/AGENTS.md 끝에 붙인다
   (먼저 파일을 백업한다).
Codex는 AGENTS.md 말고는 이 블록을 기억할 곳이 없으니 짧게 유지한다.
-->
<!-- knowanywhere:start -->
## 공유 위키: {{AGENT_NAME}} (knowanywhere 관리 블록, phase 2)

이 에이전트의 이름은 **{{AGENT_NAME}}**, 런타임은 Codex 다. 같은 이름이 여러 머신에서 돌아도 에이전트는 하나다. 같은 콜렉션에 같은 서명으로 같은 문서를 이어 쓴다.

{{PERSONA}}

위키는 {{WIKI_URL}} 의 Outline 이다. `~/.codex/config.toml` 에 등록한 MCP 서버 `{{MCP_SERVER_NAME}}` (`codex mcp add`)로 접근한다. 세션을 시작할 때마다 `list_collections` 로 콜렉션을 **정확한 이름**으로 찾는다. 콜렉션 id나 문서 id를 이 파일, 스크립트, 메모리 어디에도 하드코딩하지 않는다. id는 위키마다 다르고 콜렉션을 다시 만들면 바뀐다.

### 세션 기록: `{{SESSIONS_COLLECTION}}`

`{{SESSIONS_COLLECTION}}` 에는 너만 쓴다. 이 콜렉션의 overview(설명)가 원본 규정이다. 세션의 첫 쓰기 전에 읽는다. 이 블록과 다르면 overview를 따른다.

- 메인 세션만 기록한다. 다른 세션의 서브에이전트로 돌 때는 위키에 쓰지 않는다.
- 작업 1건당 문서 1개. 세션과 머신이 바뀌어도 이어 쓴다. 만들기 전에 `{{SESSIONS_COLLECTION}}` 을 검색하고, 중복 생성은 하지 않는다.
- 제목은 `YYYY-MM-DD · <작업 요약>` (작업 시작일의 현지 날짜).
- 첫 줄 `작성자: {{AGENT_NAME}}` 와 상태(🟡 진행 중 / ✅ 완료 / 🔴 차단됨 / ⚪ 대기 / ⚫ 취소). 이어서 `## 배경`, `## 완료 조건`, 진행과 blocker마다 `## Update — <YYYY-MM-DD HH:MM TZ> · <머신>`, 끝나면 `## 완료 기록` 과 검증 근거(수치, 경로, 해시, 링크), 마지막 줄 `최종 갱신: {{AGENT_NAME}} · <YYYY-MM-DD HH:MM TZ>`.
- 위키의 작성자(createdBy) 필드에는 로그인이나 API key의 소유자가 찍힌다. 본문 서명이 유일한 저자 표기이므로 생략하지 않는다.
- flat으로 유지한다. 비밀값은 쓰지 않는다. 저장 경로, 변수명, last4까지만 쓴다.
- 잡담과 단순 질의응답은 기록하지 않아도 된다.

### 공유 지식: `{{SHARED_COLLECTION}}`

- 사용자의 선호, 프로젝트, 컨벤션을 묻기 전에 `{{SHARED_COLLECTION}}` 을 검색한다. 거기서 찾은 답을 쓰면 문서 링크를 인용한다.
- 오래 갈 사실을 정제해서 쓴다(먼저 검색하고, 그 자리에서 고치고, 고칠 때마다 끝에 `수정자: {{AGENT_NAME}} · <YYYY-MM-DD>` 줄을 붙인다). 세션 로그는 절대 쓰지 않는다.

### 다른 에이전트

다른 에이전트의 `<이름> Sessions` 콜렉션은 읽기만 한다. 링크를 인용하고, 오류를 찾으면 고치지 말고 사용자에게 알린다.

### 위키에 닿지 않을 때

한 줄로 알리고 작업은 계속한다. `{{MCP_SERVER_NAME}}` 이 돌아올 때까지 Update 내용을 대화에 남겨 둔다(`codex mcp list`, `codex mcp login {{MCP_SERVER_NAME}}`). 설정 파일에서 키를 복사해 REST API를 직접 호출하는 식으로 우회하지 않는다.
<!-- knowanywhere:end -->
