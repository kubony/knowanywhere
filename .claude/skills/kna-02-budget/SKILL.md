---
name: kna-02-budget
description: fresh 모드에서 kna-01-gcp-account 가 끝난 뒤 knowanywhere 02단계를 진행할 때, 또는 건너뛴 예산 알림을 나중에 걸고 싶을 때 쓴다. gcloud billing budgets create 로 위키 프로젝트에 한정한 월 예산과 50/90/100% 이메일 알림을 만든다. 권장하지만 건너뛸 수 있다.
---

# 02단계: 예산과 알림

사용자가 쓰는 언어로 말한다. 명령과 키 이름은 원문 그대로 둔다.
사람이 읽는 안내서: `docs/steps/02-budget.md`.

## 목표

위키 프로젝트의 이번 달 비용이 사용자가 정한 금액의 50%, 90%, 100% 에 닿으면 이메일이 온다.
예산은 지출을 막거나 무엇을 끄지 **않는다**. 알림만 보낸다. 이 점을 분명히 말한다.

## 필요한 state 키

- `steps.01.status` 가 `done`. `gcp.project_id` 와 `gcp.billing_account_last4` 를 읽는다.

```bash
node .claude/skills/kna-status/state.mjs get gcp
```

- gcloud 가 결제 계정 관리자 권한이 있는 계정으로 로그인돼 있어야 한다(체험 계정 소유자는 관리자다).

## 물을 것

금액과 크레딧 처리는 서로 독립이라 기본값과 함께 한 번에 물어도 된다. 다만 금액의 통화는 절차 2에서 결제 계정의
통화를 확인한 뒤에 정하므로, 통화를 모르는 채로 금액을 확정하지 않는다.

1. 지금 예산을 걸 것인가. 권한다. 아니면 "건너뛰기"로 간다.
2. 월 금액. **40 USD** 를 제안한다(예상 총비용이 월 $33 ~ 40, `docs/architecture.md`). 낮출수록 알림이 일찍 온다.
   결제 통화가 USD 가 아니면 그 통화로 환산한 금액을 제안한다(예: KRW 결제 계정이면 `55000KRW`). 인스톨러는 환율을
   조회하지 않으므로 환산값은 대략이라고 말하고, 사용자가 통화 단위로 금액을 확정하게 한다.
3. 크레딧을 포함할지. **크레딧 제외**(`--credit-types-treatment=exclude-all-credits`)를 권한다. 그래야 $300 크레딧이
   비용을 대신 내는 동안에도 실제 소비 속도가 알림에 반영된다. 크레딧을 포함하면 체험 기간 내내 비용이 0으로 보여서
   크레딧이 다 떨어질 때까지 알림이 오지 않는다.

## 절차

예산은 무료다. 명령마다 먼저 보여주고 실행한다. 프로젝트 ID 는 state 의 값으로 바꿔 넣는다. Budget API 는 호출한
프로젝트의 할당량을 쓰므로 `gcloud billing budgets` 명령에는 모두 `--billing-project=<gcp.project_id>` 를 붙인다.
붙이지 않으면 gcloud 의 활성 프로젝트(사용자의 다른 프로젝트일 수 있다)로 호출돼 `not enabled` 나 권한 오류가 난다.

1. Budget API 를 먼저 켠다(무료). 예산 조회보다 먼저 해야 한다. 켜기 전에 `budgets list` 를 부르면
   `API [billingbudgets.googleapis.com] not enabled` 로 실패한다.

   ```bash
   gcloud services enable billingbudgets.googleapis.com --project=kna-wiki-a1b2
   ```

2. 프로젝트에 연결된 결제 계정과 그 통화를 찾는다(금액은 그 통화로 넣어야 한다).

   ```bash
   gcloud billing projects describe kna-wiki-a1b2 --format="value(billingAccountName)"
   gcloud billing accounts describe XXXXXX-XXXXXX-XXXXXX --format="value(currencyCode)"
   ```

   첫 명령은 `billingAccounts/XXXXXX-XXXXXX-XXXXXX` 를 출력한다. 아래에는 슬래시 뒤 부분을 쓴다. 그 끝 4자리가
   state 의 `gcp.billing_account_last4` 와 같은지 확인한다. 둘째 명령은 `USD`, `KRW` 같은 통화 코드를 출력한다.
   아무것도 출력되지 않으면 콘솔 **Billing > Account management** 에서 통화를 확인하게 한다.

3. 이미 있는 예산을 본다. 재실행이라 `knowanywhere monthly` 가 이미 있으면 새로 만들지 않는다(아래 검증 절의 중복 처리).

   ```bash
   gcloud billing budgets list --billing-account=XXXXXX-XXXXXX-XXXXXX --billing-project=kna-wiki-a1b2 --format="value(displayName)"
   ```

   1에서 API 를 방금 켰으면 이 호출이 `has not been used in project ... before or it is disabled` 로 실패할 수 있다.
   전파 지연이다. 30초 뒤 다시 한다.

4. 이 프로젝트에만 적용되는 예산을 만든다. `--budget-amount` 에는 2에서 확인한 통화 코드를 붙인다.

   ```bash
   gcloud billing budgets create --billing-project=kna-wiki-a1b2 \
     --billing-account=XXXXXX-XXXXXX-XXXXXX \
     --display-name="knowanywhere monthly" \
     --budget-amount=40USD \
     --calendar-period=month \
     --filter-projects=projects/kna-wiki-a1b2 \
     --credit-types-treatment=exclude-all-credits \
     --threshold-rule=percent=0.5 \
     --threshold-rule=percent=0.9 \
     --threshold-rule=percent=1.0
   ```

   KRW 결제 계정이면 `--budget-amount=55000KRW` 처럼 쓴다. 사용자가 금액을 바꿔 답하면(예: "월 20달러") 바뀐 금액을
   넣은 명령 전체(예: `--budget-amount=27500KRW`)를 다시 보여주고 yes 를 받은 뒤 실행한다.

   알림 메일은 결제 계정의 관리자와 사용자(체험 계정 소유자)에게 간다.

## 검증

검증 명령과 도구 호출의 출력은 요약하지 말고 fenced code block 으로 원문을 붙이고, 그 아래 한 줄로 기대 결과와 맞는지 판정한다.

```bash
gcloud billing budgets list --billing-account=XXXXXX-XXXXXX-XXXXXX --billing-project=kna-wiki-a1b2 \
  --format="table(displayName,amount.specifiedAmount.units,amount.specifiedAmount.currencyCode,thresholdRules[].thresholdPercent.list())"
```

기대 출력: `knowanywhere monthly` 행에 고른 금액, 통화 코드(예: `40  USD` 또는 `27500  KRW`), `0.5,0.9,1.0`.

재실행이라 `knowanywhere monthly` 예산이 이미 있으면 중복으로 만들지 않는다. 두 행을 모두 보여주고 옛 것을 남길지
새 것을 지울지 묻는다. 삭제(`gcloud billing budgets delete <budget-id> --billing-account=XXXXXX-XXXXXX-XXXXXX --billing-project=kna-wiki-a1b2`)는
지우는 일이므로 먼저 묻는다.

### 문제 해결

| 증상 | 조치 |
|---|---|
| API 를 켠 직후 `Cloud Billing Budget API has not been used in project ... before or it is disabled` | 전파 지연이다. 30초 뒤 같은 명령을 다시 실행한다. 두 번째도 실패하면 `gcloud services list --enabled --project=kna-wiki-a1b2 \| grep billingbudgets` 로 켜졌는지 본다 |
| `API [billingbudgets.googleapis.com] not enabled on project [...]` 에 다른 프로젝트 이름 | `--billing-project=kna-wiki-a1b2` 가 빠졌다. 붙여서 다시 실행한다 |
| `does not have permission to access billingAccounts instance` | Budget API 가 아직 꺼져 있거나(절차 1) Billing Account Administrator 가 아닌 계정이다. 절차 1을 먼저 하고, 그래도 나면 소유자 계정으로 `gcloud auth login` |
| `PERMISSION_DENIED` | Billing Account Administrator 가 아닌 계정이다. 소유자 계정으로 `gcloud auth login` |
| `Currency code ... does not match` | 절차 2의 통화로 금액을 다시 쓴다 |

## state에 쓸 것

`state.mjs` 가 출력한 JSON 조각을 fenced code block 으로 그대로 보여준다.

금액은 예산을 만든 그대로, 결제 계정의 통화 단위로 쓴다. 환산하지 않는다.

```bash
node .claude/skills/kna-status/state.mjs set '{"gcp":{"budget":{"amount":40,"currency":"USD"}}}'
node .claude/skills/kna-status/state.mjs step 02 done
```

KRW 결제 계정이면 `{"gcp":{"budget":{"amount":27500,"currency":"KRW"}}}` 처럼 쓴다. 옛 설치가 쓴 `gcp.budget_usd` 가
있으면 도우미가 `gcp.budget` 을 쓸 때 지운다.

### 건너뛰기

```bash
node .claude/skills/kna-status/state.mjs set '{"gcp":{"budget":null}}'
node .claude/skills/kna-status/state.mjs step 02 skipped
```

나중에 `kna-02-budget` 으로 다시 할 수 있고, 콘솔 **Billing > Budgets & alerts** 에서 직접 만들 수도 있다고 알려준다.

## 다음 단계

`kna-03-vm`: 고정 IP, VM, 방화벽, 기본 설정. 처음으로 돈이 드는 단계다. 시작하기 전에 묻는다.
