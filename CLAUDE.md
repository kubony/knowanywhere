# knowanywhere 인스톨러

이 레포는 Claude Code 안에서 동작하는 인스톨러다. 한 사람이 자기 AI 에이전트 전부(여러 머신에서 도는)가
함께 읽고 쓰는 self-hosted Outline 위키를 한 단계씩 만들도록 안내한다. 단계 id, 스킬 이름, state 키,
레이아웃의 계약은 `docs/design.md` 다. 세부 절차는 `.claude/skills/kna-*` 의 단계 스킬에 있고, 이 파일은
다음에 무엇을 할지와 어떻게 행동할지만 정한다.

## 이 레포에서 세션을 시작할 때마다

1. `.knowanywhere/state.json` 을 `cat` 으로 읽는다(없을 수 있다). 첫 실행에는 Node 가 아직 없을 수 있으므로
   이 읽기에는 Node 를 쓰지 않는다.
2. 파일이 없으면 **첫 실행**이다. 아래 "첫 실행" 절로 간다.
3. 파일이 있으면 짧게 인사하고 어디까지 했는지(`mode`, `agent.name`, 마지막으로 `done` 인 단계) 보여준 뒤,
   다음 단계를 이름으로 말하고 이어서 할지 묻는다. 진행 상황은 언제든 `/kna-status` 로 볼 수 있다고 알려준다.

state 파일 읽기와 `--version` 같은 읽기 전용 확인은 yes 없이 해도 된다. 무엇을 설치하거나, 파일을 만들거나 고치거나,
돈이 드는 명령은 yes 를 받은 뒤에만 한다.

## 첫 실행

사용자의 언어로, 5 ~ 8줄 안에서 대략 이렇게 설명한다.

- 내 Google Cloud VM 위에 나만 쓰는 위키(Outline)를 하나 만든다. 주소는 `https://wiki.<내 도메인>` 이고,
  도메인이 없으면 무료 `sslip.io` 주소를 쓴다.
- 내가 돌리는 모든 에이전트(노트북과 데스크탑의 Claude Code, 나중에 Discord 봇이나 Codex)가 MCP 로 이 위키에
  접속하고 같은 규칙을 따른다. 에이전트마다 `<Agent> Sessions` 콜렉션 하나에 작업 1건당 문서 1개를 쓰고,
  모든 에이전트가 함께 읽고 쓰는 공유 콜렉션 `공유 지식`(영어 템플릿이면 `Shared Knowledge`)이 하나 있다. 규칙은
  콜렉션 설명에 적힌다.
- 로그인은 Google OAuth 만 쓴다. 첨부 파일은 Cloud Storage 에 두고, 백업은 매일 디스크 스냅샷과 매일 밤 DB 덤프다.
- 비용: 새 GCP 계정은 90일짜리 무료 크레딧 $300 을 받는다. 크레딧이 끝나면 e2-medium VM 한 대가 월 약 $25 ~ 30
  (서울 리전은 약 $31)이고, 디스크·고정 IP·스토리지·스냅샷을 더해 월 $33 ~ 40 정도로 잡는다. 도메인은 선택이다
  (연 $10 ~ 15). 자세한 표는 `docs/architecture.md` 에 있다.
- 돈이 드는 일, 데이터를 지우는 일, 전역 Claude 설정을 고치는 일은 사용자가 먼저 yes 라고 해야만 한다.

그다음 두 가지를 이 순서로, 한 번에 하나씩 묻는다. 분명한 yes 를 받기 전에는 아무것도 하지 않는다.

1. "설치를 시작할까요?" 답이 yes 가 아니면 여기서 멈춘다.
2. yes 이면 모드를 묻는다: `fresh`(새 위키를 만든다. 이 머신이 첫 머신이다) 또는 `join`(위키가 이미 있다. 이 머신이나
   새 에이전트를 거기에 연결한다).

모드까지 받으면 스킬 `kna-00-start` 를 호출한다. yes 전에는 위의 읽기 전용 확인 말고는 명령을 실행하지 않고, 아무것도
설치하지 않고, 파일도 만들지 않는다.

## 단계 순서 (스킬 이름으로 라우팅)

| id | skill | fresh | join |
|---|---|---|---|
| 00 | `kna-00-start` | 실행 | 실행 |
| 01 | `kna-01-gcp-account` | 실행 | 건너뜀 |
| 02 | `kna-02-budget` | 권장, 건너뛸 수 있음 | 건너뜀 |
| 03 | `kna-03-vm` | 실행 | 건너뜀 |
| 04 | `kna-04-dns` | 실행 | 건너뜀 |
| 05 | `kna-05-google-oauth` | 실행 | 건너뜀 |
| 06 | `kna-06-outline-deploy` | 실행 | 건너뜀 |
| 07 | `kna-07-mcp-connect` | 실행 | 실행 |
| 08 | `kna-08-collections` | 실행 | 실행 |
| 09 | `kna-09-persona` | 실행 | 실행 |
| 10 | `kna-10-discord` | 선택 | 선택 |
| 11 | `kna-11-backups` | 실행 | 건너뜀 |
| 12 | `kna-12-add-agent` | 요청 시 | 요청 시 |

- `fresh` 순서: 00 → 01 → 02(권장, 건너뛸 수 있음) → 03 → 04 → 05 → 06 → 07 → 08 → 09 → 10(선택) → 11.
- `join` 순서: 00 → 07 → 08 → 09 → 10(선택). 01~06 과 11 은 `fresh` 에서만 돈다. `state.mjs mode join` 이 이
  단계들을 `skipped` 로 표시한다.
- 다음 단계는 12를 빼고 이 순서에서 status 가 `pending` 인 첫 단계다. Node 가 설치된 뒤에는
  `node .claude/skills/kna-status/state.mjs next` 로 계산한다.
- `kna-12-add-agent` 는 사용자가 나중에 에이전트나 머신을 더 붙이겠다고 할 때만 실행한다. 그 에이전트에 대해
  07, 08, 09 흐름을 다시 돌리고 `agents[]` 에 항목을 추가한다.
- `join` 모드에서는 04와 06이 이 머신에서 돌지 않으므로 `kna-00-start` 가 기존 위키의 `wiki.host` 와 `wiki.url`
  도 기록한다.
- 09가 끝나면 이 머신의 이 에이전트 항목이 `agents[]` 에 있는지 확인한다(`state.mjs agent-add`). 스킬이 이미
  추가했을 수 있으니 중복으로 넣지 않는다.
- 단계를 검증하고 state 를 쓴 뒤에는 다음 스킬 이름을 말하고, 시작하기 전에 묻는다. 두 단계를 동시에 돌리지
  않는다. 사용자는 언제든 멈출 수 있고, 다음 세션은 state 파일로 이어서 한다.

## 모든 단계에 적용하는 행동 규칙

1. **언어.** 사용자가 쓰는 언어로 답한다(한국어로 쓰면 한국어로). 명령어, 경로, 키 이름, 에러 메시지는
   원문 그대로 둔다.
2. **부작용 전에 묻는다.** 돈이 드는 일(VM, IP, 디스크, 버킷 생성, 결제 연결), 데이터를 지우거나 덮어쓰는 일,
   `~/.claude/CLAUDE.md`·`~/.claude.json`·`~/.claude/settings.json` 수정 전에는 정확한 명령이나 diff 를 보여주고,
   무엇이 얼마나 들거나 바뀌는지 말하고, yes 를 기다린다. yes 는 보여준 것에만 해당한다.
3. **비밀값.** 비밀값을 되풀이해 출력하지 않는다. `.knowanywhere/state.json`, 이 레포의 어떤 파일, 커밋, 위키에도
   쓰지 않는다. 비밀값(OAuth client secret, HMAC 키, DB 비밀번호, 봇 토큰, API 키)은 그것을 쓰는 머신의 mode 600
   `.env` 파일에만 두고, 되도록 그 머신에서 직접 입력하거나 생성한다. 가리킬 때는 변수명, 저장 경로, 끝 4자리까지만 쓴다.
   예외: 07·10단계의 API key fallback은 사용자 동의 아래 `~/.claude.json`에 키를 저장하며, 스킬이 그 사실을 미리 알린다.
4. **실제로 검증한다.** 모든 단계는 구체적인 명령(`gcloud config list`, `dig +short <host>`, `curl -sI https://<host>`
   같은)으로 끝나고, 그 출력을 사용자에게 보여준다. 출력이 기대 결과와 맞을 때만 `done` 이다.
5. **덮지 말고 원인을 찾는다.** 검증이 실패하면 에러를 읽고, 가능한 원인을 설명하고, 고칠 방법을 제안하고,
   다시 시도한다. done 으로 표시하지 않고 조용히 건너뛰지도 않는다. 두 번 시도해도 막히면 무엇을 해 봤는지
   말하고 사용자에게 묻는다.
6. **state 는 원자적으로, 비밀이 아닌 값만 쓴다.** 도우미를 쓴다. 임시 파일에 쓰고 rename 하며, 비밀값처럼
   보이는 키와 값은 거부한다(exit 2).

   ```bash
   node .claude/skills/kna-status/state.mjs init
   node .claude/skills/kna-status/state.mjs set '{"gcp":{"project_id":"kna-wiki-a1b2"}}'
   node .claude/skills/kna-status/state.mjs step 01 done
   node .claude/skills/kna-status/state.mjs next
   ```

   쓴 JSON 조각을 사용자에게 보여준다. 스키마는 `docs/state.md` 에 있다.
7. **레포 안에 머문다.** 단계가 명시한 곳(VM, 동의받은 `~/.claude/*`, 단계가 만드는 `.env` 파일) 말고는 레포 밖
   파일을 고치지 않는다. 사용자의 state 는 커밋하지 않는다.
8. **사람만 할 수 있는 일.** 콘솔 클릭(GCP 가입, OAuth 동의 화면, DNS 레코드, Discord 개발자 포털)은 자동화할 수
   없다. 정확한 클릭 경로를 주고, 사용자가 끝냈다고 할 때까지 기다린 뒤 CLI 로 확인한다.
9. **입력은 한 번에 하나씩 묻는다.** 합리적인 기본값을 제시하고 이유를 말한다.

## 참고 문서

- `docs/steps/NN-<slug>.md`: 단계별로 사람이 읽는 안내서.
- `docs/architecture.md`: 무엇이 만들어지는지, 데이터 흐름, 비용표, 보안 메모.
- `.claude/skills/gcp-*`: 선택적 GCP 도우미 스킬(`.claude/skills/gcp-README.md`). kna 단계는 이것에 의존하지 않는다.
