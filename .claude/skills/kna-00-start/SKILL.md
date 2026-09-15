---
name: kna-00-start
description: knowanywhere 설치를 처음 시작할 때(첫 실행에서 사용자가 yes 라고 한 뒤), 또는 모드·에이전트 이름·템플릿 언어·도메인 선택을 바꾸고 싶을 때 쓴다. fresh/join 모드, 에이전트 이름, 템플릿 언어, 도메인 종류를 묻고 gcloud, node(20 이상), claude, git 을 확인한 뒤 .knowanywhere/state.json 을 만든다.
---

# 00단계: 시작

사용자가 쓰는 언어로 말한다. 명령, 경로, 키 이름은 원문 그대로 둔다.
사람이 읽는 안내서: `docs/steps/00-start.md`.

## 목표

동의를 받고, 설치 모양을 정하는 선택 네 가지를 모으고, 필요한 도구가 있는지 확인하고, state 파일을 만든다.
이 단계는 돈이 들지 않는다.

## 필요한 state 키

없다. `.knowanywhere/state.json` 이 이미 있고 `steps.00.status` 가 `done` 이면 현재 `mode`, `agent.name`,
`language`, `domain.kind` 를 보여주고 무엇을 바꿀지 묻는다. 기존 state 위에 `init` 을 다시 돌리지 않는다
(`init` 은 파일이 있으면 아무것도 하지 않지만, 처음부터 다시 하자는 뜻으로 오해하게 만들지 않는다).

## 물을 것

한 번에 하나씩, 이 순서로 묻는다.

1. **동의.** 이번 세션에서 아직 yes 를 받지 않았다면 3줄로 요약한다. 무엇을 만드는지, 비용(90일 GCP 무료 크레딧
   $300, 그 뒤 리전에 따라 월 $33 ~ 40 정도), 돈이 들거나 지우는 일은 모두 먼저 묻는다는 것. 그리고 진행할지 묻는다.
2. **모드.** CLAUDE.md 에서 이미 답을 받았으면 다시 묻지 않는다.
   - `fresh`: 새 GCP 프로젝트에 새 위키를 만든다. 이 머신이 첫 에이전트 호스트가 된다.
   - `join`: knowanywhere 위키가 이미 있다(다른 머신에서 이 레포로 만들었거나 다른 사람이 만들었다). 이 머신이나
     새 에이전트를 거기에 연결한다. 00, 07, 08, 09 단계만 돈다(원하면 10도).
3. **에이전트 이름.** 짧은 이름을 자유롭게 고르게 한다(예: `로제`, `지수`. 한글과 영문 모두 된다. 1~30자, 글자·숫자·공백·하이픈).
   이 이름이 `<이름> Sessions` 콜렉션이 되고, 그 콜렉션에는 이 에이전트만 쓰며, 에이전트가 쓰는 모든 문서의 첫 줄
   서명이 된다고 설명한다. 여러 머신에서 도는 같은 에이전트는 대소문자까지 똑같은 이름을 쓴다. `join` 모드에서는
   다른 머신에 이미 있는 같은 에이전트인지(그 콜렉션을 재사용한다), 새 에이전트인지(08단계에서 콜렉션을 새로 만든다) 묻는다.
4. **템플릿 언어.** 위키와 `~/.claude/CLAUDE.md` 에 쓸 규칙 템플릿의 언어: `ko` 또는 `en`. 기본값은 사용자가 지금 쓰는
   언어다. 대화 언어는 이것과 관계없이 사용자 언어를 따른다.
5. **도메인** (`fresh` 만):
   - `own`: DNS 를 관리할 수 있는 도메인이 있다(예: `example.com`). 위키 주소는 `wiki.example.com` 이 되고,
     04단계에서 A 레코드 하나를 추가한다. 도메인이 있으면 이쪽을 권한다.
   - `sslip`: 도메인이 없어도 된다. VM IP 로 만든 `wiki-203-0-113-10.sslip.io` 같은 이름을 쓰고, 무료 DNS 서비스
     sslip.io 가 그 IP 로 풀어 준다. HTTPS 도 된다. 주소가 길고 IP 에 묶이며, 나중에 내 도메인으로 옮기려면
     04~07단계 일부를 다시 해야 한다.
6. **기존 위키 주소** (`join` 만): 예 `https://wiki.example.com`. 여기서 `wiki.host`(호스트 이름)와
   `wiki.url`(`https://<host>`, 끝의 `/` 없음)을 뽑는다.

## 절차

### 1. 필수 도구 확인

하나씩 실행하고 출력을 보여준다.

```bash
command -v gcloud >/dev/null && gcloud --version | head -1 || echo "gcloud: MISSING"
node --version 2>/dev/null || echo "node: MISSING"
claude --version 2>/dev/null || echo "claude: MISSING"
git --version 2>/dev/null || echo "git: MISSING"
```

Node 가 있으면 버전이 20 이상인지 확인한다.

```bash
node -e 'const m=+process.versions.node.split(".")[0]; console.log(m>=20?"node OK":"node TOO OLD"); process.exit(m>=20?0:1)'
```

기준: `node` 는 20 이상. `gcloud` 는 `fresh` 모드에서 필수이고, `join` 모드에서는 Discord 브리지(10단계)를 GCP VM 에서
돌릴 때만 필요하다. `claude` 와 `git` 은 여기까지 왔다면 이미 있지만 버전은 기록한다.

빠진 것이 있으면 사용자 OS 에 맞는 설치 명령을 보여주고 yes 를 받는다. `sudo` 비밀번호나 대화형 입력이 필요한
명령은 도구 호출로 답할 수 없으므로(도구 호출에는 TTY 가 없다) 사용자가 **Claude Code 밖의 자기 터미널**에서 직접
실행하게 한다. 사용자가 끝났다고 하면 위 확인 명령을 다시 돌려 CLI 로 확인한다.

**gcloud** (Google Cloud CLI):

```bash
# macOS (Homebrew)
brew install --cask gcloud-cli
```

```bash
# Debian / Ubuntu
sudo apt-get update && sudo apt-get install -y apt-transport-https ca-certificates gnupg curl
curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg | sudo gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg
echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" | sudo tee /etc/apt/sources.list.d/google-cloud-sdk.list
sudo apt-get update && sudo apt-get install -y google-cloud-cli
```

```bash
# 그 밖의 Linux (홈 디렉터리에 설치하는 대화형 설치기. 사용자가 직접 실행한다)
curl https://sdk.cloud.google.com | bash
exec -l $SHELL
```

Windows 는 PowerShell 에서 공식 설치기를 받아 실행한다. 기본 옵션 그대로 설치한 뒤 새 터미널이나
"Google Cloud SDK Shell" 을 연다.

```powershell
(New-Object Net.WebClient).DownloadFile("https://dl.google.com/dl/cloudsdk/channels/rapid/GoogleCloudSDKInstaller.exe", "$env:Temp\GoogleCloudSDKInstaller.exe")
& $env:Temp\GoogleCloudSDKInstaller.exe
```

macOS 에 Homebrew 가 없으면 먼저 설치한다.

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

설치 뒤 `gcloud: command not found` 가 나오면 새 터미널에서 PATH 가 잡힌다. Claude Code 를 다시 열게 한다.

**Node.js 20 이상**:

```bash
# macOS
brew install node
```

```bash
# Linux (nvm, 사용자 단위, sudo 불필요)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
. "$HOME/.nvm/nvm.sh" && nvm install --lts
```

Windows 는 https://nodejs.org/ 의 LTS 설치기를 쓴다.

### 2. state 가 Git 에 들어가지 않는지 확인

```bash
git check-ignore -v .knowanywhere/state.json
```

기대 출력: `.gitignore:1:.knowanywhere/	.knowanywhere/state.json` 처럼 `.gitignore` 의 `.knowanywhere/` 규칙을 가리키는 줄.
출력이 없으면 멈추고 사용자에게 알린다. `.knowanywhere/` 가 ignore 되기 전에는 state 파일을 만들지 않는다.

### 3. state 초기화

```bash
node .claude/skills/kna-status/state.mjs init
node .claude/skills/kna-status/state.mjs mode fresh
```

`join` 이면 `mode join` 을 쓴다. 도우미가 01~06, 11 을 `skipped` 로 표시한다.

## state에 쓸 것

답과 확인한 버전을 `set` 한 번에 쓴다(버전은 출력된 그대로, 앞의 `v` 는 뺀다. 빠진 선택 도구는 `null`).
`checked_at` 은 `date -u +%Y-%m-%dT%H:%M:%SZ` 의 출력이다.

```bash
node .claude/skills/kna-status/state.mjs set '{
  "language": "ko",
  "agent": { "name": "로제" },
  "domain": { "kind": "own" },
  "prereqs": { "gcloud": "560.0.0", "node": "22.11.0", "claude": "2.1.0", "git": "2.45.2",
               "checked_at": "2026-09-15T05:01:10Z" }
}'
```

`join` 모드에서는 `"domain": { "kind": null }` 로 쓰고 기존 위키를 추가한다.

```bash
node .claude/skills/kna-status/state.mjs set '{"wiki":{"host":"wiki.example.com","url":"https://wiki.example.com"}}'
```

도우미가 출력한 JSON 조각을 사용자에게 보여준다.

## 검증

```bash
node .claude/skills/kna-status/state.mjs status
```

기대 출력: `mode` 와 `agent` 가 채워져 있고 `00` 은 아직 `pending`. `join` 모드면 01~06 과 11 이 `skipped`.

`join` 모드에서는 위키가 HTTPS 로 답하는지도 확인한다.

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://wiki.example.com/
```

기대 출력: `200` 또는 `302`. 그 밖의 결과(connection refused, 인증서 오류, `000`)는 주소가 틀렸거나 위키가 내려간
것이다. 계속하기 전에 사용자와 원인을 찾는다.

확인이 끝나면 단계를 완료로 쓴다.

```bash
node .claude/skills/kna-status/state.mjs step 00 done
```

## 다음 단계

- `fresh`: `kna-01-gcp-account` (GCP 계정, 무료 크레딧, 프로젝트, 결제).
- `join`: `kna-07-mcp-connect` (이 머신의 Claude Code 를 기존 위키에 연결).

스킬 이름을 말하고 한 줄로 무엇을 하는지 설명한 뒤, 시작하기 전에 묻는다.
