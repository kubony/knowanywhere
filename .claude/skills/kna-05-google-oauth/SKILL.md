---
name: kna-05-google-oauth
description: knowanywhere 5단계에 쓴다(fresh 모드, kna-04-dns 뒤). Google Cloud 콘솔의 Google Auth Platform에서 OAuth 동의 화면(External)과 Web application client를 만들도록 클릭 경로를 안내하고, redirect URI `https://<wiki.host>/auth/google.callback` 을 Google에 실제로 물어 검증한다. client ID만 state에 쓰고, client secret은 6단계에서 VM의 install.sh 프롬프트에 직접 입력하게 한다.
---

# 05단계: Google 로그인(OAuth client)

사용자와는 사용자가 쓰는 언어로 대화한다. 명령, 경로, 키 이름, 콘솔 메뉴 이름, 에러 메시지는 원문 그대로 둔다.
사람용 안내와 클릭 경로 전체: `docs/steps/05-google-oauth.md`.

## 목표

위키 로그인용 Google OAuth web client 하나를 만든다. 이 단계의 결과물은 `oauth.client_id`(공개 값) 하나다.
client secret은 이 단계에서 어디에도 저장하지 않는다. 6단계 `install.sh` 가 VM에서 숨김 입력으로 받아
`/opt/outline/.env` (mode 600)에만 쓴다.

### 시작 전에 사용자에게 알릴 것

- **client secret을 이 채팅에 붙여넣지 말라고 먼저 말한다.** 붙여넣으면 대화 기록에 남는다. secret은 6단계에서
  사용자가 자기 터미널의 `install.sh` 프롬프트에 직접 붙여넣는다.
- 새 client의 secret은 만든 직후 창에서만 온전히 보인다. 그 창에서 **Download JSON** 으로 받아 두거나 창을 열어
  둔다. 받은 JSON 파일은 레포 밖(예: `~/Downloads`)에 두고 6단계가 끝나면 지우라고 한다.
- 사용자가 secret을 실수로 채팅에 붙여넣었으면 되풀이하지 않는다. 콘솔 **Clients → 해당 client → Add secret**
  으로 새 secret을 만들고 옛 secret을 disable 한 뒤 삭제하라고 안내한다.

## 필요한 state 키

```bash
node .claude/skills/kna-status/state.mjs get wiki.host
node .claude/skills/kna-status/state.mjs get gcp.project_id
```

`steps.04.status` 가 `done` 이어야 한다. `wiki.host` 가 없으면 멈추고 `kna-04-dns` 가 쓰는 키라고 알린다.
아래 명령과 URL의 예시 값 `wiki.example.com`, `kna-wiki-a1b2` 는 state 값으로 바꿔 넣는다.

## 물을 것

한 번에 하나씩 묻는다.

1. **관리자로 로그인할 Google 계정 종류.** 개인 `@gmail.com` 인가, Google Workspace(회사 도메인) 계정인가.
   - Audience 선택이 달라진다(아래 2). 6단계에서 `--personal-gmail` 이 필요한지도 이것으로 정한다. Outline은
     개인 Gmail 로그인으로는 새 워크스페이스를 만들지 않기 때문이다. state 스키마에 이 키는 없으므로 기록하지
     않고, 6단계가 다시 묻는다.
2. **앱 이름.** 기본 `knowanywhere wiki`. Google 로그인 화면에 보이는 이름이다.
3. **지원 이메일.** 기본은 지금 콘솔에 로그인한 계정. `gcloud config get-value account` 로 보여준다.

## 절차

사람이 콘솔에서 클릭한다.
각 절을 안내하고 "끝났다"는 답을 받은 뒤 다음 절로 간다. 화면 이름은 2025년 개편 이후 콘솔 기준이다
(예전 이름: APIs & Services → OAuth consent screen / Credentials).

### 1. Google Auth Platform 열기

`https://console.cloud.google.com/auth/overview?project=kna-wiki-a1b2`

상단 프로젝트 선택기에 `kna-wiki-a1b2` 가 보이는지 확인하게 한다.

### 2. 동의 화면 (처음 한 번)

**Get started** 를 누르고 마법사를 채운다.

| 화면 | 입력 |
|---|---|
| App Information | App name: `knowanywhere wiki`, User support email: 지원 이메일 |
| Audience | **External** (개인 Gmail이면 필수). Workspace 계정이면 **Internal** 도 된다. 그 조직 계정만 로그인할 수 있다 |
| Contact Information | 알림 받을 이메일 |
| Finish | Google API Services: User Data Policy 동의 체크 → **Continue** → **Create** |

이미 구성된 프로젝트면 Get started 대신 Overview가 뜬다. 그때는 3으로 간다.

### 3. 누가 로그인할 수 있게 할지 (External일 때)

**Audience** 메뉴. 권장은 Publishing status를 **Testing** 으로 두고 **Test users → + Add users** 에 관리자 계정과
위키를 쓸 사람의 Gmail을 넣는 것이다. 목록에 없는 계정은 Google 단계에서 막힌다. Testing 상태에서는 로그인할 때
"Google hasn't verified this app" 경고가 뜨는데 **Continue** 로 넘어가면 된다.

경고 없이 쓰려면 **Publish app** 으로 In production 으로 바꾼다. Outline이 요청하는 scope는
`userinfo.email`, `userinfo.profile` 뿐이라 심사 없이 게시된다. 이때 누가 가입할 수 있는지는 6단계 끝의 Outline
설정(Require invites 또는 Allowed domains)이 정한다. **Data Access** 에 scope를 추가할 필요는 없다.

### 4. Web client 만들기

**Clients → + Create client**

| 필드 | 값 |
|---|---|
| Application type | `Web application` |
| Name | `outline` |
| Authorized JavaScript origins → + Add URI | `https://wiki.example.com` (끝에 `/` 없이) |
| Authorized redirect URIs → + Add URI | `https://wiki.example.com/auth/google.callback` |

**Create** 를 누르면 "OAuth client created" 창에 Client ID와 Client secret이 뜬다. **Download JSON** 을 누르거나
창을 열어 둔 채로, **Client ID만** 채팅에 알려 달라고 한다.

설정 반영에 몇 분 걸릴 수 있다고 콘솔이 안내한다. 아래 검증이 `redirect_uri_mismatch` 면 5분 뒤 다시 한다.

### 나중에 호스트가 바뀌면

`wiki.host` 가 바뀌면(sslip.io에서 자기 도메인으로 옮기는 경우 등) 이 client의 origin과 redirect URI에 새 주소를
추가해야 로그인이 된다. 새 client를 만들 필요는 없다.

## 검증

1. 형식: 받은 값이 `.apps.googleusercontent.com` 으로 끝나고 공백이 없어야 한다.
2. Google에 실제로 묻는다. 로그인 전에 client 존재 여부와 redirect URI 일치를 확인하는 요청이다:

```bash
node -e '
const [cid, host] = process.argv.slice(1);
const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
u.search = new URLSearchParams({ client_id: cid, redirect_uri: `https://${host}/auth/google.callback`, response_type: "code", scope: "openid email" });
fetch(u, { redirect: "manual" }).then((r) => {
  const loc = r.headers.get("location") || "";
  if (!loc.includes("/signin/oauth/error")) return console.log("OK", r.status, "client_id and redirect_uri accepted");
  const s = Buffer.from(new URL(loc).searchParams.get("authError") || "", "base64url").toString("utf8");
  console.log("ERROR", (s.match(/[a-z]+(?:_[a-z]+)+/) || ["unknown"])[0]);
});' 123456789012-abc123.apps.googleusercontent.com wiki.example.com
```

기대 출력: `OK 302 client_id and redirect_uri accepted`.

| 출력 | 원인과 조치 |
|---|---|
| `ERROR invalid_client` | Client ID 오타, 다른 프로젝트의 client, 또는 방금 만들어 아직 반영 전. 콘솔 Clients 목록에서 다시 복사하고 몇 분 뒤 재시도 |
| `ERROR redirect_uri_mismatch` | redirect URI가 정확히 `https://<wiki.host>/auth/google.callback` 이 아니다(http, 끝의 `/`, 오타). 고치고 **Save** 후 몇 분 뒤 재시도 |
| 네트워크 에러 | 이 머신의 인터넷 연결 확인 후 재시도 |

state를 쓴 뒤 한 번 더 읽어 보여준다:

```bash
node .claude/skills/kna-status/state.mjs get oauth.client_id
```

## state에 쓸 것

```bash
node .claude/skills/kna-status/state.mjs set '{"oauth":{"client_id":"123456789012-abc123.apps.googleusercontent.com"}}'
node .claude/skills/kna-status/state.mjs step 05 done
```

helper가 출력한 JSON 조각을 사용자에게 보여준다. secret이나 JSON 파일 경로는 쓰지 않는다.

## 다음 단계

`kna-06-outline-deploy`: 버킷과 HMAC 키를 만들고 VM에 Outline을 올린다. 이 단계에서 받아 둔 client secret을
그때 VM 프롬프트에 입력한다. 시작 전에 묻는다.
