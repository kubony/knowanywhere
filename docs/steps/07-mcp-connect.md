# 07단계: MCP 연결

스킬: `kna-07-mcp-connect`. `fresh` 와 `join` 모드 모두. 에이전트나 머신을 더 붙일 때(`kna-12-add-agent`)도 다시 돈다.

MCP(Model Context Protocol)는 AI 에이전트가 외부 도구를 쓰는 표준 방식이다. Outline 은 `https://<위키 주소>/mcp` 에
MCP 서버를 내장하고 있다. 이 단계에서 이 머신의 Claude Code 를 그 서버에 연결하면, 어느 폴더에서 Claude Code 를 열든
에이전트가 위키 도구(`list_collections`, `list_documents`, `create_document`, `update_document` 등)를 쓸 수 있다.

돈은 들지 않는다. 대신 전역 Claude Code 설정 파일 `~/.claude.json` 이 바뀌므로 인스톨러가 명령을 보여주고 먼저 묻는다.
로그인 토큰은 Claude Code 가 자기 저장소에 두고, 이 레포와 state 파일에는 남지 않는다.

## 1. 위키 쪽 MCP 가 켜져 있는지

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://wiki.example.com/.well-known/oauth-protected-resource/mcp
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://wiki.example.com/mcp
```

| 결과 | 뜻 |
|---|---|
| `200` 과 `401` | 정상. MCP 서버가 켜져 있고 로그인을 기다린다 |
| 첫 줄이 `404` | 워크스페이스의 MCP 가 꺼져 있다. 관리자가 위키 **Settings**(설정) > **AI** (`/settings/features`) > **MCP server**(MCP 서버)를 켠다 |
| 둘 다 `000` | 위키가 내려가 있거나 주소가 틀렸다 |

## 2. 등록

이미 등록된 서버가 있는지 먼저 본다.

```bash
claude mcp list
```

`outline` 이라는 이름이 이미 있고 다른 주소를 가리키면 덮지 않고 `kna-wiki` 같은 다른 이름을 쓴다. 같은 주소로 이미
연결돼 있으면 등록을 건너뛴다.

```bash
claude mcp add --transport http --scope user outline https://wiki.example.com/mcp
claude mcp get outline
```

`--scope user` 는 이 머신의 모든 폴더에서 이 서버를 쓰게 한다. `claude mcp get` 출력에 `Scope: User config`,
`Type: http`, URL `https://wiki.example.com/mcp` 가 보여야 한다.

## 3. 로그인 (브라우저)

1. Claude Code 입력창에 `/mcp` 를 친다.
2. 목록에서 `outline` 을 고르고 **Authenticate** 를 누른다. 브라우저가 위키의 승인 화면을 연다.
3. 위키에 로그인돼 있지 않으면 **Continue with Google** 로 먼저 로그인한다.
4. 권한 요청(read, write)을 허용한다. 브라우저에 완료 메시지가 뜨면 Claude Code 로 돌아온다.
5. `/mcp` 목록에서 `outline` 이 connected 로 보이면 된다.

`/mcp` 목록에 `outline` 이 없으면 지금 Claude Code 세션이 등록 전에 시작된 것이다. `/exit` 로 나가 이 레포에서
`claude` 를 다시 실행한다. 인스톨러는 state 파일을 읽고 7단계 확인부터 이어서 한다.

로그인은 머신마다 따로 한다. 노트북과 데스크탑에서 쓰면 두 번 한다.

## 브라우저 로그인이 안 될 때: API key

승인 화면이 에러로 끝나거나, 브라우저를 열 수 없는 머신(SSH 로 들어간 서버)이면 API key 로 등록한다.

1. 위키 **Settings**(설정) > **API & Access**(API 액세스) (`/settings/api-and-access`) > **New API key**(새 API 키).
   이름은 `claude-<머신 이름>`, 만료는 내가 정한다. 키는 만든 직후 한 번만 보인다.
2. **Claude Code 밖의 내 터미널**에서 실행한다. 키는 채팅에 붙여 넣지 않는다. `read -rs` 는 화면에 보이지 않게 받고
   셸 히스토리에도 남기지 않는다.
   ```bash
   read -rs OUTLINE_KEY; echo
   curl -s -X POST https://wiki.example.com/api/collections.list -H "Authorization: Bearer $OUTLINE_KEY" -H 'Content-Type: application/json' -d '{}' | node -e 'let s="";process.stdin.on("data",(d)=>(s+=d)).on("end",()=>{const j=JSON.parse(s);if(!j.ok)return console.log("ERROR",j.status,j.error);console.log((j.data||[]).map((c)=>c.name).join("\n")||"(no collections)")})'
   claude mcp add --transport http --scope user outline https://wiki.example.com/mcp --header "Authorization: Bearer $OUTLINE_KEY"
   unset OUTLINE_KEY
   ```
3. `curl` 이 콜렉션 이름(새 워크스페이스면 비어 있거나 `Welcome` 하나)을 출력하면 키가 맞다.
   `ERROR 401 authentication_required` 면 키를 잘못 붙여 넣었다.

이 방식에서는 키가 `~/.claude.json` 의 서버 설정에 평문으로 저장된다. 그 파일을 공유하거나 커밋하지 않는다. 키를 폐기하려면
같은 설정 화면에서 지우고 `claude mcp remove outline --scope user` 후 다시 등록한다.

## 확인

인스톨러가 MCP 도구 `list_collections`(Claude Code 안의 이름은 `mcp__outline__list_collections`)를 부르고 콜렉션 이름
목록을 보여준다. 새 워크스페이스라면 비어 있거나 기본 콜렉션 하나다. 에러 없이 목록이 돌아오면 된다.

| 증상 | 원인 | 고치는 법 |
|---|---|---|
| 도구가 없다 | 세션을 다시 시작하지 않았다 | 3의 재시작 |
| `401`, needs authentication | 로그인이 풀렸다. API key 방식이면 키 만료나 삭제 | `/mcp` 에서 다시 **Authenticate** |
| MCP 가 꺼져 있다는 에러 | 워크스페이스 설정 | 1의 **Settings** > **AI** > **MCP server** |
| 승인 후에도 연결 안 됨 | 주소 문제 | `claude mcp get outline` 의 URL 이 `https` 이고 `/mcp` 로 끝나는지 본다. 두 번 실패하면 API key 방식 |

## 기록되는 것

```bash
node .claude/skills/kna-status/state.mjs set '{"mcp":{"server_name":"outline","verified_at":"2026-09-15T08:30:00Z"}}'
node .claude/skills/kna-status/state.mjs step 07 done
```

토큰, API key, 그 끝자리도 state 에 쓰지 않는다.

## Codex 에서 쓰려면 (phase 2)

Codex CLI 도 같은 서버에 붙을 수 있다: `codex mcp add outline --url https://wiki.example.com/mcp` 후
`codex mcp login outline`. 규칙 파일은 `templates/codex-agents-md.<언어>.md` 에 있다. v1 인스톨러는 Codex 설치를
검증하지 않는다.

## 다음

[08단계: 콜렉션과 규칙](08-collections.md)
