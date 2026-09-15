# 06단계: Outline 배포

스킬: `kna-06-outline-deploy`. `fresh` 모드만.

이 단계가 끝나면 `https://wiki.example.com` 에서 Outline 위키가 HTTPS 로 뜨고, 내가 Google 로 로그인한 첫 관리자가
된다. VM 에서 도는 것과 새로 만드는 것은 아래와 같다.

```
인터넷 ──443──▶ caddy (Let's Encrypt 인증서 자동) ──▶ outline:3000
                                                     ├── postgres 16  (Docker 볼륨 outline_pgdata)
                                                     ├── redis 7      (Docker 볼륨 outline_redisdata)
                                                     └── GCS uploads 버킷 (HMAC 키로 접근)
```

| 만드는 것 | 비용 | 쓰임 |
|---|---|---|
| 버킷 `kna-wiki-a1b2-uploads` | 개인 위키 규모면 월 $0.50 미만 | 첨부 파일과 이미지 |
| 버킷 `kna-wiki-a1b2-backups` | 월 $0.50 미만 | 매일 밤 DB 덤프(11단계). 30일 지나면 자동 삭제 |
| 서비스 계정 `outline-storage` 와 HMAC 키 | 무료 | Outline 이 uploads 버킷에 접근하는 신원 |
| VM 의 `/opt/outline` | VM 비용에 포함 | Docker Compose 스택과 `.env`(mode 600) |

키트 파일의 설명과 주의할 점 전체는 [`deploy/outline/README.md`](../../deploy/outline/README.md) 에 있다.

## 시작 전에

- 05단계에서 받은 **client secret** 을 꺼내 둔다(Download JSON 으로 받은 파일, 또는 열어 둔 콘솔 창).
- 관리자 계정이 개인 Gmail 인지 Workspace 계정인지 안다(05단계).
- 버킷 이름은 전 세계에서 유일해야 한다. 기본값은 프로젝트 ID 뒤에 `-uploads`, `-backups` 를 붙인 것이다.

아래 예시 값은 내 값으로 바꿔 읽는다: 프로젝트 `kna-wiki-a1b2`, region `asia-northeast3`, VM `kna-wiki-vm`, zone
`asia-northeast3-a`, 위키 주소 `wiki.example.com`.

## 1. 버킷 두 개 (인스톨러가 실행한다, 돈이 든다)

```bash
gcloud storage buckets create gs://kna-wiki-a1b2-uploads --project=kna-wiki-a1b2 --location=asia-northeast3 --uniform-bucket-level-access --public-access-prevention
gcloud storage buckets create gs://kna-wiki-a1b2-backups --project=kna-wiki-a1b2 --location=asia-northeast3 --uniform-bucket-level-access --public-access-prevention
gcloud storage buckets update gs://kna-wiki-a1b2-backups --lifecycle-file=deploy/outline/lifecycle-30d.json
```

두 버킷 모두 비공개다. Outline 은 첨부 파일을 서명된 URL 로만 내준다.

브라우저는 첨부 파일을 uploads 버킷에 직접 올린다. 그래서 uploads 버킷에 위키 주소를 허용하는 CORS 규칙이 필요하다.
인스톨러는 `deploy/outline/cors.json` 의 `https://wiki.example.com` 을 내 주소로 바꾼 사본을 `.knowanywhere/cors.json`
에 만들어 적용한다.

```bash
gcloud storage buckets update gs://kna-wiki-a1b2-uploads --cors-file=.knowanywhere/cors.json
```

## 2. 서비스 계정 (무료)

```bash
gcloud iam service-accounts create outline-storage --project=kna-wiki-a1b2 --display-name="Outline file storage"
gcloud storage buckets add-iam-policy-binding gs://kna-wiki-a1b2-uploads --member=serviceAccount:outline-storage@kna-wiki-a1b2.iam.gserviceaccount.com --role=roles/storage.objectAdmin
```

`outline-storage` 는 uploads 버킷에만 권한이 있다. 이 계정의 HMAC 키는 VM 의 `.env` 에 들어가므로, 키가 새더라도
backups 버킷의 DB 덤프는 건드릴 수 없게 나눠 둔다. 덤프는 11단계에서 VM 의 전용 서비스 계정 `outline-vm`(03단계, 프로젝트 역할 없음)이 올린다.

## 3. 키트를 VM 에 복사 (인스톨러가 실행한다)

```bash
gcloud compute ssh kna-wiki-vm --project=kna-wiki-a1b2 --zone=asia-northeast3-a --command='mkdir -p ~/outline-kit'
gcloud compute scp --project=kna-wiki-a1b2 --zone=asia-northeast3-a deploy/outline/{docker-compose.yml,Caddyfile,.env.example,install.sh,upgrade.sh,pg-backup.sh,lifecycle-30d.json,cors.json,README.md} kna-wiki-vm:~/outline-kit/
```

VM 의 `~/outline-kit/` 에 파일 9개가 생긴다.

## 4. HMAC 키와 설치 (내 터미널에서 직접)

이 부분은 Claude Code 밖의 **새 터미널 창**에서 내가 실행한다.

- `gcloud storage hmac create` 는 secret 을 한 번 출력한다. AI 에이전트가 실행하면 그 출력이 대화 기록에 남는다.
- `install.sh` 는 secret 을 화면에 보이지 않는 입력으로 받는다. 그러려면 터미널(TTY)이 필요하다.

인스톨러가 내 값을 채운 명령을 보여준다. 모양은 이렇다(개인 Gmail 관리자면 끝에 `--personal-gmail` 을 붙인다):

```bash
gcloud storage hmac create outline-storage@kna-wiki-a1b2.iam.gserviceaccount.com --project=kna-wiki-a1b2

gcloud compute ssh kna-wiki-vm --project=kna-wiki-a1b2 --zone=asia-northeast3-a -- -t 'bash ~/outline-kit/install.sh --host wiki.example.com --uploads-bucket kna-wiki-a1b2-uploads --backups-bucket kna-wiki-a1b2-backups --google-client-id 123456789012-abc123.apps.googleusercontent.com --region asia-northeast3 --language ko_KR'
```

첫 명령의 출력에서 `accessId`(`GOOG` 로 시작)와 `secret`(40자)을 본다. 이 창을 닫지 말고 두 번째 명령을 실행한다.
`-- -t` 는 원격 스크립트에 터미널을 붙여 숨김 입력이 되게 한다. `--language` 는 위키 화면의 기본 언어다(`ko_KR`,
`en_US` 등).

`install.sh` 가 차례로 묻는 것:

| 프롬프트 | 넣을 것 |
|---|---|
| `HMAC access id (starts with GOOG):` | `accessId` (입력이 보인다. 비밀값이 아니다) |
| `HMAC secret for GOOG... (input hidden):` 와 확인 | `secret` |
| `Google OAuth client secret (input hidden):` 와 확인 | 05단계의 client secret |

스크립트가 하는 일:

1. `/opt/outline` 을 만들고 키트 파일을 복사한다.
2. `.env.example` 로 `/opt/outline/.env` 를 만든다(mode 600).
3. `SECRET_KEY`, `UTILS_SECRET`, `POSTGRES_PASSWORD` 를 VM 에서 한 번만 만든다. 다시 실행해도 덮지 않는다.
4. 주소, 버킷, HMAC access id, Google client id 를 `.env` 에 쓰고, 두 secret 을 숨김 입력으로 받는다.
5. `docker compose pull` 과 `up -d` 를 한다.
6. `https://wiki.example.com/_health` 가 `OK` 를 줄 때까지 최대 600초 기다리고, 다음에 할 일("Next")을 출력한다.

끝나면 마지막 몇 줄(secret 은 들어 있지 않다)을 인스톨러 채팅에 붙여 넣는다. 다시 실행해도 안전하다. 이미 들어간
secret 은 다시 묻지 않는다.

HMAC 키를 여러 번 만들었다면 쓰지 않는 키를 정리한다: `gcloud storage hmac list --project=kna-wiki-a1b2` 로 보고,
`gcloud storage hmac update <accessId> --deactivate` 후 `gcloud storage hmac delete <accessId>`.

## 5. 첫 로그인 (브라우저)

위키 화면이 한국어면 괄호 안 이름으로 보인다.

**Google Workspace 계정**

1. `https://wiki.example.com` > **Continue with Google**(Google 사용하여 계속하기). 처음 로그인한 계정이 관리자가 된다.
2. **Settings**(설정) > **Details**(세부 정보) (`/settings/details`)에서 워크스페이스 이름을 정한다.
3. **Settings** > **Security**(보안) (`/settings/security`)에서 **Require invites**(초대 필요)를 켜거나 **Allowed
   domains**(허용된 도메인)에 회사 도메인을 넣는다. 둘 다 안 하면 아무 Google Workspace 도메인의 계정이나 가입할 수 있다.

**개인 Gmail (두 번에 나눠 설치)**

1. `install.sh ... --personal-gmail` 이 끝나면 **바로** `https://wiki.example.com` 을 연다. 폼을 내기 전까지는 먼저 여는
   사람이 관리자가 된다.
2. **Create workspace**(워크스페이스 생성) 폼에 워크스페이스 이름, 내 이름, Google 로그인에 쓸 Gmail 주소를 정확히 넣고 낸다.
3. 인스톨러가 Google 로그인을 켠다(secret 을 묻지 않으므로 인스톨러가 실행해도 된다):
   ```bash
   gcloud compute ssh kna-wiki-vm --project=kna-wiki-a1b2 --zone=asia-northeast3-a --command='bash /opt/outline/install.sh --enable-google --wait 300'
   ```
4. 로그인한 채로 **Settings** > **Authentication**(인증) (`/settings/authentication`) > Google > **Connect**(연결)를 누르고
   Google 로그인을 마친다.
5. **Settings** > **Security** > **Require invites**(초대 필요)를 켠다. 끄면 위키 주소를 아는 아무 Gmail 사용자나 가입할 수 있다.
6. 로그아웃하고 **Continue with Google** 로 다시 로그인해 본다.

## 확인

```bash
curl -sI https://wiki.example.com | head -1
curl -s https://wiki.example.com/_health; echo
gcloud compute ssh kna-wiki-vm --project=kna-wiki-a1b2 --zone=asia-northeast3-a --command='cd /opt/outline && docker compose ps --format "table {{.Name}}\t{{.Status}}" && stat -c "%a %n" .env'
```

| 확인 | 기대 |
|---|---|
| 첫 줄 | `HTTP/2 200` 또는 `HTTP/2 302` |
| `_health` | `OK` |
| 컨테이너 | `outline-caddy`, `outline`, `outline-postgres`, `outline-redis` 네 줄 모두 `(healthy)` |
| `.env` 권한 | `600 .env` |

인스톨러는 위키의 `/api/auth.config` 로 워크스페이스 이름과 로그인 방식(`providers: google`)도 확인한다.

## 막혔을 때

| 증상 | 원인 | 고치는 법 |
|---|---|---|
| `install.sh` 가 600초 뒤 `no healthy HTTPS answer` | DNS 가 아직 VM 을 가리키지 않는다, 또는 80/443 이 막혔다 | `dig +short wiki.example.com` 이 VM IP 인지, 03단계 방화벽 규칙이 있는지 본다. 고친 뒤 `install.sh` 를 다시 실행 |
| 컨테이너가 `(health: starting)` | 첫 부팅 마이그레이션 중 | 1~2분 뒤 다시 본다 |
| 브라우저가 계속 리다이렉트된다 | `.env` 의 `FORCE_HTTPS` 가 `true` | `false` 여야 한다. Caddy 가 이미 HTTPS 로 보낸다 |
| 로그인 화면에 `redirect_uri_mismatch` | 05단계의 redirect URI 가 주소와 다르다 | 05단계 "확인"을 다시 한다 |
| "a new account cannot be created with a personal Gmail address" | 개인 Gmail 인데 `--personal-gmail` 없이 설치했다 | `.env` 의 `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` 두 줄을 지우고 `install.sh ... --personal-gmail` 을 다시 실행한 뒤 5의 개인 Gmail 절차를 따른다 |
| 이미지 업로드만 실패하고 브라우저 콘솔에 CORS 에러 | uploads 버킷 CORS 의 origin 이 위키 주소와 다르다 | 1의 CORS 명령을 정확한 `https://<주소>`(끝 `/` 없이)로 다시 실행 |

## 기록되는 것

```bash
node .claude/skills/kna-status/state.mjs set '{"wiki":{"url":"https://wiki.example.com","buckets":{"uploads":"kna-wiki-a1b2-uploads","backups":"kna-wiki-a1b2-backups"},"deployed_at":"2026-09-15T08:05:00Z"}}'
node .claude/skills/kna-status/state.mjs step 06 done
```

HMAC 키와 secret 은 state 에 쓰지 않는다. 05단계에서 받은 client secret JSON 파일은 이제 지워도 된다.

## 운영

업그레이드, 로그 보기, 재시작 명령은 [`deploy/outline/README.md`](../../deploy/outline/README.md) 의 Operations 절에 있다.
업그레이드는 VM 에서 `bash /opt/outline/upgrade.sh <새 태그>` 로 하고, 스크립트가 먼저 DB 덤프를 뜬다.

## 다음

[07단계: MCP 연결](07-mcp-connect.md)
