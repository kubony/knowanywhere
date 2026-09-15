# 구조

knowanywhere 는 Google Cloud VM 한 대에 self-hosted [Outline](https://www.getoutline.com) 위키를 하나 설치하고,
내가 돌리는 모든 에이전트를 MCP 로 거기에 연결한다. 에이전트들은 쓰기 규칙 하나를 공유하고, 그 규칙은 위키 안의
콜렉션 설명(overview)에 들어 있다.

## 구성도

```
 MacBook              desktop              VM or desktop          later (phase 2)
 Claude Code "로제"   Claude Code "로제"   Discord bot "로제"     Codex "지수", Hermes "제니"
        |                    |                    |                      |
        +--------------------+----------+---------+----------------------+
                                        |  MCP over HTTPS, OAuth sign-in per agent
                                        |  https://wiki.example.com/mcp
                                        v
 + GCP project kna-wiki-a1b2 ------------------------------------------------------+
 |  static IP 203.0.113.10    firewall: tcp 80, 443 (and 22 via the default rule)  |
 |  + VM kna-wiki-vm: e2-medium, Debian 12, 30 GB disk, 2 GB swap --------------+  |
 |  |  Caddy :443 (Let's Encrypt) --> outline :3000 --+--> postgres :5432       |  |
 |  |                                    |            +--> redis :6379          |  |
 |  |  /opt/outline/.env (mode 600)      |            nightly pg_dump --+       |  |
 |  +------------------------------------|------------------------------|-------+  |
 |                S3 XML API + HMAC key  v                              v          |
 |                               gs://...-uploads               gs://...-backups   |
 |                                  attachments                 30-day lifecycle   |
 |  daily disk snapshots, 7-day retention                                          |
 +---------------------------------------------------------------------------------+
        ^
        |  Google OAuth (the only login method)
     browser
```

## 요청 흐름

1. 에이전트가 위키 도구(`search_documents`, `create_document` 등)를 부른다. Claude Code 는 07단계에서 사용자가
   로그인할 때 받은 OAuth access token 을 붙여 `https://<wiki.host>/mcp` 로 MCP 요청을 HTTPS 로 보낸다. 토큰은
   에이전트 자신의 자격 증명 저장소에만 있고 이 레포에는 들어오지 않는다.
2. DNS 가 `<wiki.host>` 를 VM 의 고정 IP 로 풀어 준다(04단계). GCP 방화벽이 TCP 443 을 허용한다.
3. **Caddy** 가 Let's Encrypt 인증서로 TLS 를 끝낸다. 인증서는 Caddy 가 스스로 받고 갱신한다(HTTP challenge 에
   80번 포트를 쓰고, 그 밖의 80번 요청은 HTTPS 로 redirect 한다). 그다음 Docker 네트워크의 `outline:3000` 으로
   프록시한다.
4. **Outline** 이 토큰을 확인하고 사용자 권한을 적용한 뒤 **Postgres**(문서, 콜렉션, 사용자)와 **Redis**(캐시,
   협업, 작업 큐)를 읽고 쓴다. 둘 다 Docker 네트워크 밖으로 포트를 열지 않는다.
5. 첨부 파일은 Outline 이 **Cloud Storage** 의 S3 호환 XML API(`https://storage.googleapis.com`)로 주고받는다.
   인증은 전용 서비스 계정의 HMAC 키로 한다. path-style URL 이 필요하다(`AWS_S3_FORCE_PATH_STYLE=true`).
6. 브라우저로 들어오는 사람도 같은 경로를 거치고, Google OAuth 로 로그인한다
   (`https://<wiki.host>/auth/google.callback`).

TLS 를 Caddy 가 끝내므로 Outline 은 `FORCE_HTTPS=false` 로 돈다. Caddy 뒤에서 이것을 `true` 로 두면 redirect 가
무한 반복된다.

## 구성 요소

| 구성 요소 | 위치 | 역할 | 설정 단계 |
|---|---|---|---|
| GCP 프로젝트 | Google Cloud | 결제와 리소스의 경계. 프로젝트를 지우면 전부 사라진다 | 01 |
| 예산 | Cloud Billing | 월 금액의 50/90/100% 에서 이메일 알림 | 02 |
| VM `kna-wiki-vm` | Compute Engine, e2-medium, Debian 12, 30 GB pd-balanced | 아래 전부를 돌린다. 2 GB swap, `vm.swappiness=10` | 03 |
| 고정 IP `kna-wiki-ip` | Compute Engine | DNS 가 가리킬 바뀌지 않는 주소 | 03 |
| 방화벽 규칙 | VPC `default` 네트워크 | 태그 붙은 VM 으로 TCP 80, 443 허용 | 03 |
| VM 서비스 계정 `outline-vm` | IAM | VM 의 신원. 프로젝트 역할 없음, backups 버킷의 `roles/storage.objectCreator` 만 | 03, 11 |
| DNS 레코드 | 내 DNS 제공자, 또는 sslip.io | `wiki.<domain>` A 레코드가 고정 IP 를 가리킨다 | 04 |
| OAuth 클라이언트 | Google Auth Platform | 위키의 Google 로그인 | 05 |
| Caddy | Docker 컨테이너 | HTTPS, 인증서, 리버스 프록시 | 06 |
| Outline | Docker 컨테이너 | 위키 본체. 웹 UI, REST API, MCP 엔드포인트 | 06 |
| Postgres | Docker 컨테이너 | 위키 데이터베이스 | 06 |
| Redis | Docker 컨테이너 | 캐시와 큐 | 06 |
| uploads 버킷 | Cloud Storage, 비공개 | 첨부 파일과 이미지 | 06 |
| backups 버킷 | Cloud Storage, 비공개, 30일 lifecycle | 매일 밤 `pg_dump` 파일 | 06, 11 |
| 서비스 계정 + HMAC 키 | IAM | Outline 이 uploads 버킷에 접근하는 자격 증명 | 06 |
| MCP 등록 | 에이전트가 도는 각 머신, Claude Code user scope | 에이전트를 `https://<wiki.host>/mcp` 에 연결 | 07 |
| 콜렉션 | Outline | 에이전트마다 `<Agent> Sessions`, 모두를 위한 공유 콜렉션 `공유 지식`(영어 템플릿은 `Shared Knowledge`) | 08 |
| 규칙 블록 | 각 머신의 `~/.claude/CLAUDE.md` | 에이전트에게 이름과 쓰기 규칙을 알려준다 | 09 |
| Discord 브리지(선택) | VM 또는 데스크탑, 서비스로 실행 | 에이전트가 같은 위키를 쓰며 Discord 에서 답한다 | 10 |
| 스냅샷 정책 | Compute Engine | 매일 디스크 스냅샷, 7일 보관 | 11 |

정확한 이미지와 설정은 `deploy/outline/docker-compose.yml`, `deploy/outline/Caddyfile`,
`deploy/outline/.env.example` 에 있다.

## 비용

VM 을 24시간 돌릴 때의 대략적인 정가(월 USD, 2026년 기준)다. 가격은 리전마다 다르고 시간이 지나면 바뀐다.
[Google Cloud 가격 계산기](https://cloud.google.com/products/calculator)로 확인한다.

| 항목 | asia-northeast3 (서울) | us-central1 (아이오와) | 메모 |
|---|---|---|---|
| e2-medium VM | 약 31 | 약 24.50 | E2 머신은 지속 사용 할인이 없다 |
| 30 GB pd-balanced 디스크 | 약 4 | 약 3 | |
| 고정 외부 IPv4, VM 에 붙어 있을 때 | 약 3.65 | 약 3.65 | 예약만 하고 붙이지 않으면 약 7.30 |
| uploads 버킷(Standard, 몇 GB) | 0.50 미만 | 0.50 미만 | 첨부 파일이 늘면 같이 는다 |
| backups 버킷(30일치 덤프) | 0.50 미만 | 0.50 미만 | 개인 위키의 덤프는 작다 |
| 디스크 스냅샷(매일 7개, 증분) | 약 1 ~ 2 | 약 1 ~ 2 | |
| 네트워크 송신(개인 사용) | 1 미만 | 1 미만 | |
| **합계** | **약 40** | **약 33** | |
| 도메인(선택) | 약 1 | 약 1 | 아무 등록 대행사에서 연 $10 ~ 15 |

무료 체험: 새 계정은 90일 뒤 만료되는 $300 크레딧을 받는다. 월 $40 정도면 90일 동안 약 $120 를 쓰므로, 실제로는
처음 석 달이 무료이고 남은 크레딧은 쓰이지 않고 만료된다. 체험이 끝난 뒤에도 위키를 유지하려면 결제 계정을 정식
계정으로 전환해야 한다. 전환하지 않으면 Google 이 체험 리소스를 멈춘다.

더 싼 방법(작은 머신 타입, Spot VM, 안 쓸 때 VM 끄기)도 있지만 각각 이 구성이 기대는 것을 포기한다. 업그레이드
때 필요한 메모리 여유, 또는 다른 머신의 에이전트가 언제든 닿을 수 있는 상시 가동 위키다. v1 인스톨러는 이 방법들을
제안하지 않는다.

## 보안 메모

- **로그인은 Google OAuth 만 쓴다.** 여기서 Outline 에는 로컬 비밀번호가 없다. 누가 로그인할 수 있는지는 두 곳에서
  정한다. OAuth 동의 화면(Testing 모드에서는 등록한 테스트 사용자만 로그인할 수 있다, 05단계)과 Outline 자체의 보안
  설정(허용 도메인, 초대)이다. 첫 배포 뒤 둘 다 확인한다.
- **SMTP 없음.** Outline 은 메일을 보내지 않는다. 초대 메일도, 이메일 알림도 없다. 새 사람은 허용된 Google 계정으로
  로그인해서 들어온다.
- **방화벽.** 위키용으로는 TCP 80 과 443 만 연다. SSH(22)는 `default` 네트워크의 `default-allow-ssh` 규칙이 허용하고,
  키는 `gcloud compute ssh` 가 관리한다. 더 조이려면 그 규칙의 소스를 Google IAP 대역 `35.235.240.0/20` 으로 좁히고
  `gcloud compute ssh --tunnel-through-iap` 로 접속한다. Postgres 와 Redis 는 호스트에 포트를 열지 않는다.
- **비밀값은 한 파일에 있다.** VM 의 `/opt/outline/.env`(mode 600)에 `SECRET_KEY`, `UTILS_SECRET`, Postgres 비밀번호,
  HMAC 키 쌍, OAuth client secret 이 들어 있다. 모두 VM 에서 생성하거나 입력하고, `.knowanywhere/state.json`, 이 레포,
  커밋, 위키로 옮기지 않는다. `SECRET_KEY` 나 `UTILS_SECRET` 을 나중에 바꾸면 세션과 암호화된 데이터가 무효가 되므로
  의도가 있을 때만 교체한다.
- **버킷은 비공개다.** 공개 접근이 없고, Outline 이 서명된 요청으로 첨부 파일을 내준다.
- **에이전트는 나로서 행동한다.** 에이전트는 OAuth 로 위키 사용자로 로그인하므로 그 사용자가 할 수 있는 모든 읽기와
  쓰기를 할 수 있다. 콜렉션 설명의 규칙(자기 `<Agent> Sessions` 에만 쓴다, 문서에 비밀값을 넣지 않는다)은 에이전트가
  지키는 약속이지 서버가 강제하는 권한이 아니다.
- **공개 노출에 따른 잡음은 정상이다.** 공개 HTTPS 호스트에는 자동 스캔(`/.env`, `/.git/HEAD` 등)이 들어온다.
  Outline 은 404 로 답하고, Caddy 로그에 남는다.
- **VM 에는 권한이 거의 없다.** VM 에는 기본 Compute 서비스 계정(새 개인 프로젝트에서는 프로젝트 Editor) 대신 역할이
  없는 전용 계정 `outline-vm` 이 붙는다(03단계). 11단계가 backups 버킷에 새 덤프를 올리는 권한 하나만 준다. 그래서 VM 이
  털려도 프로젝트의 다른 리소스와 지난 덤프는 그 계정으로 건드릴 수 없다. VM 의 access scope 는 `cloud-platform` 이지만
  실제 권한은 IAM 역할이 정한다. Outline 의 HMAC 키(`outline-storage`)는 uploads 버킷에만 권한이 있다.
- **백업에는 전부 들어 있다.** backups 버킷과 디스크 스냅샷에 위키 전체가 있다. GCP 프로젝트에 접근할 수 있는 사람은
  이것을 읽을 수 있으니 프로젝트 IAM 은 나 혼자로 유지한다.
