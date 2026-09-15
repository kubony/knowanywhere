---
name: kna-12-add-agent
description: 설치를 마친 뒤(또는 join 머신에서) 사용자가 머신이나 에이전트를 더 붙이겠다고 할 때 쓴다. 요청 시에만 돈다. 같은 에이전트를 새 머신에서 이어 쓰는지(같은 이름, 같은 콜렉션), 새 에이전트인지(새 이름, 새 `<이름> Sessions` 콜렉션), Codex·Hermes 인지(phase 2) 가르고, 새 머신에서 clone → claude → join → 07 → 08 → 09(→ 10)를 돌리게 안내한 뒤 list_collections 와 세션 문서의 새 `## Update` 로 확인한다.
---

# 12단계: 머신이나 에이전트 추가

사용자와는 사용자가 쓰는 언어로 대화한다. 명령, 경로, 도구 이름은 원문 그대로 둔다.
사람용 안내: `docs/steps/12-add-agent.md`. Codex·Hermes: `docs/phase2-codex-hermes.md`.

## 목표

위키는 그대로 두고, 그 위키를 쓰는 머신이나 에이전트를 하나 늘린다. 위키 쪽에서 달라지는 것은 새 에이전트일 때
콜렉션 하나뿐이다. 이 단계는 돈이 들지 않는다.

## 필요한 state 키

이 스킬을 부른 머신에서:

```bash
H=.claude/skills/kna-status/state.mjs
node $H get wiki.url
node $H get agent.name
node $H get language
node $H get mcp.server_name
node $H get wiki.collections
node $H get agents
```

`.knowanywhere/state.json` 이 없으면 이 머신은 아직 설치 전이다. 이 머신 자체를 기존 위키에 붙이려는 것이면
`kna-00-start` 로 가서 `join` 을 고르게 한다. 그 뒤 흐름은 아래 A 또는 B 와 같다.

## 물을 것

먼저 무엇을 붙이는지 묻는다.

이름이 정체성이라는 점을 먼저 짧게 알린다. 같은 이름은 같은 에이전트이고, 같은 `<이름> Sessions` 에 같은 서명으로
같은 작업 문서를 이어 쓴다. 새 이름은 새 에이전트이고 콜렉션을 하나 새로 받는다. 이름은 대소문자와 철자를 구분한다.

| 경우 | 예 | 콜렉션 | 새 머신에서 도는 단계 |
|---|---|---|---|
| A. 같은 에이전트, 새 머신 | 맥북의 로제를 데스크탑에서도 | 기존 `로제 Sessions` | 00(join) → 07 → 08(확인만) → 09 → 10(선택) |
| B. 새 Claude Code 에이전트 | 역할이 다른 리사 | 새 `리사 Sessions` | 00(join) → 07 → 08(생성) → 09 → 10(선택) |
| C. Codex·Hermes 에이전트 | Codex 로 도는 지수, Hermes 로 도는 제니 | 새 콜렉션 | phase 2. 콜렉션만 여기서 만들 수 있다 |
| D. 같은 에이전트를 Discord 에 | 로제를 Discord 봇으로 | 기존 | `kna-10-discord` 로 간다 |

한 OS 사용자에게는 `~/.claude/CLAUDE.md` 가 하나이고 관리 블록도 하나다. 그래서 한 머신의 한 사용자 계정에는 Claude Code
에이전트가 하나만 산다. B 를 이 머신에 하려고 하면 9단계가 지금 에이전트의 블록을 새 에이전트로 **교체**한다고 알리고,
다른 머신이나 다른 OS 사용자 계정을 쓰게 한다.

## 절차

### A. 같은 에이전트, 새 머신

#### 1. 새 머신에서 할 일을 준다

사용자가 새 머신에서 직접 한다. 필요한 것: `git`, Node.js 20 이상, Claude Code(`claude`). 없으면 새 머신의 00단계가
설치 명령을 안내한다.

```bash
git clone https://github.com/kubony/knowanywhere.git
cd knowanywhere
claude
```

새 머신의 인스톨러가 물으면 이렇게 답한다(이 머신의 state 값을 채워서 보여준다):

| 질문 | 답 |
|---|---|
| 설치를 시작할까요 | yes |
| 모드 | `join` |
| 에이전트 이름 | `로제` (이 머신의 `agent.name` 그대로. 대소문자, 악센트, 공백까지 같게) |
| 다른 머신에 이미 있는 같은 에이전트인가 | 예 |
| 템플릿 언어 | `ko` (이 머신의 `language`) |
| 기존 위키 주소 | `https://wiki.example.com` (이 머신의 `wiki.url`) |

같은 에이전트는 어디서나 같은 페르소나를 쓰는 것이 좋다. 이 머신의 `.knowanywhere/persona-lines.md` 를 보여주고, 새
머신의 9단계에서 같은 답을 주게 한다. 비밀값이 없는 파일이다.

#### 2. 새 머신에서 도는 흐름

1. `kna-00-start`: `mode join`, `wiki.host`, `wiki.url` 을 쓰고 위키가 `200`/`302` 로 답하는지 본다.
2. `kna-07-mcp-connect`: 머신마다 MCP OAuth 로그인을 따로 한다. 검증은 `list_collections`.
3. `kna-08-collections`: 같은 이름이면 `<이름> Sessions` 와 공유 콜렉션이 이미 있다. 새로 만들거나 overview 를 덮지
   않는다. `list_collections` 로 두 콜렉션을 정확한 이름으로 찾아 id 를 state 에 기록하는 것으로 끝낸다. 그 단계가 이
   경우를 따로 다루지 않으면 새 머신에서 이렇게 기록한다(id 는 `list_collections` 결과):
   ```bash
   node .claude/skills/kna-status/state.mjs set '{"wiki":{"collections":{"sessions":[{"agent":"로제","name":"로제 Sessions","id":"00000000-0000-4000-8000-000000000001"}],"shared":{"name":"공유 지식","id":"00000000-0000-4000-8000-000000000002"}}}}'
   node .claude/skills/kna-status/state.mjs step 08 done
   ```
4. `kna-09-persona`: 새 머신의 `~/.claude/CLAUDE.md` 에 같은 블록을 넣는다. 스모크 테스트가 먼저 검색하므로 첫 머신이
   만든 `YYYY-MM-DD · knowanywhere 설치` 문서를 찾아 `## Update — <시각> · <새 머신>` 을 붙인다. 새 문서를 만들지 않는다.
5. `kna-10-discord`: 선택.

### B. 새 Claude Code 에이전트

A 와 같지만 두 가지가 다르다.

- 새 머신의 00단계에서 **새 이름**을 주고 "같은 에이전트인가" 에 아니오라고 답한다. 이름 규칙: 1~30자, 글자·숫자·공백·하이픈.
  `list_collections` 결과에 `<새 이름> Sessions` 가 이미 있으면 다른 이름을 고르게 한다.
- 새 머신의 8단계가 `<새 이름> Sessions` 를 새로 만들고 `templates/collection-sessions.<lang>.md` 의 overview 를 넣는다.
  공유 콜렉션은 이미 있으므로 다시 만들지 않는다.

9단계에서 새 에이전트의 페르소나를 새로 받는다. 역할이 겹치지 않게 기존 에이전트의 역할을 한 줄로 알려준다.

### C. Codex·Hermes (phase 2)

v1 인스톨러는 Codex·Hermes 런타임을 설치하거나 검증하지 않는다. 알려줄 것:

- 무엇이 다른지는 `docs/phase2-codex-hermes.md` 한 페이지에 있다.
- Codex 용 규칙 블록은 `templates/codex-agents-md.<lang>.md` 다. 사용자가 `~/.codex/AGENTS.md` 를 백업하고 그 끝에 직접
  붙인다. 설치기는 `~/.codex/` 를 읽거나 쓰지 않는다.

이 머신에서 지금 할 수 있는 것(각각 yes 를 받는다):

1. **콜렉션.** 위키 쪽은 런타임과 관계없이 같다. `kna-08-collections` 의 Sessions 콜렉션 생성 절차를 새 이름으로 한 번
   더 한다(`{{AGENT_NAME}}` 에 새 이름). 이 머신의 `agent.name` 은 바꾸지 않는다. 만든 콜렉션은
   `wiki.collections.sessions` 에 더한다. `set` 은 배열을 통째로 바꾸므로 기존 항목을 함께 넣는다:
   ```bash
   node .claude/skills/kna-status/state.mjs get wiki.collections.sessions
   node .claude/skills/kna-status/state.mjs set '{"wiki":{"collections":{"sessions":[{"agent":"로제","name":"로제 Sessions","id":"00000000-0000-4000-8000-000000000001"},{"agent":"지수","name":"지수 Sessions","id":"00000000-0000-4000-8000-000000000003"}]}}}'
   ```
2. **Codex 블록 렌더링.** `templates/persona.md` 질문으로 새 에이전트의 페르소나 줄을 받아
   `.knowanywhere/codex-persona-lines.md` 에 쓰고, 9단계 절차 2와 같은 방식으로 값 파일
   `.knowanywhere/codex-values.json` 을 만든 뒤(`AGENT_NAME` 과 `SESSIONS_COLLECTION` 은 새 에이전트 것):
   ```bash
   node .claude/skills/kna-09-persona/managed-block.mjs render --template templates/codex-agents-md.ko.md --values .knowanywhere/codex-values.json --out .knowanywhere/codex-agents-md.md
   ```
   `language` 가 `en` 이면 `templates/codex-agents-md.en.md` 를 쓴다. 파일 맨 위 주석이 수동 설정 순서다. 사용자는 `<!-- knowanywhere:start -->` 부터 `<!-- knowanywhere:end -->` 까지를
   Codex 가 도는 머신의 `~/.codex/AGENTS.md` 끝에 붙인다.

`agents[]` 에는 사용자가 그 에이전트를 설정하고 그 에이전트가 자기 콜렉션에 첫 문서를 쓴 것을 확인한 뒤에만 더한다:

```bash
node .claude/skills/kna-status/state.mjs agent-add '{"name":"지수","machine":"mbp","kind":"codex","sessions_collection":"지수 Sessions"}'
```

## 검증

**A. 같은 에이전트, 새 머신.** 새 머신의 9단계 검증이 기준이다. 사용자가 끝났다고 하면 이 머신에서도 확인한다.

1. `list_collections` 가 에러 없이 돈다(이 머신의 MCP 도 살아 있다).
2. `<agent.name> Sessions` 에서 `list_documents` 에 `query: "knowanywhere"` 로 설치 문서를 찾고, 다시 읽어 새 머신 이름이
   붙은 `## Update — ... · <새 머신>` 제목이 있는지 본다. 그 제목 줄과 문서 URL 을 보여준다.
3. 설치 문서가 둘이면 새 머신이 검색을 건너뛴 것이다. 지우기 전에 사용자에게 묻고 규칙대로 하나로 합친다.

**B. 새 Claude Code 에이전트.** 이 머신에서 `list_collections` 에 `<새 이름> Sessions` 가 보이고, 그 콜렉션에 새
에이전트의 첫 설치 문서가 있고(첫 줄 `작성자: <새 이름>`), 기존 `<agent.name> Sessions` 에는 새 에이전트가 쓴 문서가 없다.

## state에 쓸 것

- 새 머신은 자기 클론의 state 에 00~09(10) 단계가 쓴다. 이 머신의 state 는 바꾸지 않아도 된다.
- 기록해 두고 싶으면 A·B 확인이 끝난 뒤 이 머신의 `agents[]` 에 새 머신 항목을 더한다. 같은 `name` 과 `machine` 은
  교체되므로 중복되지 않는다:
  ```bash
  node .claude/skills/kna-status/state.mjs agent-add '{"name":"로제","machine":"desktop","kind":"claude","sessions_collection":"로제 Sessions"}'
  ```
- `steps.12` 는 `pending` 으로 둔다. 요청할 때마다 다시 도는 단계라서 `done` 으로 쓰지 않는다(`docs/state.md`).

도우미가 출력한 JSON 조각을 보여준다.

## 다음 단계

정해진 다음 단계는 없다. 또 붙일 것이 있는지 묻고, 없으면 `node .claude/skills/kna-status/state.mjs status` 로 현재 상태를
보여주고 끝낸다.
