# knowanywhere 설계 명세 (v0, 2026-09-15)

**한 줄 요약:** Claude Code 로 열면 *인스톨러*처럼 동작하는 GitHub 레포다. 처음 쓰는 사람이 여러 머신(노트북, 데스크탑,
클라우드 VM, Discord)에서 도는 AI 에이전트 여럿이 self-hosted Outline 위키 하나를 함께 읽고 쓰는 구성을 한 단계씩
따라 만들게 한다. 돈이 들거나 되돌릴 수 없는 일은 매번 동의를 받는다.

이 파일은 하위 작업들 사이의 계약이다. 여기서 정한 이름(단계 id, state 키, 디렉터리 레이아웃)은 고정이다. 바꾸려면
이 파일부터 고친다.

## 1. 목표 경험

1. 사용자가 `git clone <repo> && cd knowanywhere && claude` 를 실행한다.
2. 루트 `AGENTS.md` 가 Claude 에게 `.knowanywhere/state.json` 을 읽게 한다(첫 실행에는 없다). Claude 는 무엇을 만들고
   얼마가 드는지(GCP 무료 크레딧, 크레딧 뒤 e2-medium VM 한 대 월 약 $25 ~ 30)를 5 ~ 8줄로 설명하고 **시작할지 묻는다**.
   사용자가 yes 라고 하기 전에는 아무것도 실행하지 않는다.
3. 단계 하나 = `.claude/skills/kna-NN-<slug>/SKILL.md` 스킬 하나. 단계는 (a) 목표와 선행 조건을 말하고, (b) 필요한 것을
   묻고, (c) 작업을 실행하거나 사람이 하도록 *안내한다*(콘솔 클릭은 자동화할 수 없으므로 정확한 클릭 경로를 준다),
   (d) 구체적인 명령으로 검증하고 출력을 보여주고, (e) 결과를 state 에 쓰고, (f) 다음 단계 이름을 말한다.
4. 사용자는 언제든 멈출 수 있고, 레포를 다시 열면 state 로 이어서 한다. `/kna-status` 가 진행 상황을 보여준다.
5. 언어: 산출물(스킬, 문서, 템플릿, README)은 한국어가 정본이다. `*.en.md` 와 `README.en.md` 는 영어 번역이다.
   인스톨러는 **사용자가 쓰는 언어로 답한다**. 위키와 `~/.claude/CLAUDE.md` 에 넣는 규칙 템플릿은 `ko` 와 `en` 두 벌이고,
   00단계가 고른 `language` 로 정한다.
6. 원칙: *눈감고 자동화하지 않고 안내한다*. 돈이 드는 일, 데이터를 지우는 일, `~/.claude/CLAUDE.md`·`~/.claude.json` 을
   건드리는 일은 먼저 보여주고 확인받는다. 비밀값은 되풀이해 출력하지 않고, state 와 레포에 쓰지 않으며, 그것을 쓰는
   머신의 `.env` 파일(mode 600)에만 둔다. 사용자의 전역 gcloud 설정(`gcloud config set`)은 바꾸지 않고, gcloud 명령마다
   `--project` 와 필요한 `--zone`, `--region` 을 붙인다.

## 2. 설치되는 구조

```
laptop  ── Claude Code (agent "A") ──┐
desktop ── Claude Code (agent "A") ──┤   MCP over HTTPS (/mcp)
cloud VM ─ Discord bridge (agent "A")┼──▶ Outline wiki (GCP VM: Caddy → outline → postgres/redis, files on GCS)
later:     Codex (agent "B"), Hermes ┘
```

지식 규칙(사람들이 실제로 궁금해하는 부분):
- 에이전트마다 콜렉션 하나: `<Agent> Sessions`. 그 에이전트만 쓴다. *작업* 1건당 문서 1개이고, 세션과 머신을 넘어
  이어 쓴다(만들기 전에 검색한다).
- 모든 에이전트가 읽고 쓰는 공유 콜렉션 하나. 기본 이름은 템플릿 언어가 `ko` 면 `공유 지식`, `en` 이면
  `Shared Knowledge` 다. 사용자에 대한 사실, 프로젝트, 컨벤션, 결정을 둔다. 세션 로그는 여기 쓰지 않고, 거기서 걸러낸
  지식만 옮긴다.
- 콜렉션 *설명*(overview)에 규칙을 적는다. 에이전트는 쓰기 전에 그것을 읽는다.
- 문서 뼈대: 서명 줄 `작성자: <agent>`, 상태 이모지(⚪ 대기 / 🟡 진행 중 / 🔴 차단됨 / ✅ 완료 / ⚫ 취소), `## 배경`,
  `## 완료 조건`, 의미 있는 단위마다 붙이는 `## Update — <시각>`, 근거를 담은 `## 완료 기록`, 끝줄
  `최종 갱신: <agent> · <시각>`. 영어 템플릿은 같은 자리에 `Author:`, `## Background`, `## Done when`,
  `## Completion record`, `Last updated:` 를 쓴다.
- 위키에 비밀값을 쓰지 않는다. 경로, 변수명, 끝 4자리까지만 쓴다.
- 평평하게 둔다. 세션 콜렉션에는 하위 문서를 만들지 않는다.

권한 설계(03, 06, 11단계):
- VM 에는 03단계가 만드는 전용 서비스 계정 `outline-vm@<project>.iam.gserviceaccount.com` 을 붙인다. 프로젝트 역할은
  주지 않는다. 새 개인 프로젝트의 기본 Compute 서비스 계정에는 프로젝트 Editor 역할이 붙어 있어서, 그것을 VM 에 붙이면
  VM 이 프로젝트 전체를 바꿀 수 있기 때문이다. access scope 는 `cloud-platform` 이지만 IAM 역할이 없는 계정이라 실제로는
  아무것도 하지 못한다.
- 11단계가 `outline-vm` 에 backups 버킷의 `roles/storage.objectCreator` 하나만 준다. VM 은 덤프를 새로 올릴 수만 있고,
  기존 덤프를 읽거나 덮거나 지우지 못한다.
- Outline 은 06단계가 만드는 서비스 계정 `outline-storage` 의 HMAC 키로 uploads 버킷에만 접근한다(`roles/storage.objectAdmin`,
  uploads 버킷 한정).

## 3. 레포 레이아웃

```
AGENTS.md                      인스톨러의 두뇌 (core)
README.md (ko) / README.en.md  무엇을, 왜, 어떻게. 2분 안에 읽는다 (core)
LICENSE                        MIT (core)
docs/design.md                 이 파일
docs/architecture.md           구성도, 데이터 흐름, 비용표 (core)
docs/state.md                  state.json 스키마 (core)
docs/steps/NN-<slug>.md        단계별로 사람이 읽는 안내서 (주인 = 그 단계 담당)
.claude/skills/kna-NN-<slug>/SKILL.md   단계 스킬 (§4)
.claude/skills/kna-status/SKILL.md      진행 상황 보고 (core)
.claude/skills/gcp-*/                   선택적 GCP 도우미 스킬 묶음 (core)
deploy/outline/                docker-compose.yml, Caddyfile, .env.example, install.sh, upgrade.sh, pg-backup.sh (wiki)
templates/claude-md-block.{en,ko}.md    ~/.claude/CLAUDE.md 에 덧붙이는 블록 (agents)
templates/collection-sessions.{en,ko}.md  "<Agent> Sessions" 설명 본문 (wiki)
templates/collection-shared.{en,ko}.md    공유 콜렉션(`공유 지식` / `Shared Knowledge`) 설명 본문 (wiki)
templates/persona.md           페르소나 질문지와 예시 (agents)
templates/codex-agents-md.{en,ko}.md     Codex 용 AGENTS.md 블록, "phase 2" 표시 (agents)
bridge/discord/                vendoring 한 Claude Code + Codex 용 Discord 브리지 (agents)
.knowanywhere/                 실행 중 state, gitignore 대상
```

## 4. 단계 (고정 id)

| id | 스킬 디렉터리 | 목표 | 쓰는 주요 state |
|---|---|---|---|
| 00 | kna-00-start | 동의, 템플릿 언어, 모드(`fresh` \| `join`), 필수 도구 확인(gcloud, node ≥ 20, claude, git. 도메인 유무) | `mode`, `language`, `agent.name`, `prereqs.*`, `domain.kind` (`own` \| `sslip`) |
| 01 | kna-01-gcp-account | GCP 계정과 $300 무료 크레딧 안내, `gcloud auth login`, 프로젝트 생성, 결제 연결, compute/storage/iam API 켜기 | `gcp.project_id`, `gcp.billing_account_last4`, `gcp.region`, `gcp.zone` |
| 02 | kna-02-budget | 예산과 알림(권장, 건너뛸 수 있음). 결제 계정의 통화를 확인해 그 통화로 만든다 | `gcp.budget` (`{amount, currency}` 또는 `null`) |
| 03 | kna-03-vm | 프로젝트 역할 없는 전용 서비스 계정 `outline-vm` 생성, e2-medium VM(`outline-vm` 을 `--scopes=cloud-platform` 으로 붙인다), 고정 IP, 방화벽 80/443, 기본 설정(업데이트, 2 GB swap, docker) | `vm.name`, `vm.zone`, `vm.ip`, `vm.ssh_user`, `vm.service_account` |
| 04 | kna-04-dns | 내 도메인의 A 레코드, 또는 `wiki-<ip>.sslip.io` 대안. 해석 결과 검증 | `wiki.host` |
| 05 | kna-05-google-oauth | Google Cloud 콘솔: OAuth 동의 화면 + redirect `https://<host>/auth/google.callback` 인 web client. client id 는 state 로, secret 은 VM `.env` 에 바로 입력 | `oauth.client_id` |
| 06 | kna-06-outline-deploy | GCS 버킷(uploads, backups), HMAC 키, VM 에서 비밀값 생성, compose up, Caddy TLS, 첫 관리자 로그인 | `wiki.url`, `wiki.buckets.*`, `wiki.deployed_at` |
| 07 | kna-07-mcp-connect | `https://<host>/mcp` 를 Claude Code 에 user scope 로 등록, `/mcp` 로 OAuth 로그인, `list_collections` 로 검증 | `mcp.server_name`, `mcp.verified_at` |
| 08 | kna-08-collections | `<Agent> Sessions` 와 공유 콜렉션(`ko` 면 `공유 지식`, `en` 이면 `Shared Knowledge`) 생성, 규칙 템플릿을 설명에 넣기, 검증 | `wiki.collections.sessions[]`, `wiki.collections.shared` |
| 09 | kna-09-persona | 에이전트 이름과 페르소나 확정, `~/.claude/CLAUDE.md` 에 관리 블록 덧붙이기(`<!-- knowanywhere:start -->` / `<!-- knowanywhere:end -->` 사이), 스모크 테스트 = 에이전트가 이 설치에 대한 첫 세션 문서를 쓴다 | `agent.persona_written_at`, `agents[]` |
| 10 | kna-10-discord | 선택: Discord 앱과 봇, 브리지 설치(`bridge/discord`), `.env`, 서비스로 실행(VM 의 pm2/launchd/systemd), 페르소나 주입, 테스트 메시지 | `discord.enabled`, `discord.bot_name`, `discord.host`, `agents[]`(VM 에서 돌릴 때) |
| 11 | kna-11-backups | 매일 디스크 스냅샷 정책, `outline-vm` 에 backups 버킷 `roles/storage.objectCreator`, 매일 밤 pg dump 를 backups 버킷으로. 복원 훈련 문서 | `backup.snapshot_policy`, `backup.verified_at` |
| 12 | kna-12-add-agent | join 모드: 다른 머신이나 다른 에이전트 → 07, 08(새 콜렉션), 09 만. Codex 는 phase 2 표시 | `agents[]` 에 추가 |

01 ~ 06 과 11 단계는 `fresh` 모드에서만 돈다. `join` 모드는 00 → 07 → 08 → 09 (→ 10 선택) 순서다.

## 5. state 파일

`.knowanywhere/state.json`. 비밀이 아닌 값만 둔다. 모양은 `docs/state.md` 에 있다. 모든 스킬은 먼저 이 파일을 읽고,
원자적으로 쓰고(임시 파일에 쓴 뒤 rename), `steps.<id>.status`(`pending|done|skipped`)와 `steps.<id>.at`(ISO 8601)을
기록한다. 토큰, secret, client secret, 봇 토큰, 비밀번호는 절대 두지 않는다.

## 6. 출처

저자의 실제 운영 구성을 일반화했다. 에이전트 이름은 변수로 바꾸고, 신원과 비밀값은 뺐다. 배포 키트는 `deploy/outline/`,
브리지는 `bridge/discord/` 에 vendoring 했다.

## 7. v1 에서 하지 않는 것

Codex/Hermes 설치(템플릿과 "phase 2" 메모만 둔다), Kubernetes, 멀티 테넌트 위키, SMTP 초대, 기존 Obsidian vault
이전(짧은 메모만 둔다).
