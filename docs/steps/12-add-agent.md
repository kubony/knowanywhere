# 12단계: 머신이나 에이전트 추가

스킬: `kna-12-add-agent`. 요청할 때만 돈다. 설치를 마친 머신에서도, 막 합류하려는 머신에서도 부를 수 있다.

위키는 한 번만 만든다. 그 뒤로 붙는 머신과 에이전트는 연결만 한다. 돈이 드는 일은 없다.

## 무엇을 붙이나

| 경우 | 예 | 콜렉션 | 새 머신에서 도는 단계 |
|---|---|---|---|
| 같은 에이전트, 새 머신 | 맥북의 로제를 데스크탑에서도 | 기존 `로제 Sessions` | 00(join) → 07 → 08(확인만) → 09 → 10(선택) |
| 새 Claude Code 에이전트 | 역할이 다른 리사 | 새 `리사 Sessions` | 00(join) → 07 → 08(생성) → 09 → 10(선택) |
| Codex·Hermes 에이전트 | 지수(Codex), 제니(Hermes) | 새 콜렉션 | [phase 2](../phase2-codex-hermes.md) |
| 같은 에이전트를 Discord 에 | 로제 봇 | 기존 | [10단계](10-discord.md) |

**같은 이름은 같은 에이전트다.** 데스크탑의 로제는 맥북의 로제와 같은 `로제 Sessions` 에 같은 서명(`작성자: 로제`)으로
쓰고, 맥북에서 시작한 작업 문서에 `## Update — <시각> · desktop` 을 이어 붙인다. 이것이 의도한 동작이다. 어느 머신에서
열어도 같은 기록과 같은 연속성을 갖는다. 이름은 대소문자와 철자까지 똑같아야 한다(`로제` 와 `로 제` 는 다른 에이전트다).

**새 이름은 새 에이전트다.** 콜렉션을 하나 새로 받고, 다른 에이전트의 콜렉션은 읽기만 한다. 모든 에이전트는 공유 콜렉션
(`공유 지식`, 영어 템플릿이면 `Shared Knowledge`)을 함께 쓴다.

한 OS 사용자 계정에는 `~/.claude/CLAUDE.md` 와 그 안의 관리 블록이 하나뿐이라, 한 계정에는 Claude Code 에이전트가 하나만
산다. 새 Claude Code 에이전트는 다른 머신이나 다른 사용자 계정에 둔다.

## 새 머신에서

필요한 것: `git`, Node.js 20 이상, Claude Code. 없으면 00단계가 설치 방법을 알려준다.

```bash
git clone https://github.com/kubony/knowanywhere.git
cd knowanywhere
claude
```

인스톨러가 물으면:

| 질문 | 같은 에이전트 | 새 에이전트 |
|---|---|---|
| 모드 | `join` | `join` |
| 에이전트 이름 | 기존 이름 그대로(예: `로제`) | 새 이름(예: `리사`) |
| 다른 머신에 이미 있는 같은 에이전트인가 | 예 | 아니오 |
| 템플릿 언어 | 첫 머신과 같게 | 원하는 대로 |
| 기존 위키 주소 | `https://wiki.example.com` | `https://wiki.example.com` |

그다음 흐름:

1. **07단계.** 이 머신의 Claude Code 를 위키 MCP 에 연결한다. OAuth 로그인은 머신마다 따로 한다.
2. **08단계.** 같은 이름이면 콜렉션이 이미 있으므로 새로 만들거나 설명을 덮지 않고 확인해서 기록만 한다. 새 이름이면
   `<새 이름> Sessions` 를 만들고 규칙을 설명에 넣는다. 공유 콜렉션은 다시 만들지 않는다.
3. **09단계.** 이 머신의 `~/.claude/CLAUDE.md` 에 블록을 넣는다. 같은 에이전트면 첫 머신과 같은 페르소나를 준다(첫
   머신의 `.knowanywhere/persona-lines.md`). 스모크 테스트는 먼저 검색하므로, 같은 에이전트면 첫 머신이 만든
   `knowanywhere 설치` 문서에 이 머신의 Update 를 붙이고, 새 에이전트면 자기 콜렉션에 첫 문서를 만든다.
4. **10단계.** 선택.

## 확인

- 새 머신에서 `list_collections` 가 에러 없이 돈다.
- 같은 에이전트: 설치 문서에 새 머신 이름이 붙은 `## Update — ... · desktop` 이 있다. 첫 머신에서 그 문서를 열어도 보인다.
- 새 에이전트: `list_collections` 에 `리사 Sessions` 가 있고, 그 안에 `작성자: 리사` 로 시작하는 첫 문서가 있다. `로제 Sessions`
  에는 리사가 쓴 문서가 없다.

## Codex·Hermes

v1 인스톨러는 이 런타임들을 설치하지 않는다. 위키 쪽(새 콜렉션)은 지금 있는 머신의 Claude Code 로 만들 수 있고, Codex 용
규칙 블록은 `templates/codex-agents-md.ko.md` 를 채워서 사용자가 `~/.codex/AGENTS.md` 에 직접 붙인다. 무엇이 다른지는
[phase 2 문서](../phase2-codex-hermes.md) 한 페이지에 있다.

## 쓰는 것

새 머신의 state 는 그 머신의 00~09(10) 단계가 쓴다. 첫 머신의 state 에도 남기고 싶으면 확인 뒤에 더한다.

```bash
node .claude/skills/kna-status/state.mjs agent-add '{"name":"로제","machine":"desktop","kind":"claude","sessions_collection":"로제 Sessions"}'
```

`steps.12` 는 `pending` 으로 남는다. 요청할 때마다 다시 도는 단계다.
