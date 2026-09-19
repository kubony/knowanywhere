# knowanywhere

[English](README.en.md)

**여러 컴퓨터에서 도는 에이전트들이 서로 아는 걸 어떻게 공유하나?**

맥북에서 Claude Code 를 쓰고, 데스크탑에서도 쓰고, Discord 봇도 하나 돌리고, 다음 달엔 Codex 도 붙일 생각이다.
그런데 에이전트는 세션을 열 때마다 어제 다른 머신의 자기가 무엇을 했는지 모른다. 메모는 각 머신의 로컬 파일에
흩어지고, 다른 머신은 그 파일을 볼 수 없다.

knowanywhere 의 답은 self-hosted 위키 하나와 모든 에이전트가 따르는 짧은 규칙이다.

- 내 Google Cloud VM 위에 **[Outline](https://www.getoutline.com) 위키 하나**를 HTTPS 와 Google 로그인으로 띄운다.
- **에이전트마다 콜렉션 하나**(`로제 Sessions`). 그 에이전트만 쓰고, 작업 1건당 문서 1개를 세션과 머신을 넘어
  이어 쓴다. 에이전트는 새 문서를 만들기 전에 먼저 검색하므로, 화요일 맥북 세션이 월요일 데스크탑 작업을 이어받는다.
- **공유 콜렉션 하나**(`공유 지식`, 영어 템플릿은 `Shared Knowledge`). 모든 에이전트가 읽고 쓴다. 나에 대한 사실, 프로젝트, 컨벤션, 결정처럼
  오래 갈 지식을 둔다. 세션 로그는 여기 쓰지 않고, 거기서 걸러낸 지식만 옮긴다.
- **모든 에이전트는 MCP 로 접속한다.** `https://<내 위키>/mcp` 에 OAuth 로 로그인한다.
- **규칙은 위키 안에 있다.** 각 콜렉션의 설명(overview)에 적고, 에이전트는 쓰기 전에 그것을 읽는다. 규칙을 한 번
  고치면 모든 머신의 모든 에이전트가 따른다.

이 레포는 인스톨러다. Claude Code 로 열면 전체 설치를 한 단계씩 안내하고, 돈이 들거나 전역 Claude 설정을 건드리는
일은 하기 전에 먼저 묻는다.

```
  로제             로제             로제             지수             제니
  Claude Code      Claude Code      Discord 봇       Codex            Hermes
  맥북             데스크탑         브리지           phase 2          phase 2, GCP VM
     |                |                |                |                |
     +----------------+--------+-------+----------------+----------------+
                               |  MCP over HTTPS (OAuth 로그인)
                               v
     +--------------------------------------------------------
     |  Outline 위키   https://wiki.example.com
     |  내 GCP VM 위에서 돈다. Google 로그인만 허용
     |
     |  로제 Sessions      로제만 쓴다
     |  지수 Sessions      지수만 쓴다
     |  제니 Sessions      제니만 쓴다
     |  공유 지식          모든 에이전트가 읽고 쓴다
     +--------------------------------------------------------
```

저자의 실제 구성이다. 로제는 맥북, 데스크탑, Discord 세 곳에서 같은 이름으로 돌며 같은 `로제 Sessions` 에 쓴다.
지수(Codex)와 제니(Hermes)는 각자 자기 콜렉션을 갖는다. 네 번째 에이전트 리사를 붙일 때는 `kna-12-add-agent` 로
`리사 Sessions` 를 하나 더 만들면 된다.

## 빠른 시작

```bash
git clone https://github.com/kubony/knowanywhere.git
cd knowanywhere
claude
```

Claude 가 [`AGENTS.md`](AGENTS.md) 를 읽고 무엇을 만드는지, 비용이 얼마인지 설명한 뒤 "설치를 시작할까요?" 라고 묻는다.
yes 라고 답하면 된다. 언제든 멈출 수 있고, 레포를 다시 열면 멈춘 곳부터 이어간다. 진행 상황은 `/kna-status` 로 본다.

필요한 것: Google 계정과 Google Cloud 무료 체험에 등록할 카드, [Claude Code](https://claude.com/claude-code),
Node.js 20 이상, git. Google Cloud CLI(`gcloud`) 설치는 인스톨러가 도와준다. 도메인은 없어도 된다.

## 설치되는 것

Google Cloud(`fresh` 모드): 예산 알림이 걸린 프로젝트, 고정 IP 를 단 e2-medium Debian 12 VM, Docker, Caddy(자동 HTTPS),
Outline, Postgres, Redis, 비공개 Cloud Storage 버킷 두 개(첨부 파일, 백업), 매일 디스크 스냅샷과 매일 밤 DB 덤프.

각 머신: Claude Code 의 MCP 서버 등록(user scope) 하나와, 에이전트 이름과 규칙을 담은 `~/.claude/CLAUDE.md` 의 표시된
블록 하나. 둘 다 쓰기 전에 diff 로 보여준다.

위키: 규칙이 적힌 `<Agent> Sessions` 와 `공유 지식` 콜렉션, 그리고 에이전트가 이번 설치에 대해 쓴 첫 문서.

자세한 구조: [docs/architecture.md](docs/architecture.md).

## 비용

| 항목 | 월 USD, 대략 |
|---|---|
| Google Cloud 무료 체험 | 90일 동안 $300 크레딧. 처음 석 달 비용을 덮는다 |
| e2-medium VM, 24시간 | 약 25(us-central1) ~ 31(asia-northeast3, 서울) |
| 디스크, 고정 IP, 스토리지, 스냅샷, 트래픽 | 약 7 ~ 10 |
| **체험 종료 후 합계** | **약 33 ~ 40** |
| 도메인(선택) | 연 $10 ~ 15. 없으면 무료 `sslip.io` 주소를 쓴다 |

가격은 리전마다 다르고 바뀐다. [비용표](docs/architecture.md#비용)를 본다.

## 단계

| id | 스킬 | 하는 일 | fresh | join |
|---|---|---|---|---|
| 00 | `kna-00-start` | [동의, 모드, 에이전트 이름, 템플릿 언어, 도메인, 필수 도구 확인](docs/steps/00-start.md) | 실행 | 실행 |
| 01 | `kna-01-gcp-account` | [GCP 계정과 무료 크레딧, 프로젝트, 결제, API](docs/steps/01-gcp-account.md) | 실행 | |
| 02 | `kna-02-budget` | [월 예산과 이메일 알림](docs/steps/02-budget.md) | 권장 | |
| 03 | `kna-03-vm` | [고정 IP, VM, 방화벽, swap, Docker](docs/steps/03-vm.md) | 실행 | |
| 04 | `kna-04-dns` | [`wiki.<도메인>` A 레코드, 또는 sslip.io 이름](docs/steps/04-dns.md) | 실행 | |
| 05 | `kna-05-google-oauth` | [위키용 Google 로그인](docs/steps/05-google-oauth.md) | 실행 | |
| 06 | `kna-06-outline-deploy` | [버킷, 비밀값 생성, Outline + Caddy, 첫 관리자 로그인](docs/steps/06-outline-deploy.md) | 실행 | |
| 07 | `kna-07-mcp-connect` | [Claude Code 를 MCP 로 위키에 연결](docs/steps/07-mcp-connect.md) | 실행 | 실행 |
| 08 | `kna-08-collections` | [규칙이 적힌 Sessions 와 공유 지식 콜렉션](docs/steps/08-collections.md) | 실행 | 실행 |
| 09 | `kna-09-persona` | [에이전트 페르소나와 규칙 블록, 첫 세션 문서](docs/steps/09-persona.md) | 실행 | 실행 |
| 10 | `kna-10-discord` | [같은 위키를 쓰는 Discord 봇(선택)](docs/steps/10-discord.md) | 선택 | 선택 |
| 11 | `kna-11-backups` | [매일 스냅샷, 매일 밤 DB 덤프, 복구 연습](docs/steps/11-backups.md) | 실행 | |
| 12 | `kna-12-add-agent` | [에이전트나 머신 추가](docs/steps/12-add-agent.md) | 나중에 | 나중에 |

## 다른 머신, 다른 에이전트 합류

위키는 한 번만 만든다. 그다음 머신은 연결만 한다.

1. 새 머신에서 `git clone`, `cd knowanywhere`, `claude` 를 실행하고 모드를 물으면 `join` 이라고 답한다.
2. 위키 주소를 알려준다. 예: `https://wiki.example.com`.
3. 같은 에이전트로 이어가려면 **같은 이름**을 쓴다(데스크탑의 로제도 맥북의 로제와 같은 `로제 Sessions` 에 쓴다).
   다른 에이전트를 추가하려면 **새 이름**을 주고, 그 에이전트는 자기 콜렉션을 새로 받는다.
4. 인스톨러가 그 머신에서 07, 08, 09 단계를 돌린다(Discord 를 원하면 10도).

이미 설정한 머신에서 나중에 에이전트를 하나 더 붙일 때는 `kna-12-add-agent` 를 실행한다.

## Phase 2: Codex, Hermes

v1 은 Claude Code 에이전트와 선택적 Discord 브리지를 설치한다. Codex 용 규칙 템플릿(`AGENTS.md`)은 `templates/` 에
phase 2 표시와 함께 들어 있다. Codex 가 MCP 로 위키에 닿는다면 지수 같은 Codex 에이전트는 지금도 이 템플릿을 손으로
붙여 쓸 수 있다. Codex 와 Hermes 에이전트용 단계별 인스톨러는 다음 버전에서 다룬다.

## v1 에서 하지 않는 것

Kubernetes, 멀티 테넌트 위키, 이메일(SMTP) 초대, 기존 노트 이전. Obsidian vault 나 Markdown 으로 노트를 쌓아 두었다면
Outline 의 Markdown 가져오기를 쓸 수 있다. 설치를 마친 뒤 사본으로 먼저 해 본다.

## 보안 요약

로그인은 Google OAuth 만 쓰고 SMTP 는 없다. 방화벽은 위키용으로 TCP 80, 443 만 연다(SSH 는 기본 규칙과 gcloud 가 관리하는
키를 쓴다). 비밀값은 모두 VM 에서 만들어 한 파일 `/opt/outline/.env`(mode 600)에 둔다. 인스톨러는 비밀값을 되풀이해
출력하지 않고, state 파일·이 레포·위키에 쓰지 않으며, 변수명과 끝 4자리로만 가리킨다.
자세한 내용은 [docs/architecture.md](docs/architecture.md#보안-메모).

## 검증 이력

- 2026-09-15 · 새 GCP 프로젝트(Workspace 계정, 서울 리전, sslip.io)에서 00~04단계를 인스톨러로 실제 실행해 통과했다.
  05~11단계는 로컬 Docker 스모크(Outline 1.10.1 기동, `/_health` 200)만 확인했고 실제 GCP 실행은 아직이다.

## 라이선스

[MIT](LICENSE)
