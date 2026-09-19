---
name: kna-08-collections
description: knowanywhere 8단계에 쓴다(kna-07-mcp-connect 뒤, fresh와 join 모두, kna-12-add-agent가 새 에이전트를 붙일 때도). MCP `create_collection` 으로 `<Agent> Sessions` 콜렉션과 공유 콜렉션(기본 이름 `공유 지식` / `Shared Knowledge`)을 만들고, `templates/collection-*.<language>.md` 의 규칙을 치환해 설명(description)에 넣고, 공유 콜렉션에 시드 문서를 만든다. 권한(모든 구성원 편집 가능)과 정렬은 사용자가 위키 UI에서 바꾸고 `list_collections` 로 검증한다.
---

# 08단계: 콜렉션과 규칙

사용자와는 사용자가 쓰는 언어로 대화한다. 명령, 경로, 도구 이름, UI 메뉴 이름은 원문 그대로 둔다.
사람용 안내: `docs/steps/08-collections.md`.

## 목표

위키에 두 종류의 콜렉션이 있고, 각 콜렉션 설명에 에이전트가 따를 규칙이 들어 있는 상태.

- `<Agent> Sessions`: 이 에이전트의 작업 기록. 이름 예: `로제 Sessions`, `리사 Sessions`.
- 공유 콜렉션: 모든 에이전트가 읽고 쓰는 정제된 지식. 시드 문서 `00 · …` 하나로 시작한다.

Outline v1.10.1의 MCP `create_collection` 은 `name`, `description`, `icon`, `color` 만 받고 콜렉션을 비공개
(`permission: null`)로 만든다. 워크스페이스 권한과 정렬은 MCP로 바꿀 수 없으므로 절차 5에서 사용자가 UI로 바꾼다.

## 필요한 state 키

```bash
node .claude/skills/kna-status/state.mjs get agent.name
node .claude/skills/kna-status/state.mjs get language
node .claude/skills/kna-status/state.mjs get mcp.server_name
node .claude/skills/kna-status/state.mjs get wiki.collections
```

`steps.07` 이 `done` 이어야 한다. `agent.name`, `language` 가 없으면 `kna-00-start`, `mcp.server_name` 이 없으면
`kna-07-mcp-connect` 가 쓰는 키라고 알리고 멈춘다. MCP 도구 이름은 `mcp__<mcp.server_name>__list_collections`
같은 형태다(아래는 서버 이름 `outline` 기준). 도구가 보이지 않으면 7단계의 세션 재시작 안내를 따른다.

## 물을 것

1과 2는 서로 독립이라 기본값과 함께 한 번에 물어도 된다(AGENTS.md 규칙 9). 3의 yes 는 1과 2가 정해진 뒤 따로 받는다.
먼저 절차 1의 목록을 본 뒤, 이미 있는 것은 묻지 않는다.

1. **공유 콜렉션 이름** (공유 콜렉션이 아직 없을 때만). 기본값은 `language` 가 `ko` 면 `공유 지식`, `en` 이면
   `Shared Knowledge`. 사용자가 바꿀 수 있다. 모든 에이전트의 규칙이 이 이름을 가리키므로 나중에 바꾸면 각
   콜렉션 설명도 다시 넣어야 한다고 말한다.
2. **아이콘과 색.** 기본값: Sessions `📓` `#4C6EF5`, 공유 `📚` `#2F9E44`. 에이전트가 여럿이면 Sessions 색을
   에이전트마다 다르게 고르면 사이드바에서 구분하기 쉽다.
3. **만들어도 되는지.** 만들 콜렉션 이름, 아이콘, 색, 시드 문서 제목을 한 번에 보여주고 yes를 받는다.

## 절차

### 1. 지금 있는 콜렉션 확인

`list_collections` 를 `limit: 100` 으로 호출하고 이름, id, `permission`, `sort` 를 표로 보여준다.

| 찾는 것 | 판단 |
|---|---|
| 이름이 정확히 `<agent.name> Sessions` | 있으면 만들지 않는다. id만 기록한다(같은 에이전트의 다른 머신이 이미 만든 경우) |
| 공유 콜렉션: `공유 지식`, `Shared Knowledge`, 또는 `wiki.collections.shared.name` | 있으면 만들지 않고 설명도 덮지 않는다. id만 기록한다 |
| 둘 다 아닌데 공유 콜렉션처럼 보이는 것 | join 모드에서 이름을 바꿔 쓴 경우다. 어느 것이 공유 콜렉션인지 사용자에게 묻는다 |

fresh 모드에서 다시 실행한 경우도 같다. 있는 콜렉션을 두 번 만들지 않는다. 이미 있는 콜렉션의 설명이
템플릿과 다르면 덮을지 묻고, yes일 때만 `update_collection` 의 `description` 으로 바꾼다(기존 설명을 잃는다).

### 2. 템플릿 치환

`language` 값으로 템플릿 파일을 고른다(`ko` → `*.ko.md`, `en` → `*.en.md`). 공유 콜렉션 이름이 정해진 뒤에
실행한다. Sessions 규칙이 공유 콜렉션 이름을 가리키기 때문이다. 결과는 gitignore 대상인 `.knowanywhere/render/`
에 쓴다. 인자는 순서대로 템플릿 파일, 부분(`overview` 또는 `seed`), 에이전트 이름, 공유 콜렉션 이름, 오늘 날짜다.

```bash
cat > .knowanywhere/render.sh <<'SH'
node -e '
const fs = require("fs");
const [file, part, agent, shared, date] = process.argv.slice(1);
const m = fs.readFileSync(file, "utf8").match(new RegExp(`<!-- kna:${part}:start -->\\n([\\s\\S]*?)\\n<!-- kna:${part}:end -->`));
if (!m) { console.error("ERROR markers not found:", part, file); process.exit(1); }
const out = m[1].replaceAll("{{AGENT_NAME}}", agent).replaceAll("{{SHARED_COLLECTION}}", shared).replaceAll("{{DATE}}", date);
const left = out.match(/\{\{[A-Z_]+\}\}/g);
if (left) { console.error("ERROR unreplaced:", [...new Set(left)].join(" ")); process.exit(1); }
const dest = `.knowanywhere/render/${part}-${file.split("/").pop()}`;
fs.mkdirSync(".knowanywhere/render", { recursive: true });
fs.writeFileSync(dest, out + "\n");
console.log("OK", dest, out.split("\n").length, "lines");
' "$@"
SH
bash .knowanywhere/render.sh templates/collection-sessions.ko.md overview "로제" "공유 지식" "$(date +%F)"
bash .knowanywhere/render.sh templates/collection-shared.ko.md overview "로제" "공유 지식" "$(date +%F)"
bash .knowanywhere/render.sh templates/collection-shared.ko.md seed "로제" "공유 지식" "$(date +%F)"
```

기대 출력: 파일마다 `OK .knowanywhere/render/<부분>-<템플릿 파일명> <줄 수> lines`. `ERROR` 가 나오면 템플릿의
표시(`<!-- kna:overview:start -->` 등)나 자리표시자가 바뀐 것이다. 멈추고 알린다. 만들지 않을 콜렉션의 파일은
만들지 않아도 된다.

### 3. 공유 콜렉션과 시드 문서 (공유 콜렉션이 없을 때만)

1. `.knowanywhere/render/overview-collection-shared.<lang>.md` 를 읽는다.
2. `create_collection`: `name` 에 공유 콜렉션 이름, `description` 에 읽은 본문 전체, `icon`, `color`.
   응답의 `id` 를 기록해 둔다.
3. 시드 문서 제목은 템플릿의 "시드 문서" 절에 있다. ko는 `00 · 에이전트가 이 위키를 쓰는 법`, en은
   `00 · How agents use this wiki`. icon은 `🧭`.
4. `create_document`: `title` 에 그 제목, `text` 에 `.knowanywhere/render/seed-collection-shared.<lang>.md` 본문,
   `collectionId` 에 2의 id, `icon: "🧭"`, `publish: true`. 본문은 H1으로 시작하지 않는다(템플릿도 그렇다).

공유 콜렉션이 이미 있으면 `list_collection_documents` 로 시드 문서가 있는지만 본다. 없으면 만들지 묻는다.

### 4. Sessions 콜렉션 (이 에이전트의 콜렉션이 없을 때만)

`create_collection`: `name` 은 `<agent.name> Sessions`(예: `로제 Sessions`), `description` 은
`.knowanywhere/render/overview-collection-sessions.<lang>.md` 본문 전체, `icon`, `color`. 응답의 `id` 를 기록한다.
Sessions 콜렉션에는 문서를 미리 만들지 않는다. 첫 문서는 9단계의 스모크 테스트가 쓴다.

### 5. 권한과 정렬 (사람이 위키 UI에서, 이번에 만든 콜렉션만)

사용자에게 `https://<wiki.host>` 를 열게 하고, 왼쪽 사이드바에서 콜렉션 이름에 마우스를 올려 `…` 를 누르게 한다.
위키 UI가 한국어면 괄호 안 이름으로 보인다.

| 콜렉션 | 권한 | 정렬 |
|---|---|---|
| `<Agent> Sessions` | **Permissions…**(권한…) → **All members**(모든 구성원) 행의 드롭다운 → **Can edit**(편집 가능) | **Sort in sidebar**(사이드바 정렬) → **Z-A sort**(내림차순) |
| 공유 콜렉션 | 같은 방법으로 **Can edit**(편집 가능) | **Sort in sidebar**(사이드바 정렬) → **A-Z sort**(오름차순) |

Sessions 문서 제목은 `YYYY-MM-DD · …` 라서 제목 내림차순이 최근 작업을 위로 올린다. 공유 콜렉션은 정본 문서가
`00 ·`, `10 ·` 번호로 시작하므로 오름차순이 번호 순서다. "Sessions에는 그 에이전트만 쓴다"는 규칙은 권한이 아닌
콜렉션 설명이 정한다(여러 에이전트가 같은 계정으로 접속하므로 권한으로는 막을 수 없다).

## 검증

검증 명령과 도구 호출의 출력은 요약하지 말고 fenced code block 으로 원문을 붙이고, 그 아래 한 줄로 기대 결과와 맞는지 판정한다.

`list_collections`(`limit: 100`)를 다시 호출해 두 콜렉션에 대해 다음을 사용자에게 보여준다.

| 항목 | 기대 |
|---|---|
| `name`, `id` | 절차 3, 4에서 받은 값(또는 절차 1에서 찾은 값) |
| `permission` | `read_write` (`null` 이면 절차 5의 권한을 아직 안 바꿨다) |
| `sort` | Sessions `{"field":"title","direction":"desc"}`, 공유 `{"field":"title","direction":"asc"}` |
| `description` | 첫 문장이 렌더 파일의 첫 문장과 같고, `## ` 제목 목록이 같다. Outline이 markdown을 다시 직렬화하므로 글자 단위로 같지 않을 수 있다 |

그리고 공유 콜렉션 id로 `list_collection_documents` 를 호출해 시드 문서 제목이 있는지 보여준다.
join 모드에서 이미 있던 콜렉션을 기록만 한 경우에는 `permission`, `sort` 가 달라도 실패로 보지 않는다. 다르다고
알리고 바꿀지 사용자에게 맡긴다.

| 증상 | 원인과 조치 |
|---|---|
| `create_collection` 도구가 없다 | 연결이 읽기 권한만 받았다. `/mcp` 에서 다시 Authenticate 하고 write를 허용한다 |
| 권한 에러(`authorization_error` 류) | 이 계정이 콜렉션을 만들 수 없다. 워크스페이스 관리자에게 확인한다 |
| `The update resulted in no changes` | `update_collection` 에 넣은 값이 지금 값과 같다. 실패가 아니다 |

## state에 쓸 것

`state.mjs` 가 출력한 JSON 조각을 fenced code block 으로 그대로 보여준다.

`set` 은 배열을 통째로 바꾼다. `wiki.collections.sessions` 에 이미 있는 항목(다른 에이전트)을 그대로 두고 이
에이전트의 항목만 더한 전체 배열을 쓴다. 같은 `agent` 항목이 이미 있으면 그 항목을 바꾼다.

```bash
node .claude/skills/kna-status/state.mjs set '{"wiki":{"collections":{"sessions":[{"agent":"로제","name":"로제 Sessions","id":"00000000-0000-4000-8000-000000000001"}],"shared":{"name":"공유 지식","id":"00000000-0000-4000-8000-000000000002"}}}}'
node .claude/skills/kna-status/state.mjs step 08 done
node .claude/skills/kna-status/state.mjs get wiki.collections
```

`.knowanywhere/render/` 와 `.knowanywhere/render.sh` 는 지워도 되고 남겨도
된다(비밀값이 없고 커밋되지 않는다).

## 다음 단계

`kna-09-persona`: 이 에이전트의 이름과 성격을 정하고 `~/.claude/CLAUDE.md` 에 규칙 블록을 넣은 뒤, 첫 세션 문서를
`<Agent> Sessions` 에 써 보는 스모크 테스트를 한다. 전역 설정을 고치므로 시작 전에 묻는다.
