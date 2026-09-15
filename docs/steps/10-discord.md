# 10단계: Discord 봇 (선택)

스킬: `kna-10-discord`. `fresh` 와 `join` 모드 모두에서 선택이다. 건너뛰면 `skipped` 로 기록한다.

이 단계를 마치면 Discord 에서 봇에게 말을 걸 수 있다. 봇은 9단계와 같은 이름과 페르소나를 쓰는 Claude Code 에이전트이고,
같은 `<이름> Sessions` 콜렉션에 같은 서명으로 기록한다. 휴대폰에서 일을 맡기고, 결과를 나중에 노트북에서 위키로 이어
보는 용도다. 브리지 코드와 자세한 설명은 [`bridge/discord/README.md`](../../bridge/discord/README.md) 에 있다.

## 어떻게 도는가

- Discord 메시지 1개가 스레드 1개가 되고, 스레드 1개가 에이전트 세션 1개다. 같은 스레드에 이어 쓰면 대화가 이어진다.
- 브리지는 Claude Agent SDK 로 에이전트를 돌린다. 모델 사용은 브리지를 돌리는 사용자의 Claude 구독이나 API key 로 계산된다.
- 페르소나 파일은 동봉 템플릿 + 9단계 페르소나 + 위키 규칙 요약(`bridge/discord/wiki-rules.ko.md`)으로 만든다. 구독 인증에서
  system prompt 를 바꾸면 HTTP 529 가 나서, 브리지는 이 글을 매 턴 user prompt 앞에 붙인다.
- 에이전트 이름(`AGENT_NAME`)은 9단계의 이름과 같게 둔다. 그래야 같은 에이전트다.

## 보안

기본 설정에서 봇은 셸 명령을 묻지 않고 실행한다. 봇에게 말을 걸 수 있는 사람은 그 머신의 셸을 가진 것과 같다.

- `.env` 의 `ALLOWED_USER_IDS` 에 내 Discord id 만 넣는다. 비어 있으면 브리지가 시작하지 않는다.
- 봇은 나만 있는 서버에만 초대한다.
- VM 에서 돌리면 sudo 가 없는 전용 사용자 `kna-bot` 으로 돌리고 metadata 서버를 막는다. VM 의 서비스 계정 `outline-vm`
  은 프로젝트 역할이 없고 backups 버킷에 새 덤프를 올리는 권한만 있으므로(3·11단계) 봇이 그 토큰으로 덤프를 읽거나
  지우지는 못한다. 그래도 가짜 덤프를 올리거나 나중에 그 계정에 더해진 권한을 얻을 수 있으므로 심층 방어로 막는다.
- 봇 토큰은 내가 직접 `.env` 에 입력한다. 채팅, 이슈, 위키에 붙여 넣지 않는다.

## 어디서 돌리나

| 위치 | 좋은 점 | 신경 쓸 점 |
|---|---|---|
| 늘 켜 둔 데스크탑, 또는 노트북 | 7단계 MCP 연결, 9단계 블록, Claude 로그인을 그대로 쓴다 | 노트북은 잠자기에 들어가면 봇도 멈춘다 |
| 위키 VM (`fresh` 만) | 늘 켜져 있다. 추가 VM 비용 없음 | 전용 사용자로 Node, Claude 로그인, 위키 MCP(API key)를 새로 설정한다. 위키와 메모리를 나눠 쓴다 |

어느 쪽이든 브리지는 레포 밖 `~/kna-bridge` 에 복사해서 돌린다. 레포 안에서 돌리면 봇이 레포의 `CLAUDE.md`(인스톨러
지침)를 읽는다.

## 1. Discord 쪽 (사람)

1. <https://discord.com/developers/applications> → **New Application** → 이름 → **Create**.
2. **Bot** → **Message Content Intent** 켜기 → **Save Changes**.
3. **Bot** → **Reset Token**. 토큰은 3의 `.env` 에 바로 넣는다.
4. **OAuth2** → **OAuth2 URL Generator** → scope `bot`, 권한 View Channels, Send Messages, Create Public Threads, Send Messages
   in Threads, Read Message History, Attach Files. 또는 바로
   `https://discord.com/api/oauth2/authorize?client_id=<APPLICATION_ID>&scope=bot&permissions=309237746688`
5. 나만 있는 서버를 골라 **Authorize**. 봇 전용 채널을 하나 만든다.
6. **사용자 설정 → 고급 → 개발자 모드** 를 켜고, 채널과 내 프로필을 우클릭해 **ID 복사**. 이 두 숫자는 비밀값이 아니다.

## 2. 설치

이 머신이면:

```bash
rsync -a --exclude node_modules/ bridge/discord/ ~/kna-bridge/
cp .knowanywhere/bridge-persona.md ~/kna-bridge/persona.md
(cd ~/kna-bridge && npm ci && npm test)          # 4/4 통과, 14/14 passed, 5/5 passed
(cd ~/kna-bridge && cp -n .env.example .env && chmod 600 .env)
```

인스톨러가 `.env` 에 `ALLOWED_USER_IDS`, `ALLOWED_CHANNEL_IDS`, `AGENT_NAME` 을 넣는다. `DISCORD_TOKEN` 은 내가 편집기로
직접 넣는다(`nano ~/kna-bridge/.env`).

VM 이면 인스톨러가 `gcloud compute ssh` 로 `kna-bot` 사용자, Node 22, 브리지 복사, `.env` 의 비밀이 아닌 값, Claude Code
설치까지 한다. 그다음 내가 VM 에 들어가 세 가지를 한다.

```bash
gcloud compute ssh kna-wiki-vm --project=P --zone=Z
sudo -iu kna-bot
nano ~/kna-bridge/.env                     # DISCORD_TOKEN
~/.local/bin/claude auth login             # 구독 로그인. URL 을 노트북 브라우저에서 연다
read -rs OUTLINE_KEY; echo                 # 위키 Settings → API & Access 에서 만든 키
~/.local/bin/claude mcp add --transport http --scope user <mcp.server_name> https://wiki.example.com/mcp --header "Authorization: Bearer $OUTLINE_KEY"
unset OUTLINE_KEY
```

`<mcp.server_name>` 자리에는 7단계에서 정한 MCP 서버 이름(state 의 `mcp.server_name`, 기본 `outline`)을, `wiki.example.com`
자리에는 내 위키 호스트를 넣는다. 인스톨러가 값을 채운 명령을 준다. 이름이 7단계와 같아야 봇의 위키 규칙이 가리키는
도구 이름과 맞는다.

구독 대신 API key 를 쓰려면 `claude auth login` 대신 `.env` 의 `ANTHROPIC_API_KEY` 를 채운다. Anthropic Console 에서 토큰당
과금된다.

## 3. 서비스

| 위치 | 방식 | 템플릿 |
|---|---|---|
| macOS | launchd LaunchAgent | `bridge/discord/launchd/com.example.knowanywhere-bridge.plist` |
| Linux 데스크탑, VM | systemd | `bridge/discord/systemd/knowanywhere-bridge.service` |
| 어디든 | pm2 | `pm2 start src/index.js --name knowanywhere-bridge --time` |

인스톨러가 템플릿의 경로와 사용자를 채운 파일을 보여주고, yes 를 받은 뒤 설치한다. VM 에는 `kna-bot` 의 metadata 서버
접속을 막는 drop-in 도 넣는다. Linux 데스크탑에서는 `sudo` 가 비밀번호를 물으므로, `/etc/systemd/system/` 에 설치하는
두 줄은 내가 Claude Code 밖의 내 터미널에서 실행하고 끝났다고 알린다. 인스톨러가 `systemctl is-active` 로 확인한다.

## 4. 확인

봇 전용 채널에 "너의 이름을 말하고, 위키 콜렉션 목록을 보여줘." 를 보낸다. 봇이 스레드를 만들고 그 안에서 이름과 콜렉션
목록으로 답하면 Discord, 에이전트, 위키 MCP 가 모두 이어진 것이다.

```bash
# macOS
launchctl print gui/$(id -u)/com.$(id -un).knowanywhere-bridge | grep -E '^\s*(state|pid) ='
tail -n 30 ~/kna-bridge/logs/bridge.log
# Linux, VM (VM 은 gcloud compute ssh ... --command 로)
systemctl is-active knowanywhere-bridge
sudo journalctl -u knowanywhere-bridge -n 30 --no-pager
```

로그에 `[bot] 로그인: ...`, `[bot] agent: 로제 / backend: claude`, `[bot] persona: .../kna-bridge/persona.md (...자)`,
`[recv] ... → handled`, `[job] ... 완료 subtype=success` 가 보여야 한다. VM 이면 `kna-bot` 으로 metadata 서버에 접속했을 때
`000` 이 나와야 한다.

## 쓰는 것

```bash
node .claude/skills/kna-status/state.mjs set '{"discord":{"enabled":true,"bot_name":"로제","host":"vm"}}'
node .claude/skills/kna-status/state.mjs step 10 done
```

VM 에서 돌리면 `agents[]` 에 `{"name":"로제","machine":"kna-wiki-vm","kind":"claude","sessions_collection":"로제 Sessions"}` 도
더한다. 건너뛰면 `discord.enabled` 를 `false` 로, `step 10 skipped` 로 쓴다. 토큰과 Discord id 는 state 에 쓰지 않는다.

## 다음

- `fresh`: [11단계: 백업](11-backups.md)
- `join`: 설치가 끝났다. 머신이나 에이전트를 더 붙이려면 [12단계](12-add-agent.md).
