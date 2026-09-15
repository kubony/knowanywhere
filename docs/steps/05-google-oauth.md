# 05단계: Google 로그인(OAuth client)

스킬: `kna-05-google-oauth`. `fresh` 모드만.

위키에는 Google 계정으로만 로그인한다. 이 단계에서는 Google Cloud 콘솔에서 위키용 OAuth client 를 하나 만든다.
결과물은 두 값이다.

| 값 | 성격 | 어디에 두나 |
|---|---|---|
| Client ID (`…apps.googleusercontent.com`) | 공개 값. 로그인 URL 에 그대로 보인다 | 인스톨러 state 의 `oauth.client_id` |
| Client secret | 비밀값 | 06단계에서 VM 의 `/opt/outline/.env`(mode 600)에만. 채팅, state, 레포, 위키에 두지 않는다 |

돈은 들지 않는다. 콘솔 클릭은 사람이 하고, 인스톨러는 끝난 뒤 Google 에 실제로 물어 설정이 맞는지 확인한다.

## 시작 전에

- 04단계의 위키 주소가 필요하다. 아래 예시는 `wiki.example.com`, 프로젝트 ID 는 `kna-wiki-a1b2` 다. 내 값으로 바꿔 읽는다.
- 관리자로 로그인할 계정이 어느 쪽인지 정한다. 06단계의 설치 방법이 달라진다.

| 관리자 계정 | 예 | 06단계 |
|---|---|---|
| 개인 Gmail | `you@gmail.com` | `install.sh --personal-gmail` 로 두 번에 나눠 설치한다. Outline 은 개인 Gmail 로그인으로 새 워크스페이스를 만들지 않는다 |
| Google Workspace | `you@yourcompany.com` | 한 번에 설치한다 |

- **client secret 은 채팅에 붙여 넣지 않는다.** 대화 기록에 남는다. 06단계에서 내 터미널의 `install.sh` 프롬프트에
  직접 붙여 넣는다.

## 0. 프로젝트가 조직 소속인지 확인

동의 화면의 Audience 로 **Internal** 을 고를 수 있는지는 계정 종류가 아니라 프로젝트가 조직(Google Workspace) 아래에
있는지로 정해진다. 인스톨러가 콘솔 안내 전에 확인한다.

```bash
gcloud projects describe kna-wiki-a1b2 --format="value(parent.type,parent.id)"
```

| 출력 | 뜻 | Audience |
|---|---|---|
| `organization  123456789012` (또는 `folder  ...`) | 조직 아래 프로젝트 | **Internal** 권장. 그 조직 계정만 로그인하고, 테스트 사용자 등록과 "unverified app" 경고가 없다 |
| 빈 줄 | 조직이 없는 프로젝트 | **External** + 테스트 사용자(3절). Internal 은 콘솔에서 비활성이다 |

Workspace 계정이어도 01단계에서 조직 없이 만든 프로젝트라면 빈 줄이 나오고 Internal 을 고를 수 없다.

아래 메뉴와 버튼은 영어 이름으로 적었다. 콘솔을 한국어로 쓰면 같은 자리에 번역된 이름이 보인다. 화면 구성은
2025년 개편 이후 기준이다(예전 이름: APIs & Services > OAuth consent screen / Credentials).

## 1. Google Auth Platform 열기

브라우저에서 연다:

```
https://console.cloud.google.com/auth/overview?project=kna-wiki-a1b2
```

또는 콘솔 맨 위 검색창에 `Google Auth Platform` 을 쳐서 연다. 맨 위 프로젝트 선택기에 `kna-wiki-a1b2` 가 보이는지
확인한다. 다른 프로젝트면 선택기를 눌러 바꾼다.

## 2. 동의 화면 만들기 (처음 한 번)

**Get started** 를 누르면 네 칸짜리 마법사가 뜬다. 칸마다 채우고 **Next** 를 누른다.

| 칸 | 넣을 것 |
|---|---|
| **App Information** | App name: `knowanywhere wiki`(Google 로그인 화면에 보이는 이름). User support email: 내 계정 |
| **Audience** | 0절 결과대로. 조직 아래 프로젝트면 **Internal**(그 조직 계정만 로그인), 조직이 없으면 **External** |
| **Contact Information** | 알림을 받을 이메일 |
| **Finish** | "Google API Services: User Data Policy" 동의에 체크 > **Continue** > **Create** |

**Get started** 대신 Overview 화면이 뜨면 이 프로젝트에 이미 동의 화면이 있다. 3으로 간다.

## 3. 누가 로그인할 수 있게 할지 (External 일 때)

왼쪽 메뉴 **Audience**.

- **권장: Testing 그대로 두기.** **Test users** 칸의 **+ Add users** 에 관리자 Gmail 과 위키를 함께 쓸 사람의 Gmail 을
  넣고 **Save**. 목록에 없는 계정은 Google 로그인 단계에서 막힌다. 로그인할 때 "Google hasn't verified this app"
  경고가 뜨는데 **Continue** 로 넘어가면 된다.
- **경고 없이 쓰기: Publish app.** **Publishing status** 의 **Publish app** 을 눌러 In production 으로 바꾼다. Outline 이
  요청하는 scope 는 `userinfo.email`, `userinfo.profile` 뿐이라 심사 없이 게시된다. 이때 누가 가입할 수 있는지는
  06단계 끝의 Outline 설정(**Require invites** 또는 **Allowed domains**)이 정한다.

**Data Access** 메뉴에서 scope 를 추가할 필요는 없다.

## 4. Web client 만들기

왼쪽 메뉴 **Clients** > **+ Create client**.

| 필드 | 값 |
|---|---|
| **Application type** | `Web application` |
| **Name** | `outline` (콘솔 안에서만 보이는 이름) |
| **Authorized JavaScript origins** > **+ Add URI** | `https://wiki.example.com` (끝에 `/` 없이) |
| **Authorized redirect URIs** > **+ Add URI** | `https://wiki.example.com/auth/google.callback` |

**Create** 를 누르면 "OAuth client created" 창에 Client ID 와 Client secret 이 뜬다.

1. **Download JSON** 을 눌러 파일을 받아 둔다(레포 밖, 예: `~/Downloads`). 새 client 의 secret 은 이 창에서만 온전히
   보인다. 창을 닫았으면 나중에 **Clients** > `outline` > **Add secret** 으로 새 secret 을 만들 수 있다.
2. **Client ID 만** 인스톨러 채팅에 붙여 넣는다.
3. JSON 파일은 06단계가 끝나면 지운다.

콘솔은 설정이 반영되는 데 몇 분 걸릴 수 있다고 안내한다.

## 확인

인스톨러가 Google 의 로그인 시작 주소에 Client ID 와 redirect URI 를 보내 본다. 로그인 전에 Google 이 client 가 있는지,
redirect URI 가 등록된 것과 같은지 검사하는 단계다.

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

```
OK 302 client_id and redirect_uri accepted
```

| 출력 | 원인 | 고치는 법 |
|---|---|---|
| `ERROR invalid_client` | Client ID 오타, 다른 프로젝트의 client, 또는 아직 반영 전 | **Clients** 목록에서 다시 복사하고 몇 분 뒤 다시 확인 |
| `ERROR redirect_uri_mismatch` | redirect URI 가 정확히 `https://<위키 주소>/auth/google.callback` 이 아니다(`http`, 끝의 `/`, 오타) | **Clients** > `outline` 에서 고치고 **Save**, 몇 분 뒤 다시 확인 |

## 기록되는 것

```bash
node .claude/skills/kna-status/state.mjs set '{"oauth":{"client_id":"123456789012-abc123.apps.googleusercontent.com"}}'
node .claude/skills/kna-status/state.mjs step 05 done
```

## secret 을 실수로 붙여 넣었다면

그 secret 은 유출된 것으로 본다. **Clients** > `outline` > **Add secret** 으로 새 secret 을 만들고, 옛 secret 을
disable 한 뒤 delete 한다. 06단계를 이미 했다면 VM 의 `.env` 에서 `GOOGLE_CLIENT_SECRET` 줄을 지우고 `install.sh` 를 다시
실행하면 새 값을 묻는다.

## 나중에 위키 주소가 바뀌면

sslip.io 주소에서 내 도메인으로 옮기는 경우처럼 `wiki.host` 가 바뀌면, 이 client 의 **Authorized JavaScript origins**
와 **Authorized redirect URIs** 에 새 주소를 더한다. 새 client 를 만들 필요는 없다.

## 다음

[06단계: Outline 배포](06-outline-deploy.md). 받아 둔 client secret 을 그때 VM 프롬프트에 넣는다.
