---
name: kna-status
description: 사용자가 /kna-status 를 입력하거나 "어디까지 했지", "뭐가 남았어", "설치 얼마나 됐어" 라고 물을 때, 또는 이 레포에서 세션을 재개하며 진행 상황을 보여줘야 할 때 쓴다. .knowanywhere/state.json 을 읽어 단계별 상태와 시각, 다음 단계를 사용자 언어로 표로 보여준다. 읽기 전용이다.
---

# kna-status: 인스톨러 진행 상황 보기

사용자가 쓰는 언어로 말한다. 명령, 스킬 이름, 키 이름은 원문 그대로 둔다.

## 목표

knowanywhere 단계 중 무엇이 done, skipped, pending 인지, 각각 언제 바뀌었는지, 다음에 어떤 스킬을 돌릴지 표 하나로
보여준다. 이 스킬은 읽기 전용이며 state 를 바꾸지 않는다.

## 필요한 state 키

`mode`, `agent.name`, `language`, `wiki.url` 또는 `wiki.host`, `steps.<id>.status`, `steps.<id>.at`. 없는 키는 `-` 로 표시한다.

## 실행

1. 데이터를 가져온다. 도우미를 먼저 쓴다(모드 규칙을 대신 적용해 준다).

   ```bash
   node .claude/skills/kna-status/state.mjs status --json
   ```

   Node 가 아직 없거나 명령이 실패하면 파일을 직접 읽는다.

   ```bash
   cat .knowanywhere/state.json 2>/dev/null || echo "NO_STATE"
   ```

   이 경우 "다음 단계"는 직접 계산한다. 00, 01, ..., 11 순서에서 `steps.<id>.status` 가 `pending` 인 첫 단계이고,
   `mode` 가 `join` 이면 01~06 과 11 은 건너뛴다. 12는 "다음 단계"가 되지 않는다.

2. state 파일이 없으면 첫 실행이라고 말한다. 이 레포는 아직 아무것도 설치하지 않았고 다음 단계는 `kna-00-start` 다.
   여기서 멈춘다.

3. 있으면 머리 줄 하나와 표 하나를 보여준다. 열 제목과 상태 단어는 사용자 언어로 옮기고, 단계 id 와 스킬 이름은
   그대로 둔다.

   머리 줄: 모드(`fresh` 또는 `join`), 에이전트 이름, 알면 위키 주소(`wiki.url`, 없으면 `wiki.host`).

   | 단계 | 스킬 | 상태 | 시각 |
   |---|---|---|---|
   | 00 | kna-00-start | ✅ 완료 | 2026-09-15 14:01 |
   | 01 | kna-01-gcp-account | ✅ 완료 | 2026-09-15 14:30 |
   | 02 | kna-02-budget | 건너뜀 | 2026-09-15 14:31 |
   | 03 | kna-03-vm | 대기 | - |
   | ... | | | |
   | 12 | kna-12-add-agent | 요청 시 | - |

   - `done` 은 ✅ 완료, `skipped` 는 건너뜀(`join` 모드의 01~06, 11 은 "join 모드에서 쓰지 않음"), `pending` 은 대기.
     12가 pending 이면 "요청 시"로 쓴다.
   - `at` 은 UTC 다. 이 머신의 시간대(`date +%Z`)로 바꿔 보여주고, `null` 이면 `-` 로 쓴다.

4. 다음 단계를 이름으로 말하고, 아래 표에서 한 줄 설명을 붙인다.

   | id | skill | 한 줄 설명 |
   |---|---|---|
   | 00 | kna-00-start | 동의, 모드, 에이전트 이름, 템플릿 언어, 도메인 선택, 필수 도구 확인 |
   | 01 | kna-01-gcp-account | GCP 계정과 무료 크레딧, gcloud 로그인, 프로젝트, 결제 연결, API |
   | 02 | kna-02-budget | 50/90/100% 이메일 알림이 걸린 월 예산(권장) |
   | 03 | kna-03-vm | 고정 IP, e2-medium VM, 방화벽 80/443, swap, Docker |
   | 04 | kna-04-dns | `wiki.<domain>` 을 VM 에 연결하거나 sslip.io 이름을 쓴다 |
   | 05 | kna-05-google-oauth | 위키의 Google 로그인(OAuth 클라이언트) |
   | 06 | kna-06-outline-deploy | 버킷, 비밀값, HTTPS 로 Outline + Caddy 기동, 첫 관리자 로그인 |
   | 07 | kna-07-mcp-connect | Claude Code 를 MCP 로 위키에 연결 |
   | 08 | kna-08-collections | 규칙이 적힌 에이전트 Sessions 콜렉션과 공유 콜렉션 `공유 지식`(영어 템플릿이면 `Shared Knowledge`) 생성 |
   | 09 | kna-09-persona | 에이전트 페르소나와 `~/.claude/CLAUDE.md` 규칙 블록, 첫 세션 문서 |
   | 10 | kna-10-discord | 같은 위키를 쓰는 Discord 봇(선택) |
   | 11 | kna-11-backups | 매일 디스크 스냅샷과 매일 밤 DB 덤프 |
   | 12 | kna-12-add-agent | 같은 위키에 에이전트나 머신을 하나 더 붙인다 |

   전부 done 이나 skipped 면 설치가 끝났다고 말하고, 두 번째 머신이나 에이전트를 붙일 때 쓰는 `kna-12-add-agent` 를
   알려준다.

5. 다음 단계를 지금 시작할지 묻는다. yes 없이 시작하지 않는다.

## 검증

이 스킬의 출력이 곧 검증이다. `status --json` 의 `next` 와 표 아래에 말한 다음 단계가 같은지 확인한다.

## 하지 않는 것

- state 파일에서 비밀값처럼 보이는 값을 발견해도 출력하지 않는다. 어느 키에 있는지만 말하고, 사용자가 에디터로
  `.knowanywhere/state.json` 을 열어 그 키를 지우도록 권한다.
- 이 스킬에서 state 를 고치지 않는다.
