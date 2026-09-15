---
name: kna-04-dns
description: fresh 모드에서 kna-03-vm 이 끝난 뒤 knowanywhere 04단계를 진행할 때 쓴다. 위키 호스트 이름이 VM 고정 IP 로 풀리게 한다. 내 도메인의 wiki.<domain> A 레코드(Cloudflare 는 proxy OFF), 또는 무료 wiki-<ip-with-dashes>.sslip.io 이름을 쓰고, dig 나 nslookup 으로 해석 결과를 확인한다.
---

# 04단계: DNS

사용자가 쓰는 언어로 말한다. 명령, 레코드 필드 이름, 키 이름은 원문 그대로 둔다.
사람이 읽는 안내서: `docs/steps/04-dns.md`.

## 목표

공개 DNS 가 `vm.ip` 로 풀어 주는 위키 호스트 이름(`wiki.host`) 하나. 06단계에서 Caddy 가 HTTPS 인증서를 받으려면
이것이 먼저 있어야 하고, Google OAuth(05단계)도 최종 호스트 이름이 필요하다.

## 필요한 state 키

- `steps.03.status` 가 `done`. `vm.ip` 와 `domain.kind` 를 읽는다.

```bash
node .claude/skills/kna-status/state.mjs get vm.ip
node .claude/skills/kna-status/state.mjs get domain.kind
```

- `domain.kind` 가 없으면 `kna-00-start` 의 도메인 질문(own 또는 sslip)을 먼저 하고
  `node .claude/skills/kna-status/state.mjs set '{"domain":{"kind":"own"}}'` 로 쓴다.

호스트 이름은 나중에 바꾸기 어렵다(OAuth 클라이언트, Outline 의 `URL` 설정, 모든 MCP 클라이언트에 들어간다).
state 에 쓰기 전에 사용자에게 확인받는다.

## 물을 것

경로 A(`domain.kind` = `own`)에서만 묻는다. 경로 B(`sslip`)에는 물을 것이 없다.

1. 도메인. 예: `example.com`.
2. 서브도메인. 기본값 `wiki`, 그러면 `wiki.example.com`.
3. 도메인의 DNS 를 어디서 관리하는지(등록 대행사, 또는 Cloudflare, Route 53 등). 모르면 nameserver 로 확인한다.

```bash
dig +short NS example.com
```

## 절차

### 경로 A: 내 도메인 (`domain.kind` = `own`)

#### 사람이 할 일

도메인의 DNS 설정을 열고 레코드 하나를 추가하게 한다.

| 필드 | 값 |
|---|---|
| Type | `A` |
| Name / Host | `wiki` (전체 이름 `wiki.example.com` 을 요구하는 곳도 있다) |
| Value / Points to / IPv4 address | VM IP, 예 `203.0.113.10` |
| TTL | 고를 수 있는 가장 낮은 값, 예 300초(또는 Auto) |

함께 확인한다.

- 이름이 `wiki` 인 `AAAA` 나 `CNAME` 레코드가 이미 있으면 지워야 한다. `AAAA` 가 있으면 Let's Encrypt 가 IPv6 로
  접속을 시도하는데 VM 은 IPv6 로 답하지 않으므로 인증서 발급이 실패한다.
- **Cloudflare**: Proxy status 를 **DNS only**(회색 구름)로 둔다. 주황 구름(proxy ON)이면 Cloudflare 가 TLS 를 대신
  끝내서 Caddy 의 인증서 challenge 와 HTTPS 설정이 실패한다. 이 구성에는 proxy 가 필요 없다.

사용자가 레코드를 저장했다고 할 때까지 기다린다.

### 경로 B: sslip.io (`domain.kind` = `sslip`)

사람이 할 일은 없다. 호스트는 `wiki-<점을 대시로 바꾼 IP>.sslip.io` 다.

```bash
echo "wiki-$(echo 203.0.113.10 | tr . -).sslip.io"
```

설명한다: sslip.io 는 이름 안에 IPv4 주소가 들어 있으면 그 주소로 답해 주는 무료 공개 DNS 서비스다. `wiki-` 는 자유롭게
붙인 접두어다. VM 이 이 IP 를 유지하는 동안만 이 이름이 동작하므로 고정 IP 가 중요하다. 무료 제3자 서비스에 기대는
것이므로 오래 쓸 위키라면 나중에 내 도메인으로 옮기는 편이 튼튼하다.

## 검증

검증 명령과 도구 호출의 출력은 요약하지 말고 fenced code block 으로 원문을 붙이고, 그 아래 한 줄로 기대 결과와 맞는지 판정한다.

두 경로 공통이다. 아래 `wiki.example.com` 자리에 실제 호스트를 넣는다.

```bash
dig +short wiki.example.com A @8.8.8.8
dig +short wiki.example.com A @1.1.1.1
dig +short wiki.example.com AAAA @8.8.8.8
```

기대 출력: 두 `A` 질의가 모두 VM IP 한 줄만 출력하고, `AAAA` 질의는 아무것도 출력하지 않는다. 출력을 보여준다.

경로 A 에서는 CAA 레코드도 본다. 출력이 비어 있거나 `letsencrypt.org` 가 들어 있으면 된다. 다른 CA 만 적혀 있으면
Let's Encrypt 발급이 막히므로 사용자에게 `0 issue "letsencrypt.org"` CAA 레코드를 추가하게 한다.

```bash
dig +short example.com CAA @8.8.8.8
```

`dig` 가 없으면 `nslookup wiki.example.com 8.8.8.8`(Windows 도 된다)을 쓰거나 Node 로 확인한다.

```bash
node -e "require('dns').promises.resolve4('wiki.example.com').then(a=>console.log(a.join('\n')))"
```

답이 비었거나 다른 IP 가 나오면(경로 A):

- 새 레코드는 보통 몇 분 안에 보인다. 같은 이름의 옛 레코드가 있었다면 resolver 가 옛 TTL 동안(길면 몇 시간) 옛 답을
  줄 수 있다. 사용자가 다시 확인할 때를 알려 달라고 하거나 1분 뒤 다시 본다. 오래 반복하지 않는다.
- 레코드를 실제로 도메인을 서비스하는 곳에 저장했는지 `dig +short NS example.com` 과 제공자 대시보드를 비교한다.
- 이름이 겹쳐 붙지 않았는지 본다(`wiki.example.com.example.com`): `dig +short wiki.example.com.example.com`.
- Cloudflare IP(104.x, 172.67.x)가 나오면 proxy 가 켜져 있다. DNS only 로 바꾼다.

`A` 답이 VM IP 와 맞기 전에는 단계를 done 으로 쓰지 않는다.

## state에 쓸 것

`state.mjs` 가 출력한 JSON 조각을 fenced code block 으로 그대로 보여준다.

```bash
node .claude/skills/kna-status/state.mjs set '{"wiki":{"host":"wiki.example.com"}}'
node .claude/skills/kna-status/state.mjs step 04 done
```

sslip 이면 `{"wiki":{"host":"wiki-203-0-113-10.sslip.io"}}` 를 쓴다.

## 다음 단계

`kna-05-google-oauth`: 위키의 Google 로그인을 만든다. redirect URI 는 `https://<wiki.host>/auth/google.callback` 이다.
시작하기 전에 묻는다.
