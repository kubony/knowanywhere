<!--
Discord 봇용 위키 규칙 요약. kna-10-discord 가 managed-block.mjs render 로 placeholder 를 채우고 persona.md 끝에 붙인다.
원본은 templates/claude-md-block.ko.md 다. 이 파일은 매 턴 prompt 에 붙는 것을 감안해 짧게 줄인 판이다.
이 주석은 브리지가 에이전트에 보내기 전에 지운다.
-->
### 위키

위키는 {{WIKI_URL}} 의 Outline 이고 MCP 서버 `{{MCP_SERVER_NAME}}` 으로 접근한다. 다른 머신의 {{AGENT_NAME}} 과 같은 에이전트이므로 같은 콜렉션에 같은 서명으로 쓴다.

- 세션 기록은 `{{SESSIONS_COLLECTION}}` 에만 쓴다. 이 콜렉션의 overview 가 원본 규정이니 대화에서 첫 쓰기 전에 읽는다. 서브에이전트는 위키에 쓰지 않는다.
- 작업 1건당 문서 1개. 새로 만들기 전에 반드시 검색하고, 같은 작업이면 그 문서에 이어 쓴다. 제목은 `YYYY-MM-DD · <작업 요약>`.
- 골격: 첫 줄 `작성자: {{AGENT_NAME}}` 와 상태(🟡 진행 중 / ✅ 완료 / 🔴 차단됨 / ⚪ 대기 / ⚫ 취소), `## 배경`, `## 완료 조건`, 진행마다 `## Update — <YYYY-MM-DD HH:MM TZ> · <머신>`(`<머신>` 은 `hostname -s`), 끝나면 `## 완료 기록` 과 검증 근거, 마지막 줄 `최종 갱신: {{AGENT_NAME}} · <YYYY-MM-DD HH:MM TZ>`. 위키의 작성자 필드는 토큰 소유자로 찍히므로 본문 서명이 유일한 저자 표기다.
- 잡담과 단순 질의응답은 기록하지 않는다. 하위 문서를 만들지 않고 flat 으로 둔다.
- 사용자의 선호, 프로젝트, 컨벤션을 묻기 전에 `{{SHARED_COLLECTION}}` 을 검색하고 쓴 문서의 링크를 인용한다. 오래 갈 사실은 거기에 정제해서 쓰고 끝에 `수정자: {{AGENT_NAME}} · <YYYY-MM-DD>` 줄을 붙인다. 세션 로그는 거기 쓰지 않는다.
- 다른 에이전트의 `<이름> Sessions` 콜렉션은 읽기만 하고, 기댄 문서는 링크로 인용한다.
- 비밀값은 위키에도 쓰지 않는다. 변수명, 저장 경로, last4까지만 쓴다.
- `{{MCP_SERVER_NAME}}` 이 실패하면 한 줄로 알리고 작업은 계속한다. 설정 파일이나 `.env` 에서 키를 꺼내 REST API 로 우회하지 않는다.
