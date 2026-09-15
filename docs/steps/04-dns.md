# 04단계: DNS

스킬: `kna-04-dns`. `fresh` 모드만. 돈이 들지 않는다(이 일로 도메인을 새로 사지 않는 한).

위키에는 VM 의 고정 IP 를 가리키는 호스트 이름이 필요하다. 06단계에서 Caddy 가 이 이름으로 Let's Encrypt 의 무료 HTTPS
인증서를 받고, 05단계의 Google 로그인도 이 이름에 묶인다. 신중하게 고른다. 나중에 호스트 이름을 바꾸면 OAuth 클라이언트,
Outline 의 `URL` 설정, 모든 에이전트의 MCP 연결을 다 고쳐야 한다. 인스톨러도 state 에 쓰기 전에 한 번 더 확인받는다.

00단계에서 고른 `domain.kind` 에 따라 두 경로 중 하나로 간다.

## 경로 A: 내 도메인 (`own`)

인스톨러가 도메인(예: `example.com`)과 서브도메인(기본값 `wiki`, 그러면 `wiki.example.com`)을 묻는다. 그다음 도메인의
DNS 를 관리하는 곳에 레코드 하나를 추가한다. 관리하는 곳은 가비아나 Namecheap 같은 등록 대행사일 수도 있고,
Cloudflare 나 Route 53 같은 DNS 제공자일 수도 있다. 어디인지 모르면 nameserver 를 본다.

```bash
dig +short NS example.com
```

답에 제공자 이름이 보인다(예: `*.ns.cloudflare.com`).

추가할 레코드:

| 필드 | 값 |
|---|---|
| Type | `A` |
| Name / Host | `wiki` (전체 이름 `wiki.example.com` 을 요구하는 곳도 있다) |
| Value / Points to / IPv4 address | VM IP, 예: `203.0.113.10` |
| TTL | 고를 수 있는 가장 낮은 값. 예: 300초, 또는 Auto |

흔한 클릭 경로: 제공자에 로그인 > 내 도메인 > **DNS**(또는 **DNS settings**, **Manage DNS**, **Zone editor**,
DNS 관리) > **Add record**(레코드 추가).

저장하기 전에 두 가지를 확인한다.

- **이름이 `wiki` 인 `AAAA` 나 `CNAME` 레코드가 따로 없어야 한다.** 있으면 지운다. IPv6(`AAAA`) 레코드가 있으면
  Let's Encrypt 가 IPv6 주소로 접속을 시도하는데 VM 은 IPv6 로 답하지 않으므로 인증서가 발급되지 않는다.
- **Cloudflare 를 쓰면 Proxy status 를 "DNS only" 로 둔다**(주황 구름이 아니라 회색 구름). proxy 가 켜져 있으면
  Cloudflare 가 VM 앞에서 HTTPS 를 대신 처리해서 Caddy 가 인증서 설정을 끝내지 못한다. 이 구성에는 proxy 가 필요 없다.

저장했으면 인스톨러에게 알린다. 인스톨러는 그때부터 확인을 시작한다.

## 경로 B: sslip.io (도메인 없음)

[sslip.io](https://sslip.io) 는 이름 안에 IPv4 주소가 들어 있으면 그 주소로 답해 주는 무료 공개 DNS 서비스다.
IP 가 `203.0.113.10` 이면 인스톨러는 이 이름을 쓴다.

```bash
echo "wiki-$(echo 203.0.113.10 | tr . -).sslip.io"
#   wiki-203-0-113-10.sslip.io
```

- `wiki-` 는 자유롭게 붙인 접두어이고, 그 뒤에 점을 대시로 바꾼 IP, 끝에 서비스 이름 `.sslip.io` 가 온다.
- 점으로 적은 `wiki.203.0.113.10.sslip.io` 도 동작한다. 인스톨러는 대시 형식을 쓴다.
- 설정할 것이 없다. VM 이 이 고정 IP 를 유지하는 동안 이 이름이 계속 동작한다.
- 무료 제3자 DNS 서비스에 기대는 방식이다. 오래 쓸 위키라면 내 도메인이 더 튼튼하다.

## 확인

두 경로 모두 같은 명령으로 확인한다. `wiki.example.com` 자리에 실제 호스트를 넣는다.

```bash
dig +short wiki.example.com A @8.8.8.8
dig +short wiki.example.com A @1.1.1.1
dig +short wiki.example.com AAAA @8.8.8.8
```

```
203.0.113.10
203.0.113.10
```

두 `A` 질의가 모두 VM IP 한 줄만 출력하고, `AAAA` 질의는 아무것도 출력하지 않아야 한다.

경로 A 에서는 CAA 레코드도 본다. 출력이 비어 있거나 `letsencrypt.org` 가 들어 있으면 된다. 다른 인증기관만 적혀 있으면
Let's Encrypt 발급이 막히므로 `0 issue "letsencrypt.org"` CAA 레코드를 추가한다.

```bash
dig +short example.com CAA @8.8.8.8
```

`dig` 가 없으면(Windows, 최소 설치 Linux) `nslookup` 이나 Node 로 확인한다.

```bash
nslookup wiki.example.com 8.8.8.8
node -e "require('dns').promises.resolve4('wiki.example.com').then(a=>console.log(a.join('\n')))"
```

## 얼마나 걸리나

새 레코드는 보통 몇 분 안에 보인다. 같은 이름의 레코드가 전에 있었다면 일부 resolver 는 옛 TTL 이 끝날 때까지 옛 답을
준다. TTL 이 3600 이상이었다면 몇 시간이 걸릴 수 있다. `@8.8.8.8` 과 `@1.1.1.1` 에 직접 물으면 내 컴퓨터의 캐시를
거치지 않는다.

## 문제 해결

| 증상 | 원인과 조치 |
|---|---|
| 15분이 지나도 답이 비어 있다 | 실제로 도메인을 서비스하지 않는 곳에 레코드를 저장했거나(`dig +short NS example.com` 과 대시보드를 비교한다) 이름에 오타가 있다 |
| 다른 IP 가 나온다 | 옛 레코드가 남아 있거나 캐시돼 있다. 중복 레코드를 지우고 옛 TTL 만큼 기다린다 |
| `wiki.example.com.example.com` 이 대신 풀린다 | 제공자가 전체 이름 뒤에 도메인을 한 번 더 붙였다. Name 을 `wiki` 로만 적는다. `dig +short wiki.example.com.example.com` 으로 확인한다 |
| Cloudflare IP(104.x, 172.67.x)가 나온다 | proxy 가 켜져 있다. DNS only 로 바꾼다 |
| 인증서 발급이 CAA 때문에 실패한다 | CAA 에 다른 인증기관만 있다. `0 issue "letsencrypt.org"` 를 추가한다 |

`A` 답이 VM IP 와 맞기 전에는 인스톨러가 이 단계를 `done` 으로 쓰지 않는다.

## 기록되는 state

```bash
node .claude/skills/kna-status/state.mjs set '{"wiki":{"host":"wiki.example.com"}}'
node .claude/skills/kna-status/state.mjs step 04 done
```

sslip.io 경로라면 `{"wiki":{"host":"wiki-203-0-113-10.sslip.io"}}` 를 쓴다. 모든 키는 [`docs/state.md`](../state.md)에 있다.

## 체크리스트

- [ ] `wiki.host` 로 쓸 이름을 정했고 인스톨러에 확인해 줬다.
- [ ] `dig` 의 두 `A` 질의가 VM IP 를 출력한다.
- [ ] `AAAA` 질의가 비어 있다.
- [ ] (경로 A) Cloudflare 라면 DNS only 이고, CAA 가 비어 있거나 `letsencrypt.org` 를 허용한다.

## 다음

[05단계: 위키용 Google 로그인](05-google-oauth.md) (`kna-05-google-oauth`)
