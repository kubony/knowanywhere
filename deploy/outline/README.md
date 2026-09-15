# deploy/outline: GCP VM 한 대에 올리는 Outline 위키

[Outline](https://github.com/outline/outline) 을 Docker Compose 로 VM 한 대에 올리는 작은 키트다. 인스톨러의
06단계(`kna-06-outline-deploy`)가 이 키트를 쓰고, 손으로 따라 해도 된다.

```
인터넷 ──443──▶ caddy (Let's Encrypt, 자동) ──▶ outline:3000
                                                ├── postgres:5432  (볼륨 outline_pgdata)
                                                ├── redis:6379     (볼륨 outline_redisdata)
                                                └── GCS uploads 버킷, S3 XML API 로 접근 (HMAC 키)
매일 밤: pg_dump ──▶ /var/backups/outline (30일) ──▶ GCS backups 버킷 (30일 lifecycle)
매일:    부팅 디스크 스냅샷 (7일)
```

로그인은 Google OAuth 만 쓴다. SMTP 를 설정하지 않으므로 Outline 은 메일을 보내지 않는다(초대는 링크로 공유한다).

## 파일

| 파일 | 놓이는 곳 | 내용 |
|---|---|---|
| `docker-compose.yml` | `/opt/outline/` | caddy, outline(`outlinewiki/outline:1.10.1` 고정), postgres 16, redis 7. healthcheck, `restart: unless-stopped`, named volume |
| `Caddyfile` | `/opt/outline/` | `{$WIKI_HOST}` → `outline:3000`, HTTPS 자동 |
| `.env.example` | `/opt/outline/.env` (mode 600) | Outline 이 쓰는 변수 전부, 변수마다 주석 한 줄. `install.sh` 가 채운다 |
| `install.sh` | `~/outline-kit/` 에서 실행, `/opt/outline/` 에도 복사된다 | 여러 번 돌려도 안전한 설치: 파일 복사, 비밀값 생성, 입력 받기, `compose up`, HTTPS 응답 대기 |
| `upgrade.sh` | `/opt/outline/` | 덤프, pull, 마이그레이션, 재시작, healthy 대기 |
| `pg-backup.sh` | `/opt/outline/`(`upgrade.sh` 가 부른다), `/usr/local/bin/outline-pg-backup`(11단계) | 매일 밤 `pg_dump` → gzip → 로컬 30일 보관 → `gcloud storage cp` 로 backups 버킷에 올린다 |
| `lifecycle-30d.json` | backups 버킷 | 30일 지난 객체를 지운다 |
| `cors.json` | uploads 버킷 | 위키 origin 에서 브라우저 업로드를 허용한다(`https://wiki.example.com` 을 내 주소로 바꾼다) |

`install.sh` 는 키트 파일 9개를 `/opt/outline/` 에 복사한다. 이미 있는 파일과 내용이 다르면 옛 파일을
`<파일>.bak.<UTC 시각>` 으로 남기고 덮어쓴다.

## 1. 버킷, 서비스 계정, HMAC 키 (노트북에서 한 번)

아래에서 쓰는 변수(예시 값):

```bash
PROJECT=kna-wiki-a1b2
REGION=asia-northeast3
HOST=wiki.example.com
UPLOADS=$PROJECT-uploads
BACKUPS=$PROJECT-backups
SA=outline-storage@$PROJECT.iam.gserviceaccount.com
```

```bash
gcloud services enable storage.googleapis.com iam.googleapis.com --project "$PROJECT"

# VM 과 같은 region 에 비공개 버킷 두 개.
gcloud storage buckets create "gs://$UPLOADS" --project "$PROJECT" --location "$REGION" \
  --uniform-bucket-level-access --public-access-prevention
gcloud storage buckets create "gs://$BACKUPS" --project "$PROJECT" --location "$REGION" \
  --uniform-bucket-level-access --public-access-prevention

# backups 버킷의 덤프는 30일이 지나면 사라진다.
gcloud storage buckets update "gs://$BACKUPS" --project "$PROJECT" --lifecycle-file=deploy/outline/lifecycle-30d.json

# 브라우저가 uploads 버킷에 직접 올리므로, 위키 origin 을 허용하는 CORS 가 필요하다.
mkdir -p .knowanywhere
sed "s#https://wiki.example.com#https://$HOST#" deploy/outline/cors.json > .knowanywhere/cors.json
gcloud storage buckets update "gs://$UPLOADS" --project "$PROJECT" --cors-file=.knowanywhere/cors.json

# Outline 파일 저장소 전용 신원. uploads 버킷에만 권한을 준다.
gcloud iam service-accounts create outline-storage --project "$PROJECT" \
  --display-name "Outline file storage"
gcloud storage buckets add-iam-policy-binding "gs://$UPLOADS" --project "$PROJECT" \
  --member "serviceAccount:$SA" --role roles/storage.objectAdmin
```

binding 이 "does not exist" 로 실패하면 새 서비스 계정이 아직 전파되지 않은 것이다. 30초 기다렸다가 다시 한다.

HMAC 키는 Outline 이 uploads 버킷에 접근할 때 쓰는 S3 방식 자격 증명이다. **AI 에이전트를 거치지 말고 내 터미널에서
직접 실행한다.** secret 은 한 번만 출력되고, 대화 기록에 남으면 안 된다.

```bash
gcloud storage hmac create "$SA" --project "$PROJECT"
```

출력에 `accessId`(`GOOG` 로 시작)와 `secret`(40자)이 있다. `install.sh` 가 secret 을 물으므로 터미널을 열어 둔다.
나중에 키 목록은 `gcloud storage hmac list --service-account "$SA" --project "$PROJECT"` 로 볼 수 있다(secret 은 나오지 않는다).

`outline-storage` 에 backups 버킷 권한을 주지 않는 이유: HMAC 키는 `/opt/outline/.env` 에 들어간다. 키가 새더라도
첨부 파일만 건드릴 수 있고 DB 백업은 건드릴 수 없게 나눠 둔다. 백업은 VM 에 붙은 전용 서비스 계정 `outline-vm` 이
올린다. 03단계가 이 계정을 프로젝트 역할 없이 만들고, 11단계가 backups 버킷의 `roles/storage.objectCreator` 하나만
준다. 그래서 VM 은 덤프를 새로 올릴 수만 있고 지난 덤프를 읽거나 지우지 못한다. 기본 Compute 서비스 계정은 새 개인
프로젝트에서 프로젝트 Editor 역할을 갖고 있으므로 VM 에 붙이지 않는다. 손으로 따라 할 때도 VM 을
`--service-account=outline-vm@$PROJECT.iam.gserviceaccount.com --scopes=cloud-platform` 으로 만든다.

## 2. 키트 복사와 설치 (노트북 → VM)

```bash
VM=kna-wiki-vm; ZONE=asia-northeast3-a
gcloud compute ssh "$VM" --zone "$ZONE" --project "$PROJECT" -- 'mkdir -p ~/outline-kit'
gcloud compute scp --zone "$ZONE" --project "$PROJECT" \
  deploy/outline/{docker-compose.yml,Caddyfile,.env.example,install.sh,upgrade.sh,pg-backup.sh,lifecycle-30d.json,cors.json,README.md} \
  "$VM":~/outline-kit/
```

그다음 내 터미널에서 실행한다(스크립트가 비밀값 두 개를 화면에 보이지 않게 입력받는다).

```bash
gcloud compute ssh "$VM" --zone "$ZONE" --project "$PROJECT" -- -t \
  "bash ~/outline-kit/install.sh --host $HOST --uploads-bucket $UPLOADS --backups-bucket $BACKUPS \
   --google-client-id <05단계의 client id> --hmac-access-id <accessId> --region $REGION --language ko_KR"
```

`-t` 는 원격 스크립트에 터미널을 붙여 준다. 이것이 없으면 숨김 입력을 받을 수 없어서, 비밀값을 물어야 할 때
스크립트가 에러로 끝난다.
관리자 계정이 개인 `@gmail.com` 주소면 `--personal-gmail` 을 붙인다(아래 3절).

`install.sh` 옵션(`bash install.sh --help` 로도 볼 수 있다):

| 옵션 | 뜻 |
|---|---|
| `--host HOST` | 위키 호스트 이름, 예 `wiki.example.com`. scheme 과 끝의 `/` 는 떼어 낸다 |
| `--uploads-bucket NAME` | 첨부 파일 버킷(`gs://` 없이) |
| `--backups-bucket NAME` | DB 덤프 버킷(`gs://` 없이) |
| `--google-client-id ID` | Google OAuth 웹 클라이언트 id(`*.apps.googleusercontent.com`) |
| `--hmac-access-id ID` | `outline-storage` HMAC 키의 access id. 빠뜨리면 터미널에서 묻는다 |
| `--region REGION` | `AWS_REGION` 값. 아무 문자열이나 된다. 주지 않으면 기존 값을 둔다 |
| `--language CODE` | `DEFAULT_LANGUAGE`, 예 `en_US`, `ko_KR` |
| `--personal-gmail` | 개인 Gmail 관리자의 첫 실행. Google 로그인을 아직 켜지 않는다 |
| `--enable-google` | `--personal-gmail` 다음 두 번째 실행. Google 로그인을 켠다 |
| `--wait SECONDS` | HTTPS 응답을 기다리는 시간(기본 600) |

옵션 대신 환경 변수로 줘도 된다: `WIKI_HOST`, `UPLOADS_BUCKET`, `BACKUP_BUCKET`, `GOOGLE_CLIENT_ID`, `HMAC_ACCESS_ID`,
`AWS_REGION`, `DEFAULT_LANGUAGE`. 설치 위치는 `INSTALL_DIR`(기본 `/opt/outline`)로 바꿀 수 있다.

스크립트는 다시 돌려도 안전하다. `SECRET_KEY`, `UTILS_SECRET`, `POSTGRES_PASSWORD` 는 한 번만 만들고 다시 만들지 않으며,
아직 비어 있는 비밀값만 묻는다. 다시 넘긴 인자(host, 버킷, id)는 옛 값을 덮어쓴다. 비밀값은 두 번 입력해 맞는지
확인하고, 저장한 뒤에는 끝 4자리만 보여준다. 마지막에 `https://<host>/_health` 가 `OK` 를 돌려줄 때까지 기다리고,
시간 안에 응답이 없으면 `compose ps` 와 caddy·outline 로그 40줄을 보여주고 끝난다. 흔한 원인은 DNS 가 아직 이 VM 을
가리키지 않거나(`dig +short <host>`), 방화벽이 tcp:80·tcp:443 을 막았거나, 첫 부팅 마이그레이션이 아직 도는 경우다.

## 3. 첫 로그인

- **Google Workspace 계정**(you@yourcompany.com): `https://<host>` 를 열고 "Continue with Google" 을 누른다. 첫 계정이
  workspace 를 만들고 관리자가 된다. 이름은 Settings → Details 에서 바꾼다. 그다음 Settings → Security 에서 문을 잠근다.
  **Require invites** 를 켜거나 **Allowed domains** 에 내 도메인을 넣는다. 둘 다 하지 않으면 self-hosted Outline 은
  *어느* Google Workspace 도메인의 계정이든 가입을 받는다.
- **개인 Gmail**(you@gmail.com): Outline 은 개인 Gmail 로그인으로 새 workspace 를 만들지 않는다("a new account cannot
  be created with a personal Gmail address"). 두 번에 나눠 설정한다.
  1. `install.sh ... --personal-gmail`: Google 로그인이 꺼진 채로 떠서, `https://<host>` 에 처음 들어가면
     **Create workspace** 화면이 나온다. 바로 만든다(그 전까지는 이 페이지를 먼저 연 사람이 관리자가 된다).
     workspace 이름, 내 이름, 그리고 Gmail 주소를 Google 이 알려 줄 형태 그대로 넣는다. 이 동안 Google client id 와
     secret 은 `.env` 의 `KNA_DEFERRED_GOOGLE_CLIENT_ID`, `KNA_DEFERRED_GOOGLE_CLIENT_SECRET` 에 보관된다.
  2. VM 에서 `bash /opt/outline/install.sh --enable-google` 을 실행한다. 보관한 값을 `GOOGLE_CLIENT_ID`,
     `GOOGLE_CLIENT_SECRET` 으로 옮기고 outline 컨테이너를 다시 만든다. `--personal-gmail` 과 `--enable-google` 은
     한 번에 같이 쓸 수 없다.
  3. 로그인한 상태 그대로 Settings → Authentication → Google → **Connect** 를 누르고 Google 로그인을 마친다.
  4. Settings → Security → **Require invites** 를 켠다. 켜지 않으면 URL 을 알게 된 Gmail 사용자 누구나 내 위키에
     계정을 만들 수 있다.
  5. 로그아웃하고 "Continue with Google" 로 다시 로그인해 확인한다.

## 운영 (Operations, VM 에서)

```bash
cd /opt/outline
sudo docker compose ps                    # 네 개 모두 "healthy" / "running"
sudo docker compose logs -f outline       # 앱 로그
sudo docker compose restart outline
curl -s https://$(grep ^WIKI_HOST= .env | cut -d= -f2)/_health   # OK 가 나온다
bash /opt/outline/upgrade.sh 1.11.0       # 새 태그로 업그레이드(먼저 덤프, 그다음 마이그레이션)
bash /opt/outline/upgrade.sh              # 지금 태그를 다시 pull(패치 재빌드)하고 마이그레이션
sudo /usr/local/bin/outline-pg-backup     # 수동 백업(11단계 뒤)
```

`upgrade.sh` 는 태그를 받으면 `docker-compose.yml` 을 `docker-compose.yml.bak.<UTC 시각>` 으로 남기고 image 줄을 고친다.
그다음 다섯 단계를 돈다: `pg-backup.sh --local-only` 로 로컬 덤프 → `outline` 이미지 pull → outline 정지(postgres 와
redis 는 계속 돈다) → 마이그레이션 → outline 시작. 끝으로 컨테이너가 healthy 가 될 때까지 최대 5분 기다린다.
업그레이드 전에 https://github.com/outline/outline/releases 의 릴리스 노트를 읽는다.

되돌리기: `docker-compose.yml.bak.<UTC 시각>` 을 `docker-compose.yml` 로 되돌리고, 업그레이드 때 찍힌 덤프를 복원한 뒤
(`docs/steps/11-backups.md` 의 "운영 위키에 복원하기 (Restore into production)"), `docker compose up -d` 를 실행한다.

## 백업

- **DB 덤프.** 11단계가 `pg-backup.sh` 를 `/usr/local/bin/outline-pg-backup` 으로 설치하고 `/etc/cron.d/outline-backup`
  을 쓴다.

  ```
  30 3 * * * root /usr/local/bin/outline-pg-backup >> /var/log/outline-backup.log 2>&1
  ```

  cron 은 VM 현지 시각으로 돈다. 03단계가 `timedatectl` 로 VM 시간대를 내 시간대에 맞춰 두었으므로 현지 03:30 이다.
  매일 03:00(현지)의 디스크 스냅샷과 겹치지 않게 30분 늦췄다.
- 덤프는 postgres 컨테이너(`outline-postgres`) 안에서 `pg_dump --clean --if-exists` 로 뜨므로 호스트에 postgres
  클라이언트가 필요 없다. gzip 으로 묶어 `/var/backups/outline/outline-<UTC 시각>.sql.gz`(mode 600)에 두고,
  `gs://<BACKUP_BUCKET>/postgres/` 로 올린다. 4096바이트보다 작은 덤프는 뭔가 깨진 것으로 보고 버린다.
- 버킷은 `.env` 의 `BACKUP_BUCKET` 에서 읽는다. 인자로 `gs://<버킷>` 을 주면 그 값을 쓰고, `--local-only` 는 올리지 않고
  로컬에만 둔다(`upgrade.sh` 가 이것을 쓴다).
- 로컬 덤프는 30일(`KEEP_DAYS`), 버킷의 덤프는 `lifecycle-30d.json` 에 따라 30일 뒤 지워진다.
- 첨부 파일은 덤프에 없다. uploads 버킷에 있다.
- 부팅 디스크 스냅샷(7일 보관)에는 `/opt/outline/.env` 와 Docker 볼륨이 같이 들어간다. 복원 절차는
  `docs/steps/11-backups.md` 에 있다.

## 함정

- **`FORCE_HTTPS=false`**. Caddy 가 TLS 를 끝내고 http → https 리다이렉트도 이미 한다. `true` 로 두면 프록시 뒤에서
  Outline 이 한 번 더 리다이렉트해서 브라우저가 끝없이 돈다.
- **`AWS_S3_FORCE_PATH_STYLE=true`** 는 GCS 의 S3 호환 XML API 에 필수다. virtual-hosted 방식 URL 은 서명된 업로드를
  깨뜨린다.
- **`AWS_S3_UPLOAD_BUCKET_URL=https://storage.googleapis.com`** 에는 버킷 이름을 넣지 않는다. 버킷 이름은
  `AWS_S3_UPLOAD_BUCKET_NAME` 에 넣는다.
- **`AWS_REGION`** 은 GCS 에서는 아무 문자열이나 된다. S3 SDK 가 값을 요구할 뿐이다.
- `install.sh` 는 실행할 때마다 `FORCE_HTTPS=false`, `AWS_S3_FORCE_PATH_STYLE=true`,
  `AWS_S3_UPLOAD_BUCKET_URL=https://storage.googleapis.com`, `FILE_STORAGE=s3`, `PGSSLMODE=disable` 과
  `DATABASE_URL`, `REDIS_URL` 을 다시 쓴다. `.env` 에서 이 값들을 손으로 바꿔도 다음 실행에 되돌아간다.
- **CORS**: uploads 버킷의 CORS 에는 위키 origin 을 정확히 적어야 한다(`https://<host>`, 끝에 `/` 없이). 틀리면 API 호출은
  되는데 브라우저의 이미지 업로드만 CORS 에러로 실패한다.
- **메모리**: e2-medium 은 4 GB 다. 03단계가 2 GB swap 을 `vm.swappiness=10` 으로 붙인다. swap 이 없으면 업그레이드
  (마이그레이션과 새 컨테이너)가 OOM killer 에 걸릴 수 있다. swap 이 없으면 `install.sh` 가 경고한다.
- **업그레이드**: 이미지에 `yarn` 이 없다. `upgrade.sh` 는 일회용 컨테이너에서
  `node_modules/.bin/sequelize db:migrate --env=production-ssl-disabled` 를 실행한다. `production-ssl-disabled` 설정은
  `PGSSLMODE=disable` 에 맞춘 것이다(compose 네트워크 안에서는 TLS 를 쓰지 않는다). Outline 은 부팅할 때도
  마이그레이션을 돌리지만, 먼저 따로 돌려 두면 실패하는 마이그레이션이 새 버전이 서비스를 시작하기 전에 드러난다.
- **`POSTGRES_PASSWORD`** 는 첫 시작 때 DB 에 박힌다. 나중에 `.env` 에서 바꿔도 DB 사용자 비밀번호는 바뀌지 않는다.
  `outline_pgdata` 볼륨이 이미 있는데 `.env` 에 이 값이 없으면 `install.sh` 는 새 비밀번호를 만들지 않고 멈춘다.
- **`SECRET_KEY`** 를 바꾸면 모두 로그아웃되고 이 키로 암호화한 데이터가 깨진다. 건드리지 않는다.
- **봇 소음**: 공개 호스트에는 스캔이 끊이지 않는다(`/.env`, `/.git/HEAD`, `/wp-login.php`). Outline 은 404 로 답하고,
  Caddy 로그의 그런 줄은 해가 없다.
- **sslip.io 호스트**도 Let's Encrypt 와 이 Caddyfile 로 그대로 동작한다. 이름이 IP 에 묶여 있으므로, 나중에 내 도메인으로
  옮기려면 `--host`, OAuth redirect URI, CORS origin 을 모두 새로 맞춘다.
- **MCP**: Outline 1.6 이상은 `https://<host>/mcp` 에 MCP endpoint 를 연다(07단계). 새 workspace 에서는 기본으로 켜져
  있고, 스위치는 Settings → AI → "MCP server" 다.
