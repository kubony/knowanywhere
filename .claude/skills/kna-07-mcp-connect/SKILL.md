---
name: kna-07-mcp-connect
description: knowanywhere 7단계에 쓴다(fresh 모드는 kna-06-outline-deploy 뒤, join 모드는 kna-00-start 뒤, kna-12-add-agent가 다른 머신에서 다시 부를 때도). 위키의 내장 MCP 서버 `https://<wiki.host>/mcp` 를 이 머신의 Claude Code에 user scope로 등록하고 `/mcp` 에서 OAuth 로그인하게 한 뒤 `list_collections` 로 검증한다. OAuth가 안 되면 Outline API key로 등록하는 fallback을 안내한다.
---

# 07단계: MCP 연결

사용자와는 사용자가 쓰는 언어로 대화한다. 명령, 경로, 도구 이름, 에러 메시지는 원문 그대로 둔다.
사람용 안내: `docs/steps/07-mcp-connect.md`.

## 목표

이 머신의 Claude Code가 어느 디렉터리에서 열리든 위키 도구(`list_collections`, `list_documents`,
`create_document`, `update_document` 등)를 쓸 수 있는 상태. Outline(v1.10 기준)은 `/mcp` 에 MCP 서버를 내장하고
OAuth(동적 client 등록 포함)로 인증한다. 토큰은 Claude Code가 자기 저장소에 두고, 이 레포와 state에는 남지 않는다.

## 필요한 state 키

```bash
node .claude/skills/kna-status/state.mjs get wiki.url
node .claude/skills/kna-status/state.mjs get mode
```

fresh 모드는 `steps.06` 이 `done` 이어야 한다. join 모드는 `kna-00-start` 가 `wiki.url` 을 썼어야 한다.
아래 `wiki.example.com` 은 `wiki.url` 의 호스트로 바꿔 넣는다.

## 물을 것

1. **MCP 서버 이름.** 기본 `outline`. 먼저 기존 등록을 본다:
   ```bash
   claude mcp list
   ```
   `outline` 이 이미 있고 다른 주소를 가리키면 덮지 않는다. `kna-wiki` 같은 다른 이름을 제안한다.
   같은 주소로 이미 연결돼 있으면 등록을 건너뛰고 검증으로 간다.
2. **전역 설정 수정 동의.** `--scope user` 등록은 `~/.claude.json` 을 고친다. 아래 3의 명령을 그대로 보여주고
   yes를 받는다.

## 절차

### 1. 서버 쪽 MCP가 켜져 있는지

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://wiki.example.com/.well-known/oauth-protected-resource/mcp
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://wiki.example.com/mcp
```

기대: `200` 과 `401`. 첫 줄이 `404` 면 워크스페이스의 MCP가 꺼져 있다. 관리자가 Settings → **AI**
(`/settings/features`) → **MCP server** 를 켜게 한다. 둘 다 `000` 이면 위키가 내려가 있거나 주소가 틀렸다.

### 2. 등록 (yes 받은 뒤)

```bash
claude mcp add --transport http --scope user outline https://wiki.example.com/mcp
claude mcp get outline
```

기대: `Scope: User config`, `Type: http`, URL이 `https://wiki.example.com/mcp`.

### 3. OAuth 로그인 (사람)

사용자에게 이 Claude Code 입력창에 `/mcp` 를 치게 한다. 목록에서 `outline` 을 고르고 **Authenticate** 를 누르면
브라우저가 위키의 승인 화면을 연다. 위키에 로그인돼 있지 않으면 **Continue with Google** 로 먼저 로그인하고,
권한 요청(read, write)을 허용한다. 브라우저에 완료 메시지가 뜨면 Claude Code로 돌아온다. `/mcp` 에서 `outline`
이 connected로 보여야 한다.

`/mcp` 목록에 `outline` 이 없으면 이 세션이 등록 전에 시작된 것이다. `/exit` 로 나가 이 레포에서 `claude` 를
다시 실행하게 한다. state가 있으니 7단계 검증부터 이어서 한다.

머신마다 따로 로그인한다. 같은 사람이 노트북과 데스크탑에서 쓰면 두 번 한다.

### 4. OAuth가 안 될 때: API key fallback

브라우저 승인 화면이 에러로 끝나거나, 브라우저를 열 수 없는 머신(SSH로 들어간 서버)이면 API key를 쓴다.

1. 위키 Settings → **API & Access** (`/settings/api-and-access`) → **New API key**. 이름은 `claude-<머신>`,
   만료는 사용자가 정한다. 키는 만든 직후 한 번만 보인다.
2. 사용자가 **Claude Code 밖의 자기 터미널**에서 실행한다. 키를 채팅에 붙여넣지 않게 하고, 셸 히스토리에도 남지
   않게 숨김 입력으로 받는다:
   ```bash
   read -rs OUTLINE_KEY; echo
   curl -s -X POST https://wiki.example.com/api/collections.list -H "Authorization: Bearer $OUTLINE_KEY" -H 'Content-Type: application/json' -d '{}' | node -e 'let s="";process.stdin.on("data",(d)=>(s+=d)).on("end",()=>{const j=JSON.parse(s);if(!j.ok)return console.log("ERROR",j.status,j.error);console.log((j.data||[]).map((c)=>c.name).join("\n")||"(no collections)")})'
   claude mcp add --transport http --scope user outline https://wiki.example.com/mcp --header "Authorization: Bearer $OUTLINE_KEY"
   unset OUTLINE_KEY
   ```
3. 알릴 것: 키는 `~/.claude.json` 의 이 서버 설정에 평문으로 저장된다. 그 파일을 공유하거나 커밋하지 않는다.
   키를 폐기하려면 같은 설정 화면에서 삭제하고 `claude mcp remove outline --scope user` 후 다시 등록한다.

`curl` 결과가 `ERROR 401 authentication_required` 면 키를 잘못 붙여넣은 것이다. 콜렉션 이름(새 워크스페이스는
비어 있거나 `Welcome` 하나)이 나오면 키가 맞다.

## 검증

MCP 도구 `list_collections` 를 호출한다(Claude Code에서의 이름은 `mcp__outline__list_collections`, 서버
이름을 바꿨으면 그 이름). 결과의 콜렉션 이름 목록을 사용자에게 보여준다. 새 워크스페이스라면 비어 있거나
기본 콜렉션 하나다. 에러 없이 목록이 돌아오는 것이 기준이다.

| 증상 | 원인과 조치 |
|---|---|
| 도구가 없다 | 세션 재시작 전이다. 위 3의 재시작 안내 |
| `401` / needs authentication | `/mcp` 에서 다시 Authenticate. API key 방식이면 키 만료나 삭제 |
| `MCP is disabled` 류의 에러 | 1의 Settings → AI → MCP server |
| 브라우저 승인 후에도 연결 안 됨 | `claude mcp get outline` 의 URL이 `/mcp` 로 끝나는지, `https` 인지 확인. 두 번 실패하면 4의 fallback |

## state에 쓸 것

```bash
node .claude/skills/kna-status/state.mjs set '{"mcp":{"server_name":"outline","verified_at":"2026-09-15T08:30:00Z"}}'
node .claude/skills/kna-status/state.mjs step 07 done
```

`verified_at` 은 `list_collections` 가 성공한 시각(UTC)이다. 토큰, API key, 그 끝자리도 state에 쓰지 않는다.
helper가 출력한 JSON 조각을 보여준다.

## 다음 단계

`kna-08-collections`: 이 에이전트의 `<Agent> Sessions` 콜렉션과 공유 콜렉션 `공유 지식`(영어 템플릿이면
`Shared Knowledge`)을 만들고 규칙을 설명에 넣는다. 시작 전에 묻는다.

### Codex 메모 (phase 2, 이 단계에서 실행하지 않는다)

Codex CLI도 같은 서버를 쓸 수 있다. 참고용으로만 알려준다(이 레포는 v1에서 Codex 설치를 검증하지 않는다):
`codex mcp add outline --url https://wiki.example.com/mcp` 후 `codex mcp login outline`. 규칙 파일은
`templates/codex-agents-md.<lang>.md` 에 있다.
