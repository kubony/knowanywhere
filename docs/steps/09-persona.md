# 09단계: 페르소나와 규칙 블록

스킬: `kna-09-persona`. `fresh` 와 `join` 모드 모두에서 돈다.

이 단계는 에이전트의 페르소나를 몇 가지 질문으로 정하고, 페르소나와 위키 기록 규칙을 담은 블록 하나를
`~/.claude/CLAUDE.md` 에 넣는다. 그 파일은 이 머신의 모든 Claude Code 세션이 어느 디렉터리에서든 읽는다. 마지막으로
에이전트가 규칙대로 이 설치에 대한 첫 세션 문서를 위키에 쓴다. 돈이 드는 일은 없다.

## 이름은 정체성이다

에이전트 이름은 머신 라벨이 아니다. 맥북의 Claude Code, 데스크탑의 Claude Code, Discord 봇이 모두 `로제` 라는 이름을
쓰면 위키에게는 에이전트 하나다.

- 같은 콜렉션 `로제 Sessions` 에 쓴다.
- 같은 서명을 쓴다. 문서 첫 줄 `작성자: 로제`, 마지막 줄 `최종 갱신: 로제 · <시각>`.
- 맥북에서 시작한 작업을 데스크탑이나 Discord 에서 같은 문서에 이어 쓴다. 어느 머신에서 썼는지는
  `## Update — <시각> · <머신>` 제목 끝의 머신 이름으로 남는다.

새 이름은 역할이나 런타임이 다른 에이전트에만 준다.

| 에이전트 | 런타임 | 도는 곳 | 세션 콜렉션 |
|---|---|---|---|
| 로제 | Claude Code | 맥북, 데스크탑, Discord 봇 | `로제 Sessions` |
| 지수 | Codex | 맥북, 데스크탑, Discord 봇 | `지수 Sessions` |
| 제니 | Hermes | GCP VM, Discord | `제니 Sessions` |
| 리사 | Claude Code | 새로 들이는 에이전트 | `리사 Sessions` |

모든 에이전트가 공유 콜렉션 `공유 지식`(영어 템플릿이면 `Shared Knowledge`)을 함께 읽고 쓴다. v1 인스톨러는 Claude Code 에이전트만 설치한다. 지수와 제니 같은
Codex·Hermes 에이전트는 [phase 2](../phase2-codex-hermes.md) 다.

## 질문

한 번에 하나씩 묻는다. 질문지 원본은 [`templates/persona.md`](../../templates/persona.md) 다.

1. **이름 확인.** 00단계에서 정한 `agent.name`. 여기서 바꾸지 않는다(바꾸면 콜렉션도 새로 필요하다).
2. **머신 이름.** 기본값은 `hostname -s`. 예: `mbp`, `desktop`.
3. **한 줄 역할.** 예: "개인 프로젝트의 코딩, 조사, 홈랩 관리를 함께 하는 파트너."
4. **말투.** 예: "담백하고 직접적으로. 답부터 쓰고 근거를 붙인다."
5. **언어 정책.** 기본값: 사용자가 쓰는 언어로 답하고 코드, 명령어, 경로는 원문 그대로 둔다.
6. **경계.** 기본값(비밀값을 드러내지 않는다, 돈이 드는 일·데이터 삭제·공유 branch push 전에는 묻는다)에 더할 것.

답은 이런 네 줄이 된다.

```
- 역할: 개인 프로젝트의 코딩, 조사, 홈랩 관리를 함께 하는 파트너.
- 말투: 담백하고 직접적으로. 답부터 쓰고 근거를 붙인다. 격려나 감탄은 넣지 않는다.
- 언어: 사용자가 쓰는 언어로 답한다. 위키 문서는 대화 언어로 쓴다. 코드, 명령어, 경로는 원문 그대로 둔다.
- 경계: 비밀값(토큰, 키, 비밀번호)을 드러내지 않는다. 돈이 드는 일, 데이터 삭제, `main` push 전에는 묻는다.
```

## 블록

템플릿은 [`templates/claude-md-block.ko.md`](../../templates/claude-md-block.ko.md) (영어판 `.en.md`)다. 인스톨러가
placeholder 여섯 개(`{{AGENT_NAME}}`, `{{PERSONA}}`, `{{WIKI_URL}}`, `{{MCP_SERVER_NAME}}`, `{{SESSIONS_COLLECTION}}`,
`{{SHARED_COLLECTION}}`)를 state 와 답으로 채운다. 블록은 마커 두 줄 사이에 있고, 인스톨러는 그 사이만 고친다.

```
<!-- knowanywhere:start -->
## 공유 위키: 로제 (knowanywhere 관리 블록)
...페르소나, 위키 주소와 MCP 서버, 세션 기록 규칙, 공유 지식 규칙, 다른 에이전트, 위키에 닿지 않을 때...
<!-- knowanywhere:end -->
```

인스톨러는 넣기 전에 렌더링한 블록 전체와 대상 경로를 보여주고 yes 를 기다린다.

```bash
M=.claude/skills/kna-09-persona/managed-block.mjs
node $M render --template templates/claude-md-block.ko.md --values .knowanywhere/block-values.json --out .knowanywhere/claude-md-block.md
node $M show  --target ~/.claude/CLAUDE.md                                  # 지금 들어 있는 블록, 없으면 "없음"
node $M apply --block .knowanywhere/claude-md-block.md --target ~/.claude/CLAUDE.md --dry-run
node $M apply --block .knowanywhere/claude-md-block.md --target ~/.claude/CLAUDE.md
```

`apply` 의 동작:

- 마커가 없으면 파일 끝에 덧붙이고, 있으면 그 구간을 교체하고, 파일이 없으면 만든다.
- 쓰기 전에 기존 파일을 `~/.claude/CLAUDE.md.bak-<YYYYMMDDTHHMMSSZ>` 로 복사한다. 이전 백업은 덮지 않는다.
- 같은 블록이면 `변경 없음` 을 출력하고 아무것도 쓰지 않는다. 몇 번을 돌려도 블록은 하나다.
- 마커가 짝이 안 맞으면 exit 3 으로 거부하고 아무것도 쓰지 않는다.

`~/.claude/CLAUDE.md` 의 마커 밖에 이미 다른 위키 규칙이 있으면 에이전트가 두 규칙을 함께 읽는다. 인스톨러는 그 사실만
알리고 마커 밖은 고치지 않는다.

되돌리려면 백업을 복사해 오거나(`cp ~/.claude/CLAUDE.md.bak-20260915T094000Z ~/.claude/CLAUDE.md`) 마커 두 줄과 그 사이를
지운다.

## 확인

```bash
grep -c '^<!-- knowanywhere:start -->$' ~/.claude/CLAUDE.md                              # 1
(cd "$(mktemp -d)" && claude -p '너의 에이전트 이름과 세션 기록 콜렉션 이름만 한 줄로 답하라.')   # 로제, 로제 Sessions
```

그다음 에이전트가 `로제 Sessions` 에서 `knowanywhere` 로 먼저 검색하고, 없으면 `2026-09-15 · knowanywhere 설치` 문서를
만든다. 첫 줄 `작성자: 로제 · 상태: 🟡 진행 중`, `## 배경`, `## 완료 조건`, 이 머신 이름이 붙은 `## Update`, 마지막 줄
`최종 갱신: 로제 · <시각>`. 다른 머신에서 같은 에이전트로 이미 만든 문서가 있으면 새로 만들지 않고 Update 만 붙인다.
에이전트가 문서를 다시 읽어 URL 을 보여주면 끝이다.

## 쓰는 것

```bash
node .claude/skills/kna-status/state.mjs set '{"agent":{"persona_written_at":"2026-09-15T09:40:00Z"}}'
node .claude/skills/kna-status/state.mjs agent-add '{"name":"로제","machine":"mbp","kind":"claude","sessions_collection":"로제 Sessions"}'
node .claude/skills/kna-status/state.mjs step 09 done
```

`.knowanywhere/` 에 `persona-lines.md`, `block-values.json`, `claude-md-block.md` 가 남는다. 비밀값이 없고 커밋되지 않으며,
10단계가 Discord 페르소나를 만들 때 다시 쓴다.

## 다음

- [10단계: Discord 봇](10-discord.md) (선택. 건너뛸 수 있다)
- `fresh`: 그다음 [11단계: 백업](11-backups.md)
- `join`: 10단계를 끝내거나 건너뛰면 설치가 끝난다. 머신이나 에이전트를 더 붙이려면 [12단계](12-add-agent.md).
