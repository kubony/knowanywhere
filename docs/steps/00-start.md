# 00단계: 시작

스킬: `kna-00-start`. `fresh` 와 `join` 모드 모두에서 돈다.

이 단계는 네 가지를 묻고, 도구 네 개가 설치돼 있는지 확인하고, 인스톨러의 state 파일(`.knowanywhere/state.json`,
커밋되지 않는다)을 만든다. 돈이 드는 일은 없다.

## 네 가지 질문

**1. 모드: `fresh` 인가 `join` 인가?**

| 모드 | 이럴 때 고른다 | 도는 단계 |
|---|---|---|
| `fresh` | 새 위키를 만든다. 이 머신이 첫 머신이다. | 00 부터 11 까지(02 와 10 은 선택) |
| `join` | knowanywhere 위키가 이미 있고, 이 머신이나 새 에이전트가 그것을 쓰게 한다. | 00, 07, 08, 09(10 은 선택) |

**2. 에이전트 이름.** 짧은 이름이면 된다. 예: `로제`. 이름은 두 곳에 쓰인다.

- 위키 콜렉션 `로제 Sessions`. 이 에이전트만 여기에 작업 기록을 쓴다.
- 에이전트가 쓰는 모든 문서의 첫 줄 서명(한국어 템플릿은 `작성자: 로제`, 영어 템플릿은 `Author:` 뒤에 이름).

같은 에이전트를 맥북과 데스크탑에서 함께 돌리면 두 머신에서 대소문자까지 똑같은 이름을 준다. 다른 에이전트(예:
Codex 로 도는 `지수`)는 자기 이름과 자기 콜렉션을 갖는다.

**3. 템플릿 언어: `ko` 또는 `en`.** 위키와 `~/.claude/CLAUDE.md` 에 쓸 규칙 템플릿을 어느 언어판으로 할지 정한다.
인스톨러는 이것과 관계없이 늘 사용자가 쓰는 언어로 대화한다.

**4. 도메인: `own` 또는 `sslip`** (`fresh` 모드만).

- `own`: 가진 도메인의 DNS 레코드를 고칠 수 있다. 위키 주소는 `wiki.<내 도메인>`, 예를 들어 `wiki.example.com` 이
  된다. 04단계에서 A 레코드 하나를 추가한다.
- `sslip`: 도메인이 없다. [sslip.io](https://sslip.io) 는 IP 주소가 들어간 이름을 그 IP 로 풀어 주는 무료 DNS 서비스다.
  `wiki-203-0-113-10.sslip.io` 는 `203.0.113.10` 으로 풀린다. HTTPS 도 된다. 주소가 길고 VM IP 에 묶이며, 나중에 내
  도메인으로 옮기려면 04단계부터 07단계까지 일부를 다시 해야 한다.

`join` 모드에서는 이 질문 대신 기존 위키 주소를 묻는다. 예: `https://wiki.example.com`.

## 도구

```bash
command -v gcloud >/dev/null && gcloud --version | head -1 || echo "gcloud: MISSING"
node --version
claude --version
git --version
```

| 도구 | 쓰이는 곳 | 최소 버전 |
|---|---|---|
| `gcloud` | GCP 프로젝트와 VM 을 만들고 관리한다(`fresh` 모드) | 최근 버전이면 된다 |
| `node` | 인스톨러의 state 도우미, Discord 브리지 | 20 |
| `claude` | Claude Code 자체 | 최근 버전이면 된다 |
| `git` | 이 레포 클론과 업데이트 | 아무 버전 |

### gcloud 설치

[Homebrew](https://brew.sh) 가 있는 macOS:

```bash
brew install --cask gcloud-cli
gcloud --version
```

Debian 이나 Ubuntu:

```bash
sudo apt-get update && sudo apt-get install -y apt-transport-https ca-certificates gnupg curl
curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg | sudo gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg
echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" | sudo tee /etc/apt/sources.list.d/google-cloud-sdk.list
sudo apt-get update && sudo apt-get install -y google-cloud-cli
gcloud --version
```

그 밖의 Linux 배포판(대화형 설치기이므로 자기 터미널에서 실행한다):

```bash
curl https://sdk.cloud.google.com | bash
exec -l $SHELL
gcloud --version
```

Windows 는 PowerShell 에서 설치기를 받아 실행하고, 기본 옵션 그대로 설치한 뒤 시작 메뉴의 "Google Cloud SDK Shell" 에서
`gcloud --version` 을 실행한다. 설치기는 https://cloud.google.com/sdk/docs/install 에서 직접 받아도 된다.

```powershell
(New-Object Net.WebClient).DownloadFile("https://dl.google.com/dl/cloudsdk/channels/rapid/GoogleCloudSDKInstaller.exe", "$env:Temp\GoogleCloudSDKInstaller.exe")
& $env:Temp\GoogleCloudSDKInstaller.exe
```

설치했는데 `gcloud: command not found` 가 나오면 새 터미널 창을 연다. 설치기는 새 셸에만 PATH 를 더한다.

### Node.js 20 이상 설치

macOS:

```bash
brew install node
node --version
```

Linux(사용자 단위, sudo 불필요):

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
. "$HOME/.nvm/nvm.sh" && nvm install --lts
node --version
```

Windows 는 https://nodejs.org/ 의 LTS 설치기를 쓴다.

## 쓰는 것

```bash
git check-ignore -v .knowanywhere/state.json   # .gitignore 규칙이 출력돼야 한다
node .claude/skills/kna-status/state.mjs init
node .claude/skills/kna-status/state.mjs mode fresh
node .claude/skills/kna-status/state.mjs set '{"language":"ko","agent":{"name":"로제"},"domain":{"kind":"own"}}'
node .claude/skills/kna-status/state.mjs status
```

기록되는 조각(모든 키는 [`docs/state.md`](../state.md)에 있다):

```json
{
  "mode": "fresh",
  "language": "ko",
  "agent": { "name": "로제" },
  "domain": { "kind": "own" },
  "prereqs": { "gcloud": "560.0.0", "node": "22.11.0", "claude": "2.1.0", "git": "2.45.2", "checked_at": "2026-09-15T05:01:10Z" }
}
```

`join` 모드에서는 `wiki.host` 와 `wiki.url` 도 여기서 쓰고, 위키가 답하는지 확인한다.

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://wiki.example.com/
```

`200` 이나 `302` 가 나와야 한다.

## 다음

- `fresh`: [01단계: GCP 계정](01-gcp-account.md)
- `join`: 07단계, [`kna-07-mcp-connect`](07-mcp-connect.md)
