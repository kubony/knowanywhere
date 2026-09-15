# 02단계: 예산과 알림

스킬: `kna-02-budget`. `fresh` 모드만. 권장하지만 건너뛸 수 있다.

예산은 위키 프로젝트의 이번 달 지출이 내가 정한 금액의 50%, 90%, 100% 를 넘을 때 이메일을 보낸다. 지출에 상한을 걸지
않고 VM 을 멈추지도 않는다. 청구서에 놀라지 않게 하는 것이 역할이다.

## 크레딧을 빼고 계산하는 이유

기본 설정에서 Google 은 무료 크레딧을 먼저 빼고 지출을 예산과 비교한다. 그러면 체험 기간에는 지출이 $0 으로 보여서
크레딧이 다 떨어질 때까지 알림이 오지 않는다. 인스톨러는 크레딧을 제외하고 예산을 만든다. 그래서 크레딧이 요금을 대신
내는 동안에도 위키가 실제로 한 달에 얼마를 쓰는지가 알림에 반영된다.

## 금액 정하기

예상 월 비용은 리전에 따라 약 $33 에서 $40 이다([구조 문서](../architecture.md#비용)). 예산을 **$40** 로 두면 평범한 달에는
월 중순쯤 50% 알림이 오고, 100% 알림은 무언가 잘못됐을 때(예: 잊고 둔 VM 한 대 더)만 온다. 결제 계정이 KRW 같은 다른
통화를 쓰면 금액을 그 통화로 넣는다.

## 명령

```bash
# 1. Budget API, 그리고 프로젝트에 연결된 결제 계정
gcloud services enable billingbudgets.googleapis.com --project=kna-wiki-a1b2
gcloud billing projects describe kna-wiki-a1b2 --format="value(billingAccountName)"
#   billingAccounts/XXXXXX-XXXXXX-A1C3D4

# 2. 결제 계정의 통화
gcloud billing accounts describe XXXXXX-XXXXXX-A1C3D4 --format="value(currencyCode)"

# 3. 예산
gcloud billing budgets create \
  --billing-account=XXXXXX-XXXXXX-A1C3D4 \
  --display-name="knowanywhere monthly" \
  --budget-amount=40USD \
  --calendar-period=month \
  --filter-projects=projects/kna-wiki-a1b2 \
  --credit-types-treatment=exclude-all-credits \
  --threshold-rule=percent=0.5 \
  --threshold-rule=percent=0.9 \
  --threshold-rule=percent=1.0
```

통화가 `KRW` 면 `--budget-amount=55000KRW` 처럼 쓴다.

## 확인

```bash
gcloud billing budgets list --billing-account=XXXXXX-XXXXXX-A1C3D4 \
  --format="table(displayName,amount.specifiedAmount.units,amount.specifiedAmount.currencyCode,thresholdRules[].thresholdPercent.list())"
```

```
DISPLAY_NAME          UNITS  CURRENCY_CODE  THRESHOLD_PERCENT
knowanywhere monthly  40     USD            0.5,0.9,1.0
```

콘솔에서는 **Navigation menu (☰) > Billing > Budgets & alerts**(예산 및 알림)에서 본다.

## 콘솔에서 직접 만들기

1. **Billing > Budgets & alerts > Create budget**(예산 만들기).
2. 이름 `knowanywhere monthly`. Time range(기간) **Monthly**(월별). Projects(프로젝트)는 위키 프로젝트 하나만.
   Credits(크레딧)는 체크를 모두 풀어 적용하지 않는다.
3. Amount(금액): **Specified amount**(지정 금액), 40.
4. Thresholds(기준점): **Actual**(실제) 기준 50%, 90%, 100%.
5. **Email alerts to billing admins and users**(결제 관리자 및 사용자에게 이메일 알림)를 체크한 채로 두고 **Finish**(완료).

## 건너뛰기

인스톨러는 `gcp.budget_usd: null` 을 기록하고 이 단계를 `skipped` 로 표시한다. 언제든 `kna-02-budget` 으로 돌아와 걸 수 있다.

## 다음

[03단계: VM](03-vm.md)
