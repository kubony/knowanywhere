# state 파일: `.knowanywhere/state.json`

인스톨러는 진행 상황을 클론 안의 `.knowanywhere/state.json` 에 기록한다. 새 Claude Code 세션은 이 파일로 어디서
멈췄는지 안다. 이 디렉터리는 `.gitignore` 에 들어 있어 커밋되지 않는다.

## 규칙

- **비밀이 아닌 값만 쓴다.** 이유는 아래 "비밀값을 두지 않는 이유"에 있다.
- **클론 하나에 파일 하나.** state 는 이 머신의 설치를 설명한다. 같은 위키에 합류하는 두 번째 머신은 자기 클론과
  자기 state 파일(`mode: "join"`)을 갖는다.
- **원자적으로 쓴다.** 같은 디렉터리의 임시 파일에 쓴 뒤 `state.json` 위로 rename 한다. 쓰는 도중 멈춰도 옛 파일이나
  새 파일 둘 중 하나만 남고, 반쯤 쓴 파일은 남지 않는다.
- **모든 스킬은 state 를 먼저 읽는다.** 필요한 키가 없으면 빠진 키와 그 키를 쓰는 단계를 말하고 일찍 멈춘다.
- **시각**은 UTC 의 ISO 8601 이다. 예: `2026-09-15T05:12:00Z`.

## 도우미

`.claude/skills/kna-status/state.mjs`(Node 20 이상, 의존성 없음)가 위 규칙을 구현한다. 객체는 deep-merge 하고,
배열과 스칼라는 통째로 바꾸고, 원자적으로 쓴다. 키 이름에 `secret`, `token`, `passw`, `private`, `api_key`, `hmac`,
`credential` 이 들어 있거나 값이 알려진 비밀값 형식(Google OAuth client secret, GCS/AWS HMAC id, Discord bot token,
private key 블록, JWT, 흔한 API 키 접두사)처럼 보이면 쓰지 않고 exit code 2 로 끝난다. 거부할 때도 값은 출력하지 않는다.

```bash
H=.claude/skills/kna-status/state.mjs
node $H init                                   # version, created_at, 모든 단계 pending 으로 생성
node $H set '{"gcp":{"region":"asia-northeast3","zone":"asia-northeast3-a"}}'
node $H step 01 done                           # steps.01 = {status: "done", at: 지금}
node $H mode join                              # mode 를 쓰고 fresh 전용 단계 01~06, 11 을 skipped 로 표시
node $H agent-add '{"name":"로제","machine":"macbook","kind":"claude","sessions_collection":"로제 Sessions"}'
node $H get gcp.project_id                     # 값 하나를 JSON 으로 출력
node $H next                                   # 예: "03 kna-03-vm", 다 끝났으면 "complete"
node $H status                                 # 표. 기계가 읽을 출력은 --json
```

`next` 의 출력 형식(`<id> <skill>` 또는 `complete`)과 `status --json` 의 키는 스킬이 읽으므로 바꾸지 않는다.

## 키

| 키 | 타입 | 쓰는 단계 | 뜻 |
|---|---|---|---|
| `version` | integer | 00 (`init`) | 스키마 버전. 현재 `1` |
| `created_at` | string (ISO) | 00 (`init`) | state 파일을 만든 시각 |
| `mode` | `"fresh"` \| `"join"` | 00 | 새 위키를 만든다, 또는 있는 위키에 연결한다 |
| `language` | `"en"` \| `"ko"` | 00 | 위키와 `~/.claude/CLAUDE.md` 에 쓸 규칙 템플릿의 언어. 대화 언어는 이것과 관계없이 사용자 언어를 따른다 |
| `agent.name` | string | 00 | 에이전트 이름. 예: `로제`. 콜렉션 이름 `로제 Sessions` 와 문서 서명 줄이 된다 |
| `agent.persona_written_at` | string (ISO) | 09 | `~/.claude/CLAUDE.md` 에 관리 블록을 쓴 시각 |
| `prereqs.gcloud` | string \| `null` | 00 | 확인한 버전. 없으면 `null`(`join` 모드에서는 필요 없다) |
| `prereqs.node` | string | 00 | 확인한 버전. 20 이상이어야 한다 |
| `prereqs.claude` | string | 00 | 확인한 Claude Code 버전 |
| `prereqs.git` | string | 00 | 확인한 git 버전 |
| `prereqs.checked_at` | string (ISO) | 00 | 확인한 시각 |
| `domain.kind` | `"own"` \| `"sslip"` \| `null` | 00 | 내 도메인, 또는 무료 `sslip.io` 대안. `join` 모드에서는 `null` |
| `gcp.project_id` | string | 01 | 예: `kna-wiki-a1b2` |
| `gcp.billing_account_last4` | string | 01 | 결제 계정 id 의 끝 4자리만 |
| `gcp.region` | string | 01 | 예: `asia-northeast3` |
| `gcp.zone` | string | 01 | 예: `asia-northeast3-a` |
| `gcp.budget_usd` | number \| `null` | 02 | 월 예산(USD, 결제 통화가 USD 가 아니면 환산값). 건너뛰면 `null` |
| `vm.name` | string | 03 | 예: `kna-wiki-vm` |
| `vm.zone` | string | 03 | VM 을 만든 zone |
| `vm.ip` | string | 03 | 예약한 고정 외부 IP. 예: `203.0.113.10` |
| `vm.ssh_user` | string | 03 | `gcloud compute ssh` 가 만든 VM 로그인 사용자 |
| `vm.service_account` | string | 03 | VM 에 붙인 전용 서비스 계정 email. 예: `outline-vm@kna-wiki-a1b2.iam.gserviceaccount.com`. 프로젝트 역할이 없고, 11단계가 backups 버킷의 `roles/storage.objectCreator` 만 준다 |
| `wiki.host` | string | 04 (`join` 은 00) | 예: `wiki.example.com` 또는 `wiki-203-0-113-10.sslip.io` |
| `wiki.url` | string | 06 (`join` 은 00) | 예: `https://wiki.example.com` |
| `wiki.buckets.uploads` | string | 06 | 첨부 파일용 GCS 버킷 |
| `wiki.buckets.backups` | string | 06 | DB 덤프용 GCS 버킷 |
| `wiki.deployed_at` | string (ISO) | 06 | 첫 배포에 성공한 시각 |
| `wiki.collections.sessions` | `{agent, name, id}` 배열 | 08 | 이 설치가 만들거나 확인한 `<Agent> Sessions` 콜렉션. `id` 는 Outline 콜렉션 id |
| `wiki.collections.shared` | `{name, id}` | 08 | 공유 콜렉션. 기본 이름은 `language` 가 `ko` 면 `공유 지식`, `en` 이면 `Shared Knowledge` |
| `oauth.client_id` | string | 05 | Google OAuth 웹 클라이언트 id(원래 공개되는 값). client secret 은 여기 두지 않는다 |
| `mcp.server_name` | string | 07 | Claude Code 에 등록한 MCP 서버 이름. 예: `outline` |
| `mcp.verified_at` | string (ISO) | 07 | `list_collections` 가 마지막으로 성공한 시각 |
| `discord.enabled` | boolean | 10 | Discord 브리지를 설치했는지 |
| `discord.bot_name` | string \| `null` | 10 | 봇 표시 이름 |
| `discord.host` | string \| `null` | 10 | 브리지가 도는 곳. 예: `vm`, `desktop` |
| `backup.snapshot_policy` | string | 11 | resource policy 이름. 예: `kna-daily-snapshot` |
| `backup.verified_at` | string (ISO) | 11 | 스냅샷과 덤프를 둘 다 확인한 시각 |
| `agents[]` | 배열 | 09, 10, 12 | 머신별 에이전트마다 한 항목. 아래 표. 10단계는 브리지를 VM 에서 돌릴 때 VM 항목을 더한다 |
| `steps.<id>.status` | `"pending"` \| `"done"` \| `"skipped"` | 모든 단계 | `<id>` 는 `"00"` 부터 `"12"` |
| `steps.<id>.at` | string (ISO) \| `null` | 모든 단계 | status 가 `done` 이나 `skipped` 로 바뀐 시각 |

`agents[]` 항목:

| 필드 | 타입 | 뜻 |
|---|---|---|
| `name` | string | 에이전트 이름. 예: `로제` |
| `machine` | string | 머신을 가리키는 짧은 이름. 예: `macbook`(기본 제안값: `hostname -s`) |
| `kind` | `"claude"` \| `"codex"` \| `"hermes"` | 런타임. v1 은 `claude` 만 설치하고 나머지는 phase 2 다 |
| `sessions_collection` | string | 이 에이전트가 세션 기록을 쓰는 콜렉션 |

같은 `name` 과 `machine` 조합으로 `agent-add` 를 다시 부르면 항목을 새로 추가하지 않고 교체한다.

`12` 단계는 요청 시에만 돈다. 계속 `pending` 으로 남고 `next` 는 이 단계를 고르지 않는다.

## 예시

```json
{
  "version": 1,
  "created_at": "2026-09-15T05:00:00Z",
  "mode": "fresh",
  "language": "ko",
  "agent": { "name": "로제", "persona_written_at": "2026-09-15T09:40:00Z" },
  "prereqs": {
    "gcloud": "560.0.0",
    "node": "22.11.0",
    "claude": "2.1.0",
    "git": "2.45.2",
    "checked_at": "2026-09-15T05:01:10Z"
  },
  "domain": { "kind": "own" },
  "gcp": {
    "project_id": "kna-wiki-a1b2",
    "billing_account_last4": "C3D4",
    "region": "asia-northeast3",
    "zone": "asia-northeast3-a",
    "budget_usd": 40
  },
  "vm": {
    "name": "kna-wiki-vm",
    "zone": "asia-northeast3-a",
    "ip": "203.0.113.10",
    "ssh_user": "rose",
    "service_account": "outline-vm@kna-wiki-a1b2.iam.gserviceaccount.com"
  },
  "wiki": {
    "host": "wiki.example.com",
    "url": "https://wiki.example.com",
    "buckets": { "uploads": "kna-wiki-a1b2-uploads", "backups": "kna-wiki-a1b2-backups" },
    "deployed_at": "2026-09-15T08:05:00Z",
    "collections": {
      "sessions": [{ "agent": "로제", "name": "로제 Sessions", "id": "00000000-0000-4000-8000-000000000001" }],
      "shared": { "name": "공유 지식", "id": "00000000-0000-4000-8000-000000000002" }
    }
  },
  "oauth": { "client_id": "123456789012-example.apps.googleusercontent.com" },
  "mcp": { "server_name": "outline", "verified_at": "2026-09-15T08:30:00Z" },
  "discord": { "enabled": false, "bot_name": null, "host": null },
  "backup": { "snapshot_policy": "kna-daily-snapshot", "verified_at": "2026-09-16T03:40:00Z" },
  "agents": [
    { "name": "로제", "machine": "macbook", "kind": "claude", "sessions_collection": "로제 Sessions" }
  ],
  "steps": {
    "00": { "status": "done", "at": "2026-09-15T05:01:30Z" },
    "01": { "status": "done", "at": "2026-09-15T05:30:00Z" },
    "02": { "status": "done", "at": "2026-09-15T05:40:00Z" },
    "03": { "status": "done", "at": "2026-09-15T06:10:00Z" },
    "04": { "status": "done", "at": "2026-09-15T06:30:00Z" },
    "05": { "status": "done", "at": "2026-09-15T07:20:00Z" },
    "06": { "status": "done", "at": "2026-09-15T08:05:00Z" },
    "07": { "status": "done", "at": "2026-09-15T08:30:00Z" },
    "08": { "status": "done", "at": "2026-09-15T09:00:00Z" },
    "09": { "status": "done", "at": "2026-09-15T09:40:00Z" },
    "10": { "status": "skipped", "at": "2026-09-15T09:45:00Z" },
    "11": { "status": "done", "at": "2026-09-16T03:40:00Z" },
    "12": { "status": "pending", "at": null }
  }
}
```

참고: Node 는 정수처럼 보이는 객체 키를 먼저 정렬하므로 실제 파일에서는 `"10"`, `"11"`, `"12"` 가 `"00"` 보다
앞에 나올 수 있다. 순서에는 의미가 없으니 단계는 id 로 읽는다.

`join` 머신의 파일은 더 짧다. `mode: "join"`, 00단계가 쓴 `wiki.host` 와 `wiki.url`, `skipped` 인 01~06 과 11 단계가
있고 `gcp`, `vm`, `backup` 키는 없다.

## 비밀값을 두지 않는 이유

state 파일은 세션을 시작할 때마다 에이전트 컨텍스트로 읽히고, `/kna-status` 가 출력하고, 버그 리포트나 스크린샷에
붙여 넣기 쉽다. 게다가 Git 작업 트리 옆에 있어서 `git add -f` 한 번이면 공개된다. 뒤 단계 중 state 에서 비밀값을
꺼내 쓰는 단계는 없다. 비밀값은 그것을 쓰는 머신에서 만들어 그 머신의 mode 600 `.env` 파일 한 곳에만 둔다(위키라면
VM 의 `/opt/outline/.env`). 비밀값을 교체해도 그 `.env` 만 바뀌고 state 파일은 그대로 유효하다.
