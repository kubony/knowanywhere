---
name: kna-01-gcp-account
description: fresh 모드에서 kna-00-start 가 끝난 뒤 knowanywhere 01단계를 진행할 때 쓴다. Google Cloud 가입과 $300 무료 크레딧을 안내하고, gcloud auth login, 프로젝트 생성, 결제 계정 연결, compute/storage/iam API 활성화, region 과 zone 설정을 한다.
---

# 01단계: GCP 계정, 프로젝트, 결제

사용자가 쓰는 언어로 말한다. 명령, 콘솔 라벨, 키 이름은 원문 그대로 둔다(사용자의 콘솔이 한국어일 수도 영어일 수도
있으므로 라벨 번역은 괄호에만 쓴다). 클릭 경로가 있는 안내서: `docs/steps/01-gcp-account.md`.

## 목표

결제가 연결되고, Compute Engine, Cloud Storage, IAM API 가 켜지고, gcloud 가 그 프로젝트와 기본 region, zone 을
가리키는 GCP 프로젝트 하나.

## 필요한 state 키

- `steps.00.status` 가 `done`, `mode` 가 `fresh`, `prereqs.gcloud` 가 `null` 이 아님.

```bash
node .claude/skills/kna-status/state.mjs get mode
node .claude/skills/kna-status/state.mjs get prereqs.gcloud
```

기대 출력: `"fresh"` 와 버전 문자열. `null` 이면 `kna-00-start` 로 돌아가 gcloud 를 설치한다.

## 물을 것

1. Google Cloud 계정과 결제 설정이 이미 있는가.
2. 프로젝트 ID(기본값을 제안한다).
3. 결제 계정이 여러 개면 어느 것인가.
4. region/zone(기본 `asia-northeast3-a`).

## 절차

### 1. 계정과 무료 크레딧 (사람이 브라우저에서)

계정이 없으면 `docs/steps/01-gcp-account.md` 의 "계정 만들기" 절을 따라 안내한다. https://cloud.google.com/free 에서
**Get started for free**(무료로 시작하기)를 누르고, 국가 선택, 약관 동의, 계정 유형 **Individual**(개인), 카드 입력 순이다.
분명히 말한다: 카드는 본인 확인용이다. Google 은 정식(유료) 계정으로 전환하기 전에는 무료 체험 요금을 청구하지 않는다고
밝히고 있다. 작은 임시 승인 금액이 보였다 사라질 수 있다. 체험이 끝나면(90일 또는 $300 소진) 정식 계정으로 전환하지
않는 한 VM 이 멈추므로, 위키를 계속 쓰려면 그때 전환해야 한다.

크레딧이 보이는지 확인하게 한다: 콘솔 **Navigation menu (☰) > Billing > Credits**(결제 > 크레딧).
사용자가 확인했다고 할 때까지 기다린다.

### 2. gcloud 로그인

```bash
gcloud auth login
```

브라우저가 열리면 같은 Google 계정을 고른다. 브라우저가 없는 머신에서는 `gcloud auth login --no-launch-browser`.

```bash
gcloud auth list --format="value(account,status)"
```

기대 출력: 고른 계정 옆에 `ACTIVE`.

### 3. 프로젝트 만들기

ID 를 제안하고 받아들일지, 다른 것을 쓸지 묻는다. 규칙: 6~30자, 영문 소문자·숫자·하이픈, 글자로 시작, Google Cloud
전체에서 유일, 나중에 바꿀 수 없다.

```bash
printf 'kna-wiki-%s\n' "$(LC_ALL=C tr -dc 'a-z0-9' </dev/urandom | head -c4)"
```

프로젝트 생성은 무료다. 명령을 보여준 뒤 실행한다.

```bash
gcloud projects create kna-wiki-a1b2 --name="knowanywhere wiki"
gcloud config set project kna-wiki-a1b2
```

`already in use` 는 이미 누가 쓰는 ID 다. 다른 ID 를 제안한다. 체험 계정에 이미 있는 프로젝트를 쓰겠다면 그 ID 를 쓰고
`projects create` 를 건너뛴다. 전용 프로젝트를 권한다. 나중에 프로젝트 하나만 지우면 이 인스톨러가 만든 것이 전부 사라진다.

### 4. 결제 연결 (크레딧을 쓰기 시작한다: 먼저 묻는다)

```bash
gcloud billing accounts list --filter="open=true"
```

열린 계정이 하나면 그것을 제안하고, 여럿이면 어느 것인지 묻는다. 연결하면 이 프로젝트가 크레딧을(나중에는 실제 돈을)
쓸 수 있게 된다고 설명한다. yes 를 받은 뒤:

```bash
gcloud billing projects link kna-wiki-a1b2 --billing-account=XXXXXX-XXXXXX-XXXXXX
gcloud billing projects describe kna-wiki-a1b2 --format="value(billingEnabled)"
```

기대 출력: `True`. `Cloud billing quota exceeded` 는 결제 계정에 연결할 수 있는 프로젝트 수가 찼다는 뜻이다. 콘솔
**Billing > Account management** 에서 안 쓰는 프로젝트의 연결을 끊거나 기존 프로젝트를 쓴다.

### 5. API 켜기 (무료)

```bash
gcloud services enable compute.googleapis.com storage.googleapis.com iam.googleapis.com --project=kna-wiki-a1b2
```

1~2분 걸릴 수 있다. Compute Engine 을 켜면 `default` VPC 네트워크도 만들어진다.

### 6. region 과 zone

아래 기본값과 대안 두 개로 묻는다. 사용자와 가장 가까운 곳을 고른다. 여기서는 가격보다 지연 시간이 중요하다.

| zone | 위치 | 메모 |
|---|---|---|
| `asia-northeast3-a` | 서울 | 기본값 |
| `us-central1-a` | 아이오와 | 보통 가장 싸다 |
| `europe-west1-b` | 벨기에 | 유럽 |

```bash
gcloud config set compute/region asia-northeast3
gcloud config set compute/zone asia-northeast3-a
```

## 검증

```bash
gcloud config list
gcloud services list --enabled --project=kna-wiki-a1b2 --format="value(config.name)" | grep -E '^(compute|storage|iam)\.googleapis\.com$'
```

기대 출력: `config list` 에 계정, `project = kna-wiki-a1b2`, `region`, `zone` 이 보이고, 두 번째 명령은 정확히 세 줄을
출력한다. API 가 하나라도 빠지면 `services enable` 을 다시 돌리고 다시 확인한다.

### 문제 해결

| 증상 | 조치 |
|---|---|
| `You do not currently have an active account selected` | `gcloud auth login` |
| `The caller does not have permission` | 다른 계정으로 로그인돼 있다. `gcloud auth list` 확인 후 `gcloud config set account <email>` |
| `API [...] not enabled` | 그 프로젝트로 `services enable` 을 다시 실행 |
| `Billing account for project ... is not found` | 4번이 끝나지 않았다. 연결 명령을 다시 실행 |

## state에 쓸 것

결제 계정 id 는 끝 4자리만 state 에 쓴다(예: `XXXXXX-XXXXXX-A1C3D4` 면 `C3D4`).

```bash
node .claude/skills/kna-status/state.mjs set '{"gcp":{"project_id":"kna-wiki-a1b2","billing_account_last4":"C3D4","region":"asia-northeast3","zone":"asia-northeast3-a"}}'
node .claude/skills/kna-status/state.mjs step 01 done
```

출력된 조각을 보여준다.

## 다음 단계

`kna-02-budget`: 이메일 알림이 걸린 월 예산(권장, 건너뛸 수 있음). 시작하기 전에 묻는다.
