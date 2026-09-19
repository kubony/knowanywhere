---
name: kna-09-persona
description: knowanywhere 9단계에 쓴다(kna-08-collections 뒤, fresh·join 모두. kna-12-add-agent 가 다른 머신에서 다시 부를 때도). templates/persona.md 질문으로 페르소나를 받고, templates/claude-md-block.<lang>.md 를 렌더링해 전체 블록을 보여준 뒤 동의를 받아 ~/.claude/CLAUDE.md 의 knowanywhere 마커 구간에 넣는다(managed-block.mjs, 백업 자동). 스모크 테스트로 에이전트가 이 설치에 대한 세션 문서를 규칙대로 만들고 다시 읽는다.
---

# 09단계: 페르소나와 규칙 블록

사용자와는 사용자가 쓰는 언어로 대화한다. 명령, 경로, 도구 이름, 에러 메시지는 원문 그대로 둔다.
사람용 안내: `docs/steps/09-persona.md`. 질문과 출력 형식의 원본: `templates/persona.md`.

## 목표

이 머신의 Claude Code 가 어느 디렉터리에서 열리든 자기 이름, 페르소나, 위키 기록 규칙을 아는 상태. 규칙은
`~/.claude/CLAUDE.md` 끝의 관리 블록(`<!-- knowanywhere:start -->` ~ `<!-- knowanywhere:end -->`) 하나에 들어간다.
블록 밖은 건드리지 않는다. 다시 실행하면 같은 구간을 교체하므로 블록은 늘 하나다.

이 단계는 돈이 들지 않는다. 전역 Claude 설정(`~/.claude/CLAUDE.md`)을 고치므로 전체 블록을 보여주고 yes 를 받는다.

## 필요한 state 키

```bash
H=.claude/skills/kna-status/state.mjs
node $H get agent.name
node $H get language
node $H get wiki.url
node $H get mcp.server_name
node $H get wiki.collections
node $H get steps.07
node $H get steps.08
```

`steps.07` 과 `steps.08` 이 `done` 이어야 한다. `wiki.collections.sessions` 에 이름이 정확히 `<agent.name> Sessions` 인
항목이 있어야 하고 `wiki.collections.shared.name` 이 있어야 한다. 빠진 것이 있으면 그 키와 그 키를 쓰는 단계(07 또는
08)를 말하고 멈춘다.

이 단계가 `.knowanywhere/` 에 만드는 파일(모두 비밀값이 아니고 커밋되지 않는다):

| 파일 | 내용 | 다시 쓰는 곳 |
|---|---|---|
| `.knowanywhere/persona-lines.md` | 페르소나 4~6줄 | 10단계 `persona.md` |
| `.knowanywhere/block-values.json` | placeholder 값 6개 | 10단계 렌더링 |
| `.knowanywhere/claude-md-block.md` | 렌더링한 관리 블록 | 이 단계의 apply |

## 물을 것

한 번에 하나씩 묻는다.

먼저 같은 이름을 여러 머신에서 쓰는 뜻을 두 줄로 알린다. 이름은 머신 라벨이 아니라 정체성이다. 맥북, 데스크탑,
Discord 봇이 모두 `로제` 면 위키에게는 에이전트 하나이고, 같은 `로제 Sessions` 에 같은 서명으로 같은 문서를 이어 쓴다.

1. **이름 확인.** `agent.name` 을 보여주고 맞는지 묻는다. 바꾸려면 콜렉션도 새로 필요하므로 여기서 바꾸지 않고
   `kna-00-start` 와 `kna-08-collections` 로 돌아간다고 알린다.
2. **머신 이름.** `hostname -s` 출력을 기본값으로 제안한다. `agents[].machine` 과 문서의 `## Update — <시각> · <머신>`
   에 쓰인다. 다른 머신에서 이미 쓴 이름과 겹치지 않게 한다.
3. **한 줄 역할.** 예: "개인 프로젝트의 코딩과 조사를 함께 하는 파트너".
4. **말투.** 예: "담백하고 직접적으로, 결론부터".
5. **언어 정책.** 기본값 "사용자가 쓰는 언어로 답하고, 코드·명령어·경로·기술 용어는 원문 그대로 둔다". 바꾸고 싶을 때만.
6. **경계.** 기본값(비밀값을 드러내지 않는다, 돈이 드는 일·데이터 삭제·공유 branch push 전에는 묻는다)에 사용자 것을
   더한다. 예: "다른 사람에게 메일이나 메시지를 보내지 않는다".

`templates/persona.md` 의 "출력 형식"대로 글머리표 4~6줄을 만든다. `language` 가 `ko` 면 라벨은 `역할`, `말투`, `언어`,
`경계`, `en` 이면 `Role`, `Tone`, `Language`, `Boundaries`. 줄을 보여주고 고칠 곳이 없는지 묻는다. 줄 안에 `{{` 가
들어가면 렌더링이 거부하므로 쓰지 않는다.

## 절차

### 1. 페르소나 줄 저장

확정한 줄을 `.knowanywhere/persona-lines.md` 에 쓴다(Write 도구. 제목 없이 글머리표만). 예:

```
- 역할: 개인 프로젝트의 코딩, 조사, 홈랩 관리를 함께 하는 파트너.
- 말투: 담백하고 직접적으로. 답부터 쓰고 근거를 붙인다.
- 언어: 사용자가 쓰는 언어로 답한다. 코드, 명령어, 경로는 원문 그대로 둔다.
- 경계: 비밀값을 드러내지 않는다. 돈이 드는 일, 데이터 삭제, `main` push 전에는 묻는다.
```

### 2. placeholder 값 만들기

state 에서 값을 모아 `.knowanywhere/block-values.json` 을 쓰고 출력한다.

```bash
node -e '
const fs = require("fs");
const s = JSON.parse(fs.readFileSync(".knowanywhere/state.json", "utf8"));
const name = s.agent?.name;
const sess = (s.wiki?.collections?.sessions || []).find((c) => c.name === `${name} Sessions`);
if (!sess) { console.error(`state 에 "${name} Sessions" 콜렉션이 없다. kna-08-collections 를 먼저 한다.`); process.exit(1); }
const v = {
  AGENT_NAME: name,
  PERSONA: fs.readFileSync(".knowanywhere/persona-lines.md", "utf8").trim(),
  WIKI_URL: s.wiki.url,
  MCP_SERVER_NAME: s.mcp.server_name,
  SESSIONS_COLLECTION: sess.name,
  SHARED_COLLECTION: s.wiki.collections.shared.name,
};
fs.writeFileSync(".knowanywhere/block-values.json", JSON.stringify(v, null, 2) + "\n");
console.log(JSON.stringify(v, null, 2));
'
```

### 3. 렌더링

```bash
L=$(node .claude/skills/kna-status/state.mjs get language | tr -d '"')
node .claude/skills/kna-09-persona/managed-block.mjs render \
  --template templates/claude-md-block.$L.md \
  --values .knowanywhere/block-values.json \
  --out .knowanywhere/claude-md-block.md
```

기대 출력: `렌더링함: <레포>/.knowanywhere/claude-md-block.md (62줄)` 처럼 한 줄(줄 수는 페르소나 길이에 따라 다르다). `값이 없는 placeholder: ...` 가 나오면
2의 값이 비었다. 그 키를 채우고 다시 한다.

### 4. 보여주기 (동의 전)

사용자에게 세 가지를 보여준다.

1. 대상 경로: `~/.claude/CLAUDE.md` (실제 경로 `echo "$HOME/.claude/CLAUDE.md"`). 이 파일은 모든 디렉터리의 모든
   Claude Code 세션에 로드된다.
2. **렌더링한 블록 전체.** `cat .knowanywhere/claude-md-block.md` 출력을 줄이지 않고 그대로 보여준다.
3. 무엇이 바뀌는지:
   ```bash
   node .claude/skills/kna-09-persona/managed-block.mjs show --target ~/.claude/CLAUDE.md
   node .claude/skills/kna-09-persona/managed-block.mjs apply --block .knowanywhere/claude-md-block.md --target ~/.claude/CLAUDE.md --dry-run
   ```
   `show` 는 지금 들어 있는 블록을 출력한다(없으면 `없음`, 파일이 없으면 `없음 (파일이 없다)`). `--dry-run` 은
   `dry-run: ... 을(를) 덧붙임 예정` / `교체함 예정` / `생성함 예정`, 또는 `변경 없음: ...` 을 출력하고 아무것도
   쓰지 않는다. 교체라면 `diff <(node .claude/skills/kna-09-persona/managed-block.mjs show --target ~/.claude/CLAUDE.md) .knowanywhere/claude-md-block.md`
   로 달라지는 줄을 보여준다.

마커 밖에 다른 위키 기록 규칙이 이미 있는지도 본다.

```bash
awk '/^<!-- knowanywhere:start -->$/{m=1} !m && /[Oo]utline|[Ww]iki|위키|Sessions/{print NR": "$0} /^<!-- knowanywhere:end -->$/{m=0}' ~/.claude/CLAUDE.md
```

마커 밖에 비슷한 규칙이 있으면 에이전트가 두 규칙을 함께 읽게 된다고 알린다. 설치기는 마커 밖을 고치지 않으므로,
정리할지는 사용자가 정하고 사용자가 직접 고친다.

마커가 짝이 안 맞으면 `show` 와 `apply` 가 exit 3 으로 거부하고 아무것도 쓰지 않는다. 사용자가 파일을 직접 고친 뒤
다시 한다.

그리고 묻는다: "위 블록을 `~/.claude/CLAUDE.md` 에 넣을까요? 기존 파일은 `~/.claude/CLAUDE.md.bak-<시각>` 으로
백업합니다." yes 는 보여준 블록과 그 경로에만 해당한다.

### 5. 적용 (yes 받은 뒤)

```bash
node .claude/skills/kna-09-persona/managed-block.mjs apply --block .knowanywhere/claude-md-block.md --target ~/.claude/CLAUDE.md
```

기대 출력은 넷 중 하나다.

- `덧붙임: /Users/me/.claude/CLAUDE.md (백업: /Users/me/.claude/CLAUDE.md.bak-20260915T094000Z)`
- `교체함: ... (백업: ...)`
- `생성함: /Users/me/.claude/CLAUDE.md` (파일이 없었다. 백업할 것이 없다)
- `변경 없음: ...` (같은 블록이 이미 있다. 아무것도 쓰지 않았다)

백업이 생겼는지 확인한다.

```bash
ls -l ~/.claude/CLAUDE.md.bak-* 2>/dev/null | tail -3
```

스크립트는 기존 백업을 덮지 않고(같은 초에 두 번 돌면 `-1` 을 붙인다), 임시 파일에 쓴 뒤 rename 하고, 파일 mode 를
유지한다.

## 검증

검증 명령과 도구 호출의 출력은 요약하지 말고 fenced code block 으로 원문을 붙이고, 그 아래 한 줄로 기대 결과와 맞는지 판정한다.

### 1. 블록이 하나만 있다

```bash
grep -c '^<!-- knowanywhere:start -->$' ~/.claude/CLAUDE.md
grep -c '^<!-- knowanywhere:end -->$' ~/.claude/CLAUDE.md
node .claude/skills/kna-09-persona/managed-block.mjs show --target ~/.claude/CLAUDE.md | head -3
```

기대: `1`, `1`, 그리고 `<!-- knowanywhere:start -->` 와 `## 공유 위키: 로제 (knowanywhere 관리 블록)` 로 시작하는 줄.

### 2. 새 세션이 블록을 읽는다

레포 밖 빈 디렉터리에서 짧은 비대화형 호출을 한 번 한다(작은 모델 호출 한 번). 괄호로 subshell 을 써서 이 세션의
작업 디렉터리는 바꾸지 않는다.

```bash
(cd "$(mktemp -d)" && claude -p '너의 에이전트 이름과 세션 기록 콜렉션 이름만 한 줄로 답하라.')
```

기대: 출력에 `agent.name` 과 `<agent.name> Sessions` 가 들어 있다. 이 레포 안에서 돌리면 레포의 AGENTS.md 가 섞이므로
꼭 레포 밖에서 한다.

### 3. 스모크 테스트: 첫 세션 문서

지금 이 세션이 에이전트로서 방금 넣은 규칙대로 이 설치에 대한 세션 문서를 쓴다. MCP 서버 이름은 `mcp.server_name`
(예: `outline` 이면 도구 이름은 `mcp__outline__list_collections` 등)이다.

1. `list_collections` 로 `<agent.name> Sessions` 를 정확한 이름으로 찾아 id 를 얻는다.
2. **먼저 검색한다.** 그 콜렉션에서 `list_documents` 에 `query: "knowanywhere"` 와 그 `collectionId` 를 준다.
   - 같은 에이전트가 다른 머신에서 이미 만든 설치 문서가 있으면(join 모드에서 흔하다) 새로 만들지 않는다. 그 문서에
     `## Update — <YYYY-MM-DD HH:MM TZ> · <머신>` 을 붙이고 마지막 `최종 갱신:` 줄을 새 시각으로 바꾼다. 콜렉션
     overview 의 "고칠 때" 절대로 부분 수정한다.
   - 없으면 새로 만든다.
3. 새로 만들 때:
   - 제목: `YYYY-MM-DD · knowanywhere 설치` (영어 템플릿이면 `YYYY-MM-DD · knowanywhere install`). 날짜는 설치를
     시작한 날의 현지 날짜: `node -e 'console.log(new Date(process.argv[1]).toLocaleDateString("sv-SE"))' "$(node .claude/skills/kna-status/state.mjs get created_at | tr -d '"')"`
   - 도구가 지원하면 `icon` 필드에 이모지 1개(예: 📚).
   - 시각은 `date '+%Y-%m-%d %H:%M %Z'`, 머신은 2에서 정한 이름.
   - 본문(ko 예시. en 이면 `templates/claude-md-block.en.md` 의 라벨):

     ```
     작성자: 로제 · 상태: 🟡 진행 중
     시작: 2026-09-15 14:05 KST · 최종 갱신: 2026-09-15 18:40 KST

     ## 배경
     knowanywhere 인스톨러로 공유 위키 https://wiki.example.com 을 만들고 이 에이전트를 연결했다. 이 문서는 설치
     과정의 기록이며 9단계 스모크 테스트로 만들었다.

     ## 완료 조건
     - `node .claude/skills/kna-status/state.mjs status` 에서 이 모드의 모든 단계가 done 또는 skipped
     - 이 문서가 MCP 로 만들어지고 다시 읽힌다

     ## Update — 2026-09-15 18:40 KST · mbp
     - 모드 fresh. 위키 https://wiki.example.com, MCP 서버 `outline`
     - 콜렉션 `로제 Sessions`, `공유 지식`
     - `~/.claude/CLAUDE.md` 에 관리 블록을 넣었다. 백업 `~/.claude/CLAUDE.md.bak-20260915T094000Z`
     - 남은 단계: 10(선택), 11

     최종 갱신: 로제 · 2026-09-15 18:40 KST
     ```

     상태는 남은 단계가 있으면 🟡, 이 모드의 단계가 모두 끝났으면 ✅ 로 쓰고 `## 완료 기록` 에 `state.mjs status`
     출력 요약을 붙인다. 비밀값, 토큰, API key 끝자리는 쓰지 않는다.
4. **다시 읽는다.** 만들거나 고친 문서를 MCP 로 다시 읽어(문서 id 로 읽는 도구, 또는 같은 `list_documents` 검색)
   제목, 첫 줄, 방금 쓴 Update 제목, 문서 URL(`https://wiki.example.com/doc/...`)을 사용자에게 보여준다.
   사용자가 브라우저에서 그 URL 을 열어 볼 수 있으면 확인을 부탁한다.

기준: 1의 두 숫자가 `1`, 2의 출력에 이름과 콜렉션 이름, 3에서 문서가 다시 읽히고 URL 이 나온다. 하나라도 어긋나면
`done` 으로 쓰지 않는다.

| 증상 | 원인과 조치 |
|---|---|
| `claude -p` 가 이름을 모른다 | 블록이 적용되지 않았거나 다른 `~/.claude/CLAUDE.md` 를 봤다. 1을 다시 보고, `echo $HOME` 확인 |
| MCP 도구가 없거나 401 | 7단계의 연결이 끊겼다. `/mcp` 에서 다시 Authenticate |
| 같은 문서가 두 개 생겼다 | 검색을 건너뛰었다. 나중 문서를 지우기 전에 사용자에게 묻고, 규칙대로 하나에 합친다 |

## state에 쓸 것

`state.mjs` 가 출력한 JSON 조각을 fenced code block 으로 그대로 보여준다.

```bash
H=.claude/skills/kna-status/state.mjs
node $H set '{"agent":{"persona_written_at":"2026-09-15T09:40:00Z"}}'
node $H agent-add '{"name":"로제","machine":"mbp","kind":"claude","sessions_collection":"로제 Sessions"}'
node $H step 09 done
```

`persona_written_at` 은 5에서 블록을 쓴 시각(`변경 없음` 이었으면 확인한 시각), UTC 로
`date -u +%Y-%m-%dT%H:%M:%SZ`. `agent-add` 는 같은 `name` 과 `machine` 조합이 있으면 교체하므로 다시 실행해도 중복되지
않는다.

## 다음 단계

```bash
node .claude/skills/kna-status/state.mjs next
```

- 출력이 `10 kna-10-discord`: Discord 봇은 선택이다. 한 줄로 설명한다(같은 에이전트가 Discord 에서도 답하고 같은
  콜렉션에 쓴다). 원하면 `kna-10-discord` 를 시작하고, 원하지 않으면
  `node .claude/skills/kna-status/state.mjs step 10 skipped` 와
  `node .claude/skills/kna-status/state.mjs set '{"discord":{"enabled":false,"bot_name":null,"host":null}}'` 를 쓴 뒤
  `next` 를 다시 본다.
- fresh 모드에서 10을 끝내거나 건너뛰면 `11 kna-11-backups`.
- join 모드에서 10을 끝내거나 건너뛰면 `complete`. 설치가 끝났다. 다른 머신이나 에이전트를 붙이려면 `kna-12-add-agent`.

시작 전에 묻는다.
