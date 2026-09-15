---
name: gcp-billing-accounts
description: "GCP 결제 계정 목록"
---

# GCP 결제 계정 목록

사용 가능한 GCP 결제 계정 목록을 조회합니다.

## 실행할 명령어

```bash
gcloud billing accounts list
```

## 출력 형식

```
## 결제 계정 목록

| ACCOUNT_ID | NAME | OPEN | 용도 |
|------------|------|------|------|
| XXXXXX-XXXXXX-A1C3D4 | My Billing Account | True | 메인 (유료) |
| XXXXXX-XXXXXX-E5F6A7 | Backup Billing Account | True | 개인 (백업) |

---
현재 기본 결제 계정: [프로젝트별로 다름]
```

## 추가 정보

특정 결제 계정의 상세 정보:
```bash
gcloud billing accounts describe ACCOUNT_ID
```

결제 계정에 연결된 프로젝트 보기:
```bash
gcloud billing projects list --billing-account=ACCOUNT_ID
```
