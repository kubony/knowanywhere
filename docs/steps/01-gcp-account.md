# 01단계: Google Cloud 계정, 프로젝트, 결제

스킬: `kna-01-gcp-account`. `fresh` 모드만.

이 단계가 끝나면 결제가 연결되고 API 세 개가 켜진 Google Cloud 프로젝트가 생긴다. 계정과 프로젝트를 만드는 데는 돈이
들지 않는다. 결제를 연결해야 프로젝트가 무료 크레딧을 쓸 수 있게 된다.

인스톨러는 내 컴퓨터의 gcloud 설정(활성 프로젝트, 기본 region, zone)을 바꾸지 않는다. 다른 프로젝트에 gcloud 를 쓰고
있어도 그대로 유지된다. 프로젝트 ID, region, zone 은 인스톨러의 state 파일에만 적고, 명령마다 `--project`, `--region`,
`--zone` 을 직접 붙인다. 위키용 gcloud 설정을 따로 두고 싶으면 `gcloud config configurations create kna` 로 새 설정을 만든다.
새 설정은 만들자마자 활성화되고 비어 있으므로 그 안에서 `gcloud auth login` 을 한 번 해야 한다. 원래 설정으로 돌아갈 때는
`gcloud config configurations activate default`. 이것은 선택이고 직접 실행한다.

## 용어

| 용어 | 뜻 |
|---|---|
| GCP | Google Cloud Platform. Google 의 클라우드 서비스 |
| 프로젝트 | 클라우드 리소스(VM, 디스크, 버킷)를 담는 그릇. 프로젝트를 지우면 안의 것이 전부 지워진다 |
| 프로젝트 이름 | 바꿀 수 있는 표시 이름. 예: `knowanywhere wiki` |
| 프로젝트 ID | 바꿀 수 없고 전 세계에서 유일한 식별자. 예: `kna-wiki-a1b2`. 모든 명령에 쓰인다 |
| 결제 계정 | 요금이 청구되는 곳. 무료 체험을 시작하면 $300 크레딧이 든 결제 계정이 하나 생긴다 |
| region / zone | 데이터센터 위치. region(`asia-northeast3`, 서울) 안에 zone(`asia-northeast3-a`)이 있다 |
| gcloud | Google Cloud 명령줄 도구 |

## 준비물

- Google 계정.
- 해외 결제가 되는 신용카드나 체크카드(본인 확인용).

카드에 대해: Google 은 정식(유료) 계정으로 전환하기 전에는 무료 체험 요금을 청구하지 않는다고 밝히고 있다. 작은 임시
승인 금액이 보였다가 풀릴 수 있다. 체험은 90일이 지나거나 $300 크레딧을 다 쓰면 끝난다.

지금 알아 둘 것: 체험이 끝나면 정식 계정으로 전환하지 않는 한 Google 이 체험 리소스를 멈춘다. 체험 뒤에도 위키를
계속 쓰려면 그때 결제 계정을 전환하고, 그 뒤로는 [구조 문서](../architecture.md#비용)의 월 비용이 나간다. 02단계에서
예산 알림을 걸어 두면 청구서에 놀랄 일이 없다.

## 계정 만들기

1. 브라우저에서 https://cloud.google.com/free 를 연다.
2. **Get started for free**(무료로 시작하기)를 누르고 Google 계정으로 로그인한다.
3. 국가를 고르고 서비스 약관에 동의한 뒤 **Continue**(계속)를 누른다.
4. 계정 유형: **Individual**(개인). 사업자로 등록하는 경우가 아니면 이것을 고른다.
5. 카드에 적힌 대로 이름과 주소를 넣고 카드 정보를 넣는다.
6. **Start free trial**(무료 체험 시작)을 누른다(버튼 문구는 조금 다를 수 있다).

결제 계정을 만들 수 없다고 나오면 그 Google 계정은 전에 무료 체험을 쓴 적이 있을 가능성이 높다. 다른 Google 계정을
쓰거나 유료 계정으로 진행한다(02단계의 예산 알림은 그래도 도움이 된다).

카드 확인이 실패하면 카드 앱에서 해외 온라인 결제가 허용돼 있는지 보거나 다른 카드를 쓴다.

## 크레딧 확인

1. https://console.cloud.google.com 을 연다.
2. 왼쪽 위 **Navigation menu**(☰, 탐색 메뉴) > **Billing**(결제)을 누른다.
3. 왼쪽 메뉴의 **Credits**(크레딧)를 누른다. 약 $300 과 만료일이 보여야 한다.

## gcloud 로그인

`gcloud --version` 이 아직 안 되면 먼저 설치한다([00단계](00-start.md#gcloud-설치) 참고).

이미 로그인돼 있으면 건너뛴다(`gcloud auth list` 에 쓸 계정이 활성으로 보이면 된다). 로그인하면 그 계정이 gcloud 의 활성
계정이 된다.

```bash
gcloud auth login
```

브라우저 창이 열린다. 같은 Google 계정을 고르고 **Allow**(허용)를 누른다. 터미널에 로그인한 계정이 출력된다.
브라우저가 없는 머신(서버, 원격 셸)에서는 `gcloud auth login --no-launch-browser` 를 쓰고, 출력된 URL 을 아무 컴퓨터에서
열어 받은 코드를 붙여 넣는다.

```bash
gcloud auth list
```

활성 계정 옆에 `*` 가 붙는다.

## 프로젝트 만들기

인스톨러가 `kna-wiki-a1b2` 같은 ID 를 제안한다. 규칙: 6자에서 30자, 영문 소문자·숫자·하이픈, 글자로 시작, Google
Cloud 전체에서 유일.

먼저 내 계정이 속한 조직이 있는지 본다.

```bash
gcloud organizations list --format="value(name.basename(),displayName)"
```

| 결과 | 계정 | 만드는 명령 |
|---|---|---|
| 조직 하나(예: `123456789012  yourcompany.com`) | Google Workspace | `gcloud projects create kna-wiki-a1b2 --name="knowanywhere wiki" --organization=123456789012` |
| 아무것도 없음 | 개인 Gmail 등 | `gcloud projects create kna-wiki-a1b2 --name="knowanywhere wiki"` |

조직이 여럿이면 인스톨러가 어느 조직에 둘지 묻는다. 조직 아래 만든 프로젝트는 05단계 OAuth 동의 화면에서
**Internal**(그 조직 계정만 로그인)을 고를 수 있어 테스트 사용자 등록이 필요 없다. 조직 없는 프로젝트는 **External**
만 고를 수 있다. `--organization` 을 붙였는데 `PERMISSION_DENIED` 가 나면 그 조직에 프로젝트를 만들 권한이 없다.
조직 관리자에게 권한을 받거나 `--organization` 없이 만든다.

클릭으로 하고 싶다면: 콘솔 맨 위의 프로젝트 선택기(**My First Project** 라고 적혀 있을 수 있다) > **New project**(새
프로젝트)를 누르고, 이름을 넣고, ID 아래 **Edit**(수정)으로 ID 를 정한다. **Location**(위치)은 Workspace 계정이면 내
조직을, 개인 계정이면 **No organization**(조직 없음)을 고르고 **Create**(만들기)를 누른다. 그다음 인스톨러에게 만든
프로젝트 ID 를 알려준다.

위키 전용 프로젝트를 권한다. 나중에 전부 지우고 싶을 때 이 프로젝트 하나만 지우면 된다.

## 결제 연결

```bash
gcloud billing accounts list --filter="open=true"
```

```
ACCOUNT_ID            NAME                 OPEN   MASTER_ACCOUNT_ID
XXXXXX-XXXXXX-A1C3D4  My Billing Account   True
```

```bash
gcloud billing projects link kna-wiki-a1b2 --billing-account=XXXXXX-XXXXXX-A1C3D4
gcloud billing projects describe kna-wiki-a1b2 --format="value(billingEnabled)"
```

마지막 명령은 `True` 를 출력해야 한다. 콘솔에서는 **Billing > Account management > My projects** 에서 같은 것을 볼 수 있다.

인스톨러는 결제 계정 ID 의 끝 4자리(여기서는 `C3D4`)만 저장한다.

## API 켜기

```bash
gcloud services enable compute.googleapis.com storage.googleapis.com iam.googleapis.com --project=kna-wiki-a1b2
```

| API | 쓰이는 곳 |
|---|---|
| `compute.googleapis.com` | VM, 디스크, 고정 IP, 방화벽 규칙, 스냅샷 |
| `storage.googleapis.com` | 위키 첨부 파일과 DB 백업을 담는 버킷 |
| `iam.googleapis.com` | Outline 이 uploads 버킷에 접근할 때 쓰는 서비스 계정과 HMAC 키 |

켜는 것만으로는 돈이 들지 않는다. 1~2분 걸릴 수 있다.

## region 과 zone 고르기

가장 가까운 곳을 고른다. 고른 값은 gcloud 설정에 넣지 않고 인스톨러 state 에만 적는다.

| zone | 위치 | 메모 |
|---|---|---|
| `asia-northeast3-a` | 서울 | 인스톨러 기본값 |
| `us-central1-a` | 미국 아이오와 | 보통 가장 싸다 |
| `europe-west1-b` | 벨기에 | 유럽 |

## 확인

```bash
gcloud projects describe kna-wiki-a1b2 --format="value(projectId,lifecycleState,parent.type,parent.id)"
gcloud billing projects describe kna-wiki-a1b2 --format="value(billingEnabled)"
```

```
kna-wiki-a1b2	ACTIVE	organization	123456789012
True
```

조직 없이 만들었으면 첫 줄의 `organization` 과 조직 id 자리가 비어 있다.

```bash
gcloud services list --enabled --project=kna-wiki-a1b2 --format="value(config.name)" | grep -E '^(compute|storage|iam)\.googleapis\.com$'
```

`compute.googleapis.com`, `iam.googleapis.com`, `storage.googleapis.com` 세 줄이 나와야 한다.

## 문제 해결

| 메시지 | 원인과 조치 |
|---|---|
| `gcloud: command not found` | 설치 뒤 새 터미널을 연다. 안 되면 설치기를 다시 실행한다 |
| `project ID is already in use` | 누가 쓰는 ID 다. 다른 ID 를 고른다 |
| `The caller does not have permission` | gcloud 의 활성 계정이 다른 계정이다. `gcloud auth list` 로 확인하고, 명령에 `--account=you@example.com` 을 붙여 다시 실행한다 |
| `projects create` 가 `PERMISSION_DENIED` (`--organization` 을 붙였을 때) | 그 조직에 프로젝트를 만들 권한이 없다. 조직 관리자에게 권한을 받거나 `--organization` 없이 만든다 |
| `Cloud billing quota exceeded` | 결제 계정에 연결된 프로젝트가 너무 많다. 안 쓰는 프로젝트의 연결을 끊거나 그 프로젝트를 쓴다 |
| `API [compute.googleapis.com] not enabled` | `services enable ... --project=kna-wiki-a1b2` 를 다시 실행하고 1분 기다린다 |
| 콘솔에 프로젝트가 안 보인다 | 콘솔에 다른 Google 계정으로 로그인돼 있다(오른쪽 위 프로필 확인) |

## 체크리스트

- [ ] **Billing > Credits** 에 $300 크레딧이 보인다.
- [ ] `gcloud auth list` 에 내 계정이 활성으로 보인다.
- [ ] `gcloud projects describe` 에 프로젝트가 `ACTIVE` 로 보인다.
- [ ] region 과 zone 을 골랐다(인스톨러 state 에 기록된다).
- [ ] 프로젝트의 `billingEnabled` 가 `True` 다.
- [ ] API 세 개가 켜져 있다.

## 다음

[02단계: 예산 알림](02-budget.md)
