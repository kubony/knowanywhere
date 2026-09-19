---
name: kna-06-outline-deploy
description: knowanywhere 6단계에 쓴다(fresh 모드, kna-05-google-oauth 뒤). GCS 버킷 2개(uploads, backups)와 lifecycle·CORS, 서비스 계정 outline-storage와 HMAC 키를 만들고, deploy/outline 키트를 VM에 복사한 뒤 사용자가 자기 터미널에서 install.sh를 실행하게 해 Outline을 띄운다. TLS와 첫 관리자 로그인까지 확인하고 wiki.url, wiki.buckets.*, wiki.deployed_at을 쓴다.
---

# 06단계: Outline 배포

사용자와는 사용자가 쓰는 언어로 대화한다. 명령, 경로, 변수명, 에러 메시지는 원문 그대로 둔다.
사람용 안내: `docs/steps/06-outline-deploy.md`. 키트 자체의 설명과 함정 목록: `deploy/outline/README.md`.

## 목표

`https://<wiki.host>` 에서 Outline이 HTTPS로 뜨고, 관리자가 Google로 로그인해 워크스페이스를 만든 상태.

## 필요한 state 키

```bash
node .claude/skills/kna-status/state.mjs get gcp
node .claude/skills/kna-status/state.mjs get vm
node .claude/skills/kna-status/state.mjs get wiki.host
node .claude/skills/kna-status/state.mjs get oauth.client_id
node .claude/skills/kna-status/state.mjs get language
```

`steps.03`, `04`, `05` 가 `done` 이어야 한다. 빠진 키는 그 키를 쓰는 단계 이름과 함께 알리고 멈춘다.
아래 예시 값은 state 값으로 바꿔 넣는다. 도구 호출 사이에 셸 변수가 유지되지 않으므로 명령마다 값을 직접 넣는다.

| 예시 | state |
|---|---|
| `kna-wiki-a1b2` | `gcp.project_id` |
| `asia-northeast3` | `gcp.region` |
| `kna-wiki-vm`, `asia-northeast3-a` | `vm.name`, `vm.zone` |
| `wiki.example.com` | `wiki.host` |
| `123456789012-abc123.apps.googleusercontent.com` | `oauth.client_id` |

## 물을 것

1~3은 서로 독립이라 기본값과 함께 한 번에 물어도 된다(AGENTS.md 규칙 9). 4의 yes 는 1~3으로 명령을 확정한 뒤
따로 받는다.

1. **관리자 계정 종류**(5단계에서 들었으면 다시 묻지 않는다). 개인 `@gmail.com` 이면 install.sh에
   `--personal-gmail` 을 붙인다. Outline은 개인 Gmail 로그인으로 새 워크스페이스를 만들지 않기 때문이다.
2. **버킷 이름.** 기본 `kna-wiki-a1b2-uploads`, `kna-wiki-a1b2-backups`. 버킷 이름은 전 세계에서 유일해야 한다.
3. **위키 UI 기본 언어.** `language` 가 `ko` 면 `ko_KR`, 아니면 `en_US` 를 기본으로 제안한다.
4. **비용 확인.** 버킷 2개는 Standard 클래스로 개인 위키 규모면 각각 월 $0.50 미만이다. 서비스 계정과 HMAC 키는
   무료다. 생성 명령을 보여주고 yes를 받는다.

## 절차

### 1. 이전 실행의 흔적 확인

```bash
gcloud storage buckets list --project=kna-wiki-a1b2 --format="value(name)"
gcloud iam service-accounts list --project=kna-wiki-a1b2 --filter="email:outline-storage@" --format="value(email)"
```

이미 있는 것은 다시 만들지 않고 해당 명령을 건너뛴다.

### 2. 버킷 2개 (비용 발생, yes 필요)

```bash
gcloud storage buckets create gs://kna-wiki-a1b2-uploads --project=kna-wiki-a1b2 --location=asia-northeast3 --uniform-bucket-level-access --public-access-prevention
gcloud storage buckets create gs://kna-wiki-a1b2-backups --project=kna-wiki-a1b2 --location=asia-northeast3 --uniform-bucket-level-access --public-access-prevention
gcloud storage buckets update gs://kna-wiki-a1b2-backups --project=kna-wiki-a1b2 --lifecycle-file=deploy/outline/lifecycle-30d.json
```

`409` 과 "already exists" 가 나오면 이름이 다른 사람 것이다. 뒤에 `-2` 같은 접미사를 붙여 다시 묻는다.

uploads 버킷 CORS. 브라우저가 첨부 파일을 버킷에 직접 올리므로 위키 origin을 정확히 넣는다.
`deploy/outline/cors.json` 의 자리표시자 `https://wiki.example.com` 을 state의 `wiki.host` 로 바꾼 사본을
gitignore 대상인 `.knowanywhere/` 에 만든다(이 명령은 값을 state에서 직접 읽으니 그대로 실행한다):

```bash
mkdir -p .knowanywhere && node -e 'const fs=require("fs");fs.writeFileSync(".knowanywhere/cors.json",fs.readFileSync("deploy/outline/cors.json","utf8").replaceAll("https://wiki.example.com","https://"+process.argv[1]))' "$(node .claude/skills/kna-status/state.mjs get wiki.host | tr -d '"')" && cat .knowanywhere/cors.json
gcloud storage buckets update gs://kna-wiki-a1b2-uploads --project=kna-wiki-a1b2 --cors-file=.knowanywhere/cors.json
```

출력의 `origin` 이 `https://<wiki.host>` 인지 확인한다.

### 3. 서비스 계정 (무료)

```bash
gcloud iam service-accounts create outline-storage --project=kna-wiki-a1b2 --display-name="Outline file storage"
gcloud storage buckets add-iam-policy-binding gs://kna-wiki-a1b2-uploads --project=kna-wiki-a1b2 --member=serviceAccount:outline-storage@kna-wiki-a1b2.iam.gserviceaccount.com --role=roles/storage.objectAdmin
```

"does not exist" 가 나오면 새 계정이 아직 전파되지 않은 것이다. 30초 뒤 다시 한다.
backups 버킷에는 권한을 주지 않는다. HMAC 키는 VM의 `.env` 에 있으므로, 유출돼도 백업은 건드릴 수 없게 한다.
백업은 11단계에서 VM의 전용 서비스 계정 `outline-vm`(3단계, 프로젝트 역할 없음)이 쓴다.

### 4. 키트를 VM에 복사

```bash
gcloud compute ssh kna-wiki-vm --project=kna-wiki-a1b2 --zone=asia-northeast3-a --command='mkdir -p ~/outline-kit'
gcloud compute scp --project=kna-wiki-a1b2 --zone=asia-northeast3-a deploy/outline/{docker-compose.yml,Caddyfile,.env.example,install.sh,upgrade.sh,pg-backup.sh,lifecycle-30d.json,cors.json,README.md} kna-wiki-vm:~/outline-kit/
gcloud compute ssh kna-wiki-vm --project=kna-wiki-a1b2 --zone=asia-northeast3-a --command='ls -la ~/outline-kit'
```

기대: 9개 파일, `.env.example` 포함. 다시 실행해도 같은 자리에 덮어쓴다.

### 5. HMAC 키 생성과 install.sh (사용자가 자기 터미널에서)

이 두 명령은 **Claude Code 밖의 새 터미널 창**에서 사용자가 직접 실행한다. 이유 두 가지를 말한다:
`hmac create` 가 secret을 한 번 출력하는데 도구로 실행하면 대화 기록에 남는다. `install.sh` 는 secret을 숨김
입력으로 받으므로 TTY가 필요하고, 이 세션의 도구 호출에는 TTY가 없다.

사용자에게 줄 블록(값을 채워서 보여준다. 개인 Gmail이면 끝에 `--personal-gmail` 을 붙인다):

```bash
gcloud storage hmac create outline-storage@kna-wiki-a1b2.iam.gserviceaccount.com --project=kna-wiki-a1b2

gcloud compute ssh kna-wiki-vm --project=kna-wiki-a1b2 --zone=asia-northeast3-a -- -t 'bash ~/outline-kit/install.sh --host wiki.example.com --uploads-bucket kna-wiki-a1b2-uploads --backups-bucket kna-wiki-a1b2-backups --google-client-id 123456789012-abc123.apps.googleusercontent.com --region asia-northeast3 --language ko_KR'
```

install.sh가 순서대로 묻는 것:

| 프롬프트 | 넣을 값 |
|---|---|
| `HMAC access id (starts with GOOG):` | `hmac create` 출력의 `accessId` (보이는 입력) |
| `HMAC secret for GOOG... (input hidden):` 와 확인 | 같은 출력의 `secret` (40자) |
| `Google OAuth client secret (input hidden):` 와 확인 | 5단계에서 받아 둔 client secret |

스크립트는 `/opt/outline/.env` (mode 600)를 만들고 `SECRET_KEY`, `UTILS_SECRET`, `POSTGRES_PASSWORD` 를 VM에서
한 번만 생성한 뒤 `docker compose pull` 과 `up -d` 를 하고, `https://wiki.example.com/_health` 가 `OK` 를 줄 때까지
최대 600초 기다린다. 끝나면 "Next" 안내를 출력한다. 사용자가 끝났다고 하면 마지막 몇 줄(secret 없음)을
붙여 달라고 한다.

실패하면 스크립트가 출력한 원인 후보를 같이 본다: DNS(`dig +short wiki.example.com`), 방화벽 80/443,
첫 부팅 마이그레이션 지연. install.sh는 다시 실행해도 안전하다. 생성된 secret은 다시 만들지 않고, 비어 있는
secret만 다시 묻는다. HMAC 키를 여러 번 만들었으면 쓰지 않는 키를 정리하게 한다:
`gcloud storage hmac list --project=kna-wiki-a1b2` 로 보고 `gcloud storage hmac update <accessId> --project=kna-wiki-a1b2 --deactivate` 후
`gcloud storage hmac delete <accessId> --project=kna-wiki-a1b2`.

### 6. 첫 로그인 (브라우저, 사람)

**Workspace 계정:** `https://wiki.example.com` → **Continue with Google**. 첫 계정이 관리자다.
그다음 Settings → **Details** (`/settings/details`)에서 워크스페이스 이름을 정하고, Settings → **Security**
(`/settings/security`)에서 **Require invites** 를 켜거나 **Allowed domains** 에 회사 도메인을 넣는다.

**개인 Gmail:** install.sh 직후 바로 `https://wiki.example.com` 을 연다. 폼을 제출하기 전에는 먼저 여는 사람이
관리자가 되므로 미루지 않는다. **Create workspace** 폼에 워크스페이스 이름, 이름, Google 로그인에 쓸 Gmail 주소를
정확히 넣는다. 제출했다고 하면 Google 로그인을 켠다. 이 실행은 secret을 묻지 않으므로 사용자 yes를 받고 도구로
실행해도 된다:

```bash
gcloud compute ssh kna-wiki-vm --project=kna-wiki-a1b2 --zone=asia-northeast3-a --command='bash /opt/outline/install.sh --enable-google --wait 300'
```

이어서 브라우저에서 Settings → **Authentication** (`/settings/authentication`) → Google → **Connect**,
Settings → **Security** → **Require invites** 켜기, 로그아웃 후 **Continue with Google** 로 다시 로그인.

## 검증

검증 명령과 도구 호출의 출력은 요약하지 말고 fenced code block 으로 원문을 붙이고, 그 아래 한 줄로 기대 결과와 맞는지 판정한다.

```bash
curl -sI https://wiki.example.com | head -1
curl -s https://wiki.example.com/_health; echo
curl -s -X POST https://wiki.example.com/api/auth.config -H 'Content-Type: application/json' -d '{}' | node -e 'let s="";process.stdin.on("data",(d)=>(s+=d)).on("end",()=>{const d=JSON.parse(s).data||{};console.log("workspace:",d.name??"(none yet)");console.log("providers:",(d.providers||[]).map((p)=>p.id).join(",")||"(none)")})'
gcloud compute ssh kna-wiki-vm --project=kna-wiki-a1b2 --zone=asia-northeast3-a --command='cd /opt/outline && docker compose ps --format "table {{.Name}}\t{{.Status}}" && stat -c "%a %n" .env'
```

기대 출력:
- `HTTP/2 200` 또는 `HTTP/2 302`
- `OK`
- `workspace: <정한 이름>`, `providers: google`
- `outline-caddy`, `outline`, `outline-postgres`, `outline-redis` 4행 모두 Status에 `(healthy)`, 그리고 `600 .env`

하나라도 다르면 done으로 쓰지 않는다. `(health: starting)` 이면 첫 부팅 마이그레이션 중이니 1~2분 뒤 다시 본다.
`providers:` 가 비어 있으면 개인 Gmail 흐름의 `--enable-google` 과 Connect가 아직이다.

## state에 쓸 것

`state.mjs` 가 출력한 JSON 조각을 fenced code block 으로 그대로 보여준다.

```bash
node .claude/skills/kna-status/state.mjs set '{"wiki":{"url":"https://wiki.example.com","buckets":{"uploads":"kna-wiki-a1b2-uploads","backups":"kna-wiki-a1b2-backups"},"deployed_at":"2026-09-15T08:05:00Z"}}'
node .claude/skills/kna-status/state.mjs step 06 done
```

`deployed_at` 은 검증이 통과한 시각(UTC, `date -u +%Y-%m-%dT%H:%M:%SZ`)이다. 다시 배포하는 경우 기존 값을
덮지 않는다. HMAC access id와 secret 관련 값은 state에 쓰지 않는다
(helper도 거부한다). 5단계에서 받은 client secret JSON 파일은 이제 지워도 된다고 알린다.

## 다음 단계

`kna-07-mcp-connect`: 이 머신의 Claude Code를 `https://wiki.example.com/mcp` 에 연결한다. 시작 전에 묻는다.
