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

1. 지금 예산을 걸 것인가. 권한다. 아니면 "건너뛰기"로 간다.
2. 월 금액. **40 USD** 를 제안한다(예상 총비용이 월 $33 ~ 40, `docs/architecture.md`). 낮출수록 알림이 일찍 온다.
3. 크레딧을 포함할지. **크레딧 제외**(`--credit-types-treatment=exclude-all-credits`)를 권한다. 그래야 $300 크레딧이
   비용을 대신 내는 동안에도 실제 소비 속도가 알림에 반영된다. 크레딧을 포함하면 체험 기간 내내 비용이 0으로 보여서
   크레딧이 다 떨어질 때까지 알림이 오지 않는다.

## 절차

예산은 무료다. 명령마다 먼저 보여주고 실행한다. 프로젝트 ID 는 state 의 값으로 바꿔 넣는다.

1. Budget API 를 켜고 프로젝트에 연결된 결제 계정을 찾는다.

   ```bash
   gcloud services enable billingbudgets.googleapis.com --project=kna-wiki-a1b2
   gcloud billing projects describe kna-wiki-a1b2 --format="value(billingAccountName)"
   ```

   두 번째 명령은 `billingAccounts/XXXXXX-XXXXXX-XXXXXX` 를 출력한다. 아래에는 슬래시 뒤 부분을 쓴다. 그 끝 4자리가
   state 의 `gcp.billing_account_last4` 와 같은지 확인한다.

2. 결제 통화를 확인한다(금액은 그 통화로 넣어야 한다).

   ```bash
   gcloud billing accounts describe XXXXXX-XXXXXX-XXXXXX --format="value(currencyCode)"
   ```

   `USD` 가 아니면(예: `KRW`) 사용자가 고른 금액을 환산해 그 통화 코드로 `--budget-amount` 에 넣는다(예: `55000KRW`).
   아무것도 출력되지 않으면 콘솔 **Billing > Account management** 에서 통화를 확인하게 한다.

3. 이 프로젝트에만 적용되는 예산을 만든다.

   ```bash
   gcloud billing budgets create \
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

   알림 메일은 결제 계정의 관리자와 사용자(체험 계정 소유자)에게 간다.

## 검증

```bash
gcloud billing budgets list --billing-account=XXXXXX-XXXXXX-XXXXXX \
  --format="table(displayName,amount.specifiedAmount.units,amount.specifiedAmount.currencyCode,thresholdRules[].thresholdPercent.list())"
```

기대 출력: `knowanywhere monthly` 행에 금액과 `0.5,0.9,1.0`. 출력을 보여준다.

재실행이라 `knowanywhere monthly` 예산이 이미 있으면 중복으로 만들지 않는다. 두 행을 모두 보여주고 옛 것을 남길지
새 것을 지울지 묻는다. 삭제(`gcloud billing budgets delete <budget-id> --billing-account=XXXXXX-XXXXXX-XXXXXX`)는
지우는 일이므로 먼저 묻는다.

### 문제 해결

| 증상 | 조치 |
|---|---|
| `API [billingbudgets.googleapis.com] not enabled on project [...]` 에 다른 프로젝트 이름 | gcloud 의 현재 프로젝트가 다르다. `gcloud config set project kna-wiki-a1b2` 또는 `--billing-project=kna-wiki-a1b2` 추가 |
| `PERMISSION_DENIED` | Billing Account Administrator 가 아닌 계정이다. 소유자 계정으로 `gcloud auth login` |
| `Currency code ... does not match` | 2번으로 돌아가 결제 계정의 통화로 금액을 쓴다 |

## state에 쓸 것

금액은 USD 로 쓴다(결제 통화가 다르면 환산값).

```bash
node .claude/skills/kna-status/state.mjs set '{"gcp":{"budget_usd":40}}'
node .claude/skills/kna-status/state.mjs step 02 done
```

### 건너뛰기

```bash
node .claude/skills/kna-status/state.mjs set '{"gcp":{"budget_usd":null}}'
node .claude/skills/kna-status/state.mjs step 02 skipped
```

나중에 `kna-02-budget` 으로 다시 할 수 있고, 콘솔 **Billing > Budgets & alerts** 에서 직접 만들 수도 있다고 알려준다.

## 다음 단계

`kna-03-vm`: 고정 IP, VM, 방화벽, 기본 설정. 처음으로 돈이 드는 단계다. 시작하기 전에 묻는다.
