---
name: kna-10-discord
description: knowanywhere 10단계에 쓴다(kna-09-persona 뒤, 선택 단계라 건너뛸 수 있다). 사용자가 같은 에이전트를 Discord 에서도 쓰고 싶을 때 Discord 애플리케이션과 봇을 만드는 클릭 경로를 안내하고, bridge/discord 를 레포 밖(이 머신 또는 위키 GCP VM)에 설치하고, .env 와 persona.md 를 만들고, launchd·systemd·pm2 서비스로 띄운 뒤 테스트 메시지로 스레드 답장을 확인한다.
---

# 10단계: Discord 봇 (선택)

사용자와는 사용자가 쓰는 언어로 대화한다. 명령, 경로, 변수명, 에러 메시지는 원문 그대로 둔다.
사람용 안내: `docs/steps/10-discord.md`. 브리지 자체 설명: `bridge/discord/README.md`.

## 목표

Discord 에서 봇에게 메시지를 보내면 봇이 그 메시지에 스레드를 만들고, 9단계와 같은 이름과 페르소나로 답하고, 같은
`<이름> Sessions` 콜렉션에 같은 서명으로 기록하는 상태. 봇은 브리지 프로세스(`bridge/discord`)가 이 머신이나 VM 에서
Claude Agent SDK 로 돌리는 Claude Code 에이전트다.

비용: Discord 는 무료다. 모델 사용은 브리지를 돌리는 사용자의 Claude 구독이나 API key 로 계산된다. VM 에서 돌리면 추가
VM 비용은 없지만 위키와 같은 e2-medium 의 메모리를 나눠 쓴다.

### 먼저 알릴 것 (보안)

기본 `PERMISSION_MODE=bypassPermissions` 에서 봇은 셸 명령을 **묻지 않고** 실행한다. 봇에게 말을 걸 수 있는 사람은 그
머신의 셸을 가진 것과 같다. 그래서:

- `ALLOWED_USER_IDS` 에 사용자 본인의 Discord id 만 넣는다. 비어 있으면 브리지가 시작하지 않는다.
- 봇은 사용자만 있는 서버에만 초대한다.
- VM 에서 돌리면 sudo 가 없는 전용 사용자 `kna-bot` 으로 돌리고, VM metadata 서버를 막는다. VM 의 서비스 계정
  `outline-vm` 은 프로젝트 역할이 없고 backups 버킷에 새 객체를 만드는 권한(`roles/storage.objectCreator`)만 있으므로
  (3·11단계), 봇이 metadata 서버에서 그 토큰을 받아도 DB 덤프를 읽거나 지우지는 못한다. 그래도 막는 것은 심층 방어다.
  막지 않으면 봇이 그 토큰으로 backups 버킷에 가짜 덤프를 올릴 수 있고, 나중에 누가 `outline-vm` 에 역할을 더하면 봇도
  그 권한을 그대로 얻는다. metadata 서버는 VM 설정(SSH 공개 키, 시작 스크립트 등)도 내준다.

## 필요한 state 키

```bash
H=.claude/skills/kna-status/state.mjs
node $H get mode
node $H get agent.name
node $H get language
node $H get steps.09
node $H get vm
node $H get gcp.project_id
node $H get mcp.server_name
node $H get wiki.host
ls -l .knowanywhere/block-values.json .knowanywhere/persona-lines.md
```

`steps.09` 가 `done` 이고 `.knowanywhere/block-values.json` 이 있어야 한다. 없으면 9단계를 먼저 한다(이 머신에서 9단계를
돌리지 않았다면 그 단계의 절차 1~2만 다시 해서 두 파일을 만든다). VM 에서 돌리는 선택지는 state 에 `vm.name`,
`vm.zone`, `gcp.project_id` 가 있을 때(fresh 모드)만 보인다. 아래 `kna-wiki-vm`, `P`, `Z` 는 그 값으로 바꿔 넣는다.

## 물을 것

한 번에 하나씩 묻는다.

1. **할지.** 2~3줄로 설명하고 묻는다. 건너뛰면 "state에 쓸 것"의 건너뛰기 명령을 쓰고 끝낸다.
2. **실행 위치.**
   - `desktop` 또는 이 머신: 늘 켜 둔 데스크탑이나 노트북. 7단계의 MCP 연결, 9단계의 `~/.claude/CLAUDE.md` 블록,
     Claude 로그인을 그대로 쓴다. 노트북은 잠자기에 들어가면 봇도 멈춘다. macOS 는 launchd, Linux 는 systemd, 둘 다
     pm2 도 된다.
   - `vm`: 위키 VM. 늘 켜져 있다. 전용 사용자 `kna-bot` 을 만들고, 그 사용자로 Node, Claude Code 로그인, 위키 MCP
     (브라우저가 없으므로 Outline API key)를 새로 설정한다. 메모리를 위키와 나눠 쓴다.
   - 기본 제안: 늘 켜 둔 데스크탑이 있으면 그쪽, 없으면 `vm`.
3. **봇 표시 이름.** Discord 애플리케이션 이름이자 봇 이름. 기본값은 `agent.name`. state 의 `discord.bot_name` 이 된다.
4. **에이전트 이름.** `.env` 의 `AGENT_NAME` 은 `agent.name` 과 **같게** 둔다. 같은 이름이라야 같은 콜렉션에 같은 서명으로
   쓴다. 다른 이름을 원하면 새 에이전트다(`kna-12-add-agent`). 특히 이 머신에서 돌리면서 이름을 바꾸면 봇이
   `~/.claude/CLAUDE.md` 블록의 이름과 페르소나 파일의 이름을 동시에 받아 혼란스러워진다.

Discord 채널 id 와 사용자 id 는 1의 포털 절차 뒤에 묻는다.

## 절차

### 1. Discord Developer Portal (사람)

사용자에게 이 순서대로 클릭하게 하고, 끝났다고 할 때까지 기다린다.

1. <https://discord.com/developers/applications> → **New Application** → 이름(3의 봇 표시 이름) → 약관 동의 → **Create**.
2. 왼쪽 **Bot** → **Privileged Gateway Intents** 의 **Message Content Intent** 를 켜고 **Save Changes**. 끄면 봇이 받는
   메시지 본문이 비어 있다.
3. 같은 **Bot** 화면의 **Reset Token** → 토큰이 한 번 보인다. **아직 아무 데도 붙여 넣지 않는다.** 4단계에서 사용자가
   `.env` 에 직접 넣는다. 잃어버리면 다시 Reset 하면 된다. 채팅에 붙여 넣지 말라고 분명히 말한다.
4. 왼쪽 **OAuth2** → **OAuth2 URL Generator**: Scopes 에서 `bot` 을 고르고, Bot Permissions 에서 **View Channels**,
   **Send Messages**, **Create Public Threads**, **Send Messages in Threads**, **Read Message History**, **Attach Files** 를
   고른다. 아래에 생긴 URL 을 연다. 또는 **General Information** 의 Application ID 로 바로 만든다:
   `https://discord.com/api/oauth2/authorize?client_id=<APPLICATION_ID>&scope=bot&permissions=309237746688`
5. 열린 화면에서 사용자 본인만 있는 서버를 고르고 **Authorize**. 서버가 없으면 Discord 앱에서 **+** (서버 추가) →
   **직접 만들기** 로 먼저 만든다. 봇 전용 채널(예: `#로제`)을 하나 만든다.
6. Discord **사용자 설정 → 고급 → 개발자 모드** 를 켠다. 봇 전용 채널을 우클릭 → **채널 ID 복사**, 내 프로필을
   우클릭 → **사용자 ID 복사**. 두 값(숫자 17~20자리, 비밀값이 아니다)을 채팅으로 받는다.

### 2. persona.md 렌더링 (이 머신)

9단계의 값으로 봇용 페르소나를 만든다. 동봉 템플릿(`persona.example.md`, 영어는 `persona.example.en.md`) + 9단계의
페르소나 줄 + 위키 규칙 요약(`wiki-rules.<lang>.md`) 순서다.

```bash
L=$(node .claude/skills/kna-status/state.mjs get language | tr -d '"')
if [ "$L" = en ]; then P=bridge/discord/persona.example.en.md; HD='### Persona'; else P=bridge/discord/persona.example.md; HD='### 페르소나'; fi
{ cat "$P"; printf '\n%s\n\n{{PERSONA}}\n\n' "$HD"; cat "bridge/discord/wiki-rules.$L.md"; } > .knowanywhere/bridge-persona.tpl.md
node .claude/skills/kna-09-persona/managed-block.mjs render --template .knowanywhere/bridge-persona.tpl.md --values .knowanywhere/block-values.json --out .knowanywhere/bridge-persona.md
```

기대: `렌더링함: .../.knowanywhere/bridge-persona.md (45줄)` 처럼 한 줄. HTML 주석은 브리지가 보낼 때 지우므로 남겨 둔다.
`cat .knowanywhere/bridge-persona.md` 로 전체를 보여준다. 이 글이 매 턴 프롬프트 앞에 붙는다고 알린다.

### 3a. 이 머신에 설치

레포 밖 `~/kna-bridge` 에 복사한다. 레포 안에서 돌리면 봇의 작업 디렉터리 위쪽에 이 레포의 `CLAUDE.md`(인스톨러 지침)가
있어서 봇이 그것을 따른다. 복사할 경로를 보여주고 yes 를 받는다.

```bash
rsync -a --exclude node_modules/ bridge/discord/ ~/kna-bridge/
cp .knowanywhere/bridge-persona.md ~/kna-bridge/persona.md
(cd ~/kna-bridge && npm ci --no-audit --no-fund && npm test 2>&1 | grep -E "통과|passed|FAIL")
```

기대: `4/4 통과`, `14/14 passed`, `5/5 passed`. 다시 설치할 때도 같은 명령을 쓴다. `rsync` 에 `--delete` 를 붙이지 않는다
(`.env`, `sessions.json`, `workspace/` 가 지워진다).

비밀이 아닌 설정을 `.env` 에 넣는다(값은 1과 3에서 받은 것).

```bash
(cd ~/kna-bridge && cp -n .env.example .env && chmod 600 .env)
node -e '
const fs = require("fs"); const f = process.argv[1]; let t = fs.readFileSync(f, "utf8");
for (const [k, v] of Object.entries(JSON.parse(process.argv[2]))) {
  const re = new RegExp(`^${k}=.*$`, "m");
  t = re.test(t) ? t.replace(re, () => `${k}=${v}`) : `${t}\n${k}=${v}\n`;
}
fs.writeFileSync(f, t); console.log("설정함:", Object.keys(JSON.parse(process.argv[2])).join(", "));
' ~/kna-bridge/.env '{"ALLOWED_USER_IDS":"123456789012345678","ALLOWED_CHANNEL_IDS":"234567890123456789","AGENT_NAME":"로제"}'
grep -E '^(ALLOWED_USER_IDS|ALLOWED_CHANNEL_IDS|AGENT_NAME|PERSONA_FILE|PERMISSION_MODE)=' ~/kna-bridge/.env
node -e 'console.log((require("fs").statSync(process.argv[1]).mode & 0o777).toString(8))' ~/kna-bridge/.env
```

기대: 다섯 줄이 보이고(`PERSONA_FILE=./persona.md`, `PERMISSION_MODE=bypassPermissions` 는 기본값), mode 가 `600`.

**토큰은 사용자가 직접 넣는다.** 사용자가 자기 터미널이나 편집기에서 `~/kna-bridge/.env` 를 열어 `DISCORD_TOKEN=` 뒤에
1-3의 토큰을 붙여 넣고 저장한다(예: `nano ~/kna-bridge/.env`, 저장은 Ctrl+O, Enter, 종료는 Ctrl+X). 끝났다고 하면
값을 출력하지 않고 채워졌는지만 본다.

```bash
grep -c '^DISCORD_TOKEN=..*' ~/kna-bridge/.env
```

기대: `1`. 인증과 MCP 는 이 머신의 것을 그대로 쓴다. 확인한다.

```bash
claude auth status --text
claude mcp list
```

기대: 로그인된 계정이 보이고, `mcp.server_name`(예: `outline`) 줄에 `Connected`. 브리지를 다른 OS 사용자로 돌리지 않는다.

그다음 3c 로 간다.

### 3b. VM 에 설치

모든 원격 명령은 `gcloud compute ssh kna-wiki-vm --project=P --zone=Z --command='...'` 로 돈다. 돈이 드는 명령은 없지만
VM 에 사용자를 만들고(`adduser kna-bot`), 패키지 저장소와 소프트웨어를 설치하고(NodeSource, `nodejs`), 방화벽 규칙
(iptables drop-in)을 넣는다. 그래서 각 명령을 **실행 전에 보여주고, 무엇이 바뀌는지 한 줄로 말하고, yes 를 받는다**
(00단계의 설치 명령과 같은 기준). VM 의 SSH 사용자는 비밀번호 없는 sudo 를 가지므로 이 명령들은 도구 호출로 실행해도
된다. 이 머신에서 sudo 비밀번호가 필요한 명령은 사용자가 자기 터미널에서 실행한다(3c).

**전용 사용자, Node 22, git:**

```bash
gcloud compute ssh kna-wiki-vm --project=P --zone=Z --command='
set -e
id kna-bot >/dev/null 2>&1 || sudo adduser --disabled-password --gecos "" kna-bot
command -v node >/dev/null || { curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs; }
node --version; command -v node
id kna-bot
sudo -l -U kna-bot || true'
```

기대: `v22.x`, `/usr/bin/node`, `kna-bot` 의 그룹에 `sudo`, `google-sudoers`, `docker` 가 없고, 마지막 줄이
`User kna-bot is not allowed to run sudo on kna-wiki-vm.` 이다. Debian 12 의 기본 `nodejs` 패키지는 18이라 NodeSource 를 쓴다.
`curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -` 는 내려받은 스크립트를 VM 에서 root 로 실행해 apt
저장소를 추가한다는 점을 yes 를 받기 전에 말한다.

**브리지 복사** (이 클론의 버전을 그대로 올린다):

```bash
tar -C bridge --exclude node_modules --exclude .env --exclude .env.second-agent --exclude 'sessions*.json' --exclude workspace --exclude logs -czf .knowanywhere/kna-bridge.tgz discord
gcloud compute scp .knowanywhere/kna-bridge.tgz .knowanywhere/bridge-persona.md kna-wiki-vm:/tmp/ --project=P --zone=Z
gcloud compute ssh kna-wiki-vm --project=P --zone=Z --command='
set -e
rm -rf /tmp/kna-bridge-src && mkdir /tmp/kna-bridge-src && tar -xzf /tmp/kna-bridge.tgz -C /tmp/kna-bridge-src
sudo mkdir -p /home/kna-bot/kna-bridge
sudo cp -a /tmp/kna-bridge-src/discord/. /home/kna-bot/kna-bridge/
sudo install -m 600 /tmp/bridge-persona.md /home/kna-bot/kna-bridge/persona.md
sudo chown -R kna-bot:kna-bot /home/kna-bot/kna-bridge
rm -rf /tmp/kna-bridge-src /tmp/kna-bridge.tgz /tmp/bridge-persona.md
sudo -iu kna-bot bash -c "cd ~/kna-bridge && npm ci --no-audit --no-fund && npm test 2>&1 | grep -E \"통과|passed|FAIL\""'
rm .knowanywhere/kna-bridge.tgz
```

기대: `4/4 통과`, `14/14 passed`, `5/5 passed`.

**비밀이 아닌 설정:**

```bash
gcloud compute ssh kna-wiki-vm --project=P --zone=Z --command='
set -e
F=/home/kna-bot/kna-bridge/.env
sudo -u kna-bot cp -n /home/kna-bot/kna-bridge/.env.example $F
sudo chmod 600 $F
sudo -u kna-bot sed -i -e "s/^ALLOWED_USER_IDS=.*/ALLOWED_USER_IDS=123456789012345678/" -e "s/^ALLOWED_CHANNEL_IDS=.*/ALLOWED_CHANNEL_IDS=234567890123456789/" -e "s/^AGENT_NAME=.*/AGENT_NAME=로제/" $F
sudo grep -E "^(ALLOWED_USER_IDS|ALLOWED_CHANNEL_IDS|AGENT_NAME|PERSONA_FILE|PERMISSION_MODE)=" $F
sudo stat -c "%a %U %n" $F'
```

기대: 다섯 줄과 `600 kna-bot /home/kna-bot/kna-bridge/.env`.

**Claude Code 설치:**

```bash
gcloud compute ssh kna-wiki-vm --project=P --zone=Z --command='sudo -iu kna-bot bash -c "curl -fsSL https://claude.ai/install.sh | bash && ~/.local/bin/claude --version"'
```

**사람이 VM 에서 할 일 세 가지.** 대화형이거나 비밀값을 다루므로 사용자가 **자기 터미널**에서 한다. 다음을 그대로 준다.

```bash
gcloud compute ssh kna-wiki-vm --project=P --zone=Z
sudo -iu kna-bot
```

1. 봇 토큰: `nano ~/kna-bridge/.env` → `DISCORD_TOKEN=` 뒤에 붙여 넣고 저장.
2. Claude 인증, 둘 중 하나.
   - 구독(권장): `~/.local/bin/claude auth login` → 출력된 URL 을 노트북 브라우저에서 열고 로그인 → 받은 코드를 VM
     터미널에 붙여 넣는다.
   - API key: `nano ~/kna-bridge/.env` 에서 `# ANTHROPIC_API_KEY=` 의 `#` 를 지우고 키를 붙여 넣는다. 구독이 아니라
     Anthropic Console 에서 토큰당 과금된다.
   알릴 것: 구독(OAuth) 인증에서는 system prompt 를 바꾸거나 `allowedTools` 에 MCP 도구를 넣으면 HTTP 529 가 났다. 그래서
   브리지는 페르소나를 매 턴 user prompt 앞에 붙인다. 사용자가 할 일은 없고, 봇 답이 가끔 늦거나 529 로 실패하면 이
   때문일 수 있다(`CLAUDE_FALLBACK_MODEL`, `CLAUDE_CODE_MAX_RETRIES` 가 완화한다).
3. 위키 MCP: 브라우저가 없으므로 Outline API key 로 등록한다(`kna-07-mcp-connect` 의 fallback 과 같다). 위키 Settings →
   **API & Access** → **New API key**, 이름 `discord-bot-vm`. 그다음 VM 의 `kna-bot` 셸에서 실행한다. 서버 이름은 state 의
   `mcp.server_name` 과 같아야 한다. 페르소나와 위키 규칙이 `mcp__<mcp.server_name>__*` 도구 이름을 가리키기 때문이다.
   아래 `<mcp.server_name>` 과 `wiki.example.com` 자리에 state 의 `mcp.server_name`(예: `outline`)과 `wiki.host` 값을
   넣은 명령을 만들어 사용자에게 준다. 사용자가 VM 에 그대로 붙여 넣는다.
   ```bash
   read -rs OUTLINE_KEY; echo
   ~/.local/bin/claude mcp add --transport http --scope user <mcp.server_name> https://wiki.example.com/mcp --header "Authorization: Bearer $OUTLINE_KEY"
   unset OUTLINE_KEY
   exit
   ```
   키는 `/home/kna-bot/.claude.json` 에 평문으로 저장된다. 봇이 그 파일을 읽을 수 있다는 뜻이므로 키 권한은 이 위키
   하나에만 쓰고, 문제가 생기면 위키 설정에서 키를 지운다.

끝났다고 하면 값을 출력하지 않고 확인한다.

```bash
gcloud compute ssh kna-wiki-vm --project=P --zone=Z --command='
sudo grep -c "^DISCORD_TOKEN=..*" /home/kna-bot/kna-bridge/.env
sudo -iu kna-bot bash -c "~/.local/bin/claude auth status --text; ~/.local/bin/claude mcp list; cd ~/kna-bridge && npm run smoke 2>&1 | grep -E \"result subtype|실패\""'
```

기대: `1`, 로그인 정보(API key 방식이면 `claude auth status` 는 로그인 안 됨으로 나와도 되고 smoke 가 기준이다),
`mcp.server_name`(예: `outline`) 줄에 `Connected`, `[smoke] result subtype=success is_error=false`.

**metadata 서버 막기.** 서비스가 시작할 때마다 `kna-bot` 의 `169.254.169.254` 접속을 거부하는 규칙을 넣는 drop-in 이다.
`outline-vm` 의 권한이 backups 버킷 쓰기 하나뿐이라도 봇이 VM 의 신원과 metadata 를 쓰지 못하게 하는 심층 방어다
(위 "먼저 알릴 것"). root 로 도는 iptables 규칙을 넣으므로 파일 내용을 보여주고 yes 를 받는다.

```bash
gcloud compute ssh kna-wiki-vm --project=P --zone=Z --command='
sudo mkdir -p /etc/systemd/system/knowanywhere-bridge.service.d
printf "%s\n" "[Service]" "ExecStartPre=+/bin/sh -c \"/usr/sbin/iptables -C OUTPUT -d 169.254.169.254 -m owner --uid-owner kna-bot -j REJECT 2>/dev/null || /usr/sbin/iptables -I OUTPUT -d 169.254.169.254 -m owner --uid-owner kna-bot -j REJECT\"" | sudo tee /etc/systemd/system/knowanywhere-bridge.service.d/block-metadata.conf'
```

`+` 접두사는 그 한 줄만 root 로 실행한다. 확인은 3c 에서 서비스를 띄운 뒤 한다.

### 3c. 서비스로 띄우기

실행 위치에 맞는 하나를 고른다. 설치할 파일 내용과 경로를 보여주고 yes 를 받는다.

**macOS (launchd):**

```bash
LABEL=com.$(id -un).knowanywhere-bridge
sed -e "s#/ABSOLUTE/PATH/TO/bridge/discord#$HOME/kna-bridge#g" -e "s#/ABSOLUTE/PATH/TO/node#$(command -v node)#g" \
    -e "s#/Users/YOUR_USER#$HOME#g" -e "s#com.example.knowanywhere-bridge#$LABEL#g" \
    bridge/discord/launchd/com.example.knowanywhere-bridge.plist > .knowanywhere/$LABEL.plist
plutil -lint .knowanywhere/$LABEL.plist && sed -n '/<plist/,$p' .knowanywhere/$LABEL.plist
```

yes 를 받은 뒤:

```bash
LABEL=com.$(id -un).knowanywhere-bridge
mkdir -p ~/kna-bridge/logs ~/Library/LaunchAgents
cp .knowanywhere/$LABEL.plist ~/Library/LaunchAgents/$LABEL.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/$LABEL.plist
sleep 5; launchctl print gui/$(id -u)/$LABEL | grep -E '^\s*(state|pid) ='
tail -n 20 ~/kna-bridge/logs/bridge.log ~/kna-bridge/logs/bridge.err.log
```

재시작은 `launchctl kickstart -k gui/$(id -u)/$LABEL`, 멈춤은 `launchctl bootout gui/$(id -u)/$LABEL`.

**Linux 데스크탑 (systemd):**

```bash
sed -e "s#/home/YOUR_USER/knowanywhere/bridge/discord#$HOME/kna-bridge#g" -e "s#/home/YOUR_USER#$HOME#g" -e "s#YOUR_USER#$(id -un)#g" \
    -e "s#^ExecStart=/usr/bin/node#ExecStart=$(command -v node)#" \
    bridge/discord/systemd/knowanywhere-bridge.service > .knowanywhere/knowanywhere-bridge.service
grep -v '^#' .knowanywhere/knowanywhere-bridge.service
```

yes 를 받은 뒤 이 두 줄은 사용자가 **Claude Code 밖의 자기 터미널**에서 이 레포 디렉터리(`pwd` 출력)로 `cd` 한 뒤
실행한다. `sudo` 가 비밀번호를 물으므로 TTY 가 필요한데, 이 세션의 도구 호출에는 TTY 가 없다.

```bash
sudo install -m 644 .knowanywhere/knowanywhere-bridge.service /etc/systemd/system/knowanywhere-bridge.service
sudo systemctl daemon-reload && sudo systemctl enable --now knowanywhere-bridge
```

사용자가 끝났다고 하면 `systemctl is-active knowanywhere-bridge` 로 확인한다(기대: `active`).

**VM (systemd):**

```bash
sed -e 's#/home/YOUR_USER/knowanywhere/bridge/discord#/home/kna-bot/kna-bridge#g' -e 's#YOUR_USER#kna-bot#g' \
    bridge/discord/systemd/knowanywhere-bridge.service > .knowanywhere/knowanywhere-bridge.service
grep -v '^#' .knowanywhere/knowanywhere-bridge.service
```

`ExecStart=/usr/bin/node src/index.js` 가 3b 의 `command -v node` 와 맞는지 본다. yes 를 받은 뒤:

```bash
gcloud compute scp .knowanywhere/knowanywhere-bridge.service kna-wiki-vm:/tmp/ --project=P --zone=Z
gcloud compute ssh kna-wiki-vm --project=P --zone=Z --command='
sudo install -m 644 /tmp/knowanywhere-bridge.service /etc/systemd/system/knowanywhere-bridge.service && rm /tmp/knowanywhere-bridge.service &&
sudo systemctl daemon-reload && sudo systemctl enable --now knowanywhere-bridge
sleep 5; systemctl is-active knowanywhere-bridge
sudo -u kna-bot curl -s -m 3 -o /dev/null -w "%{http_code}\n" -H "Metadata-Flavor: Google" http://169.254.169.254/computeMetadata/v1/instance/id || echo "kna-bot metadata exit=$?"
curl -s -m 3 -o /dev/null -w "%{http_code}\n" -H "Metadata-Flavor: Google" http://169.254.169.254/computeMetadata/v1/instance/id'
```

기대: `active`, `kna-bot` 쪽은 `000` 과 `kna-bot metadata exit=7`(연결 거부), 마지막 줄(로그인 사용자)은 `200`. `kna-bot` 쪽이 `200` 이면
drop-in 이 적용되지 않았다. `systemctl cat knowanywhere-bridge` 로 drop-in 이 붙었는지 본다.

**pm2 (어느 쪽이든 대안):** `npm install -g pm2`, `(cd ~/kna-bridge && pm2 start src/index.js --name knowanywhere-bridge --time)`.
`npm install -g` 는 전역 설치이므로 명령을 보여주고 yes 를 받는다. `EACCES` 로 실패하면 sudo 가 필요한 Node 설치이므로
사용자가 자기 터미널에서 실행한다. 부팅 때 시작하려면 `pm2 save && pm2 startup` 이 출력하는 명령(sudo 가 들어 있다)을
사용자가 자기 터미널에서 실행하고, 끝났다고 하면 `pm2 status knowanywhere-bridge` 로 확인한다.

### 4. 테스트 메시지 (사람)

사용자에게 봇 전용 채널에 이렇게 보내게 한다: "너의 이름을 말하고, 위키 콜렉션 목록을 보여줘."

기대: 봇이 그 메시지에 스레드를 만들고, 그 안에서 `agent.name` 으로 자기를 소개하고, `<이름> Sessions` 와 공유 콜렉션이
들어 있는 목록으로 답한다. 목록이 나오면 봇이 위키 MCP 에 닿는 것이다. 이어서 같은 스레드에 "방금 뭐라고 했지?" 를
보내면 앞 대화를 기억해야 한다(세션 resume).

## 검증

서비스 상태와 로그를 보여준다.

| 위치 | 상태 | 로그 |
|---|---|---|
| macOS | `launchctl print gui/$(id -u)/com.$(id -un).knowanywhere-bridge \| grep -E '^\s*(state\|pid) ='` | `tail -n 30 ~/kna-bridge/logs/bridge.log` |
| Linux 데스크탑 | `systemctl is-active knowanywhere-bridge` | `journalctl -u knowanywhere-bridge -n 30 --no-pager` |
| VM | `gcloud compute ssh kna-wiki-vm --project=P --zone=Z --command='systemctl is-active knowanywhere-bridge; sudo journalctl -u knowanywhere-bridge -n 30 --no-pager'` | 같은 명령 |
| pm2 | `pm2 status knowanywhere-bridge` | `pm2 logs knowanywhere-bridge --lines 30 --nostream` |

기대 로그(순서대로):

```
[bot] 로그인: 로제#1234 (345678901234567890)
[bot] agent: 로제 / backend: claude
[bot] persona: /home/kna-bot/kna-bridge/persona.md (1894자)
[bot] 허용 사용자: 123456789012345678
[recv] 2026-09-15T10:02:11.000Z #로제 사용자이름: 너의 이름을 말하고, 위키 콜렉션 목록을 보여줘. → handled
[job] 456789012345678901 완료 subtype=success turns=3 cost=0.0421 (18234ms)
```

기준: 상태가 `running`/`active`/`online`, `persona:` 줄이 동봉 `persona.example.md` 가 아니라 설치한 `persona.md` 를 가리키고,
4의 스레드 답장이 왔다. 셋 다 맞을 때만 `done`.

| 증상 | 원인과 조치 |
|---|---|
| `DISCORD_TOKEN 이 비어 있다` | `.env` 저장이 안 됐다. `grep -c '^DISCORD_TOKEN=..*'` 가 `1` 인지 |
| `ALLOWED_USER_IDS 가 비어 있다` | 3a/3b 의 설정 명령을 다시 |
| `Discord 로그인 실패` | 토큰이 틀렸거나 Reset 뒤 옛 토큰이다. 포털에서 Reset Token 후 다시 넣는다 |
| 봇이 온라인인데 답이 없다 | Message Content Intent 가 꺼졌거나, 채널 id 가 `ALLOWED_CHANNEL_IDS` 와 다르다. 멘션해서 보내 본다. 로그의 `[recv] ... → no-trigger` / `denied` 를 본다 |
| 스레드 대신 채널에 답한다 | 봇에 Create Public Threads 권한이 없다. 초대 URL 을 다시 연다 |
| `[job] 실패` 와 `401`/인증 에러 | 브리지 사용자로 `claude auth status --text`. VM 이면 `kna-bot` 으로 다시 로그인 |
| 콜렉션 목록 대신 위키에 닿지 못했다고 답한다 | 브리지 사용자로 `claude mcp list`. VM 이면 3b 의 MCP 등록을 다시 |
| `persona:` 가 `persona.example.md` 를 가리킨다 | `~/kna-bridge/persona.md` 가 없다. 2의 결과를 다시 복사하고 재시작 |
| 529 `overloaded_error` 가 잦다 | 구독 인증의 알려진 제약이다. `CLAUDE_FALLBACK_MODEL` 을 두고, 계속되면 API key 인증을 고려한다 |

## state에 쓸 것

설치했을 때(`host` 는 `vm` 또는 이 머신의 이름):

```bash
H=.claude/skills/kna-status/state.mjs
node $H set '{"discord":{"enabled":true,"bot_name":"로제","host":"vm"}}'
node $H step 10 done
```

VM 에서 돌리면 그 머신도 이 에이전트가 도는 곳이므로 `agents[]` 에 더한다:

```bash
node .claude/skills/kna-status/state.mjs agent-add '{"name":"로제","machine":"kna-wiki-vm","kind":"claude","sessions_collection":"로제 Sessions"}'
```

건너뛸 때:

```bash
node .claude/skills/kna-status/state.mjs set '{"discord":{"enabled":false,"bot_name":null,"host":null}}'
node .claude/skills/kna-status/state.mjs step 10 skipped
```

토큰, API key, 그 끝자리, Discord id 는 state 에 쓰지 않는다(id 는 비밀값은 아니지만 이 머신의 `.env` 에 이미 있다).
도우미가 출력한 JSON 조각을 보여준다.

## 다음 단계

`node .claude/skills/kna-status/state.mjs next`:

- fresh: `11 kna-11-backups` (매일 디스크 스냅샷과 매일 밤 DB 덤프).
- join: `complete`. 설치가 끝났다. 다른 머신이나 에이전트는 `kna-12-add-agent`.

시작 전에 묻는다.
