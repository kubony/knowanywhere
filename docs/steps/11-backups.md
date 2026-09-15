# 11단계: 백업과 복원 훈련

스킬: `kna-11-backups`. `fresh` 모드만. fresh 설치의 마지막 단계다.

위키 백업은 두 겹이다. 둘 다 매일 자동으로 돈다.

| 백업 | 무엇이 들어 있나 | 언제 | 보관 | 이럴 때 쓴다 |
|---|---|---|---|---|
| 디스크 스냅샷 | VM 부팅 디스크 전체: `/opt/outline/.env`, Docker 볼륨(DB, Redis, 인증서), VM 설정 | 매일 03:00 (VM 시간대) | 7일 | VM 이 망가졌거나 지워졌다 |
| DB 덤프 | `pg_dump` 로 뜬 위키 DB 전체(`.sql.gz`) | 매일 03:30 (VM 시간대) | VM 안 30일, backups 버킷 30일 | 문서를 잘못 지웠다, 업그레이드가 잘못됐다, 다른 곳에 옮긴다 |

첨부 파일과 이미지는 두 백업 어디에도 없다. uploads 버킷에 따로 있고, Outline 이 DB 의 경로로 가리킨다.

비용: 스냅샷 7개(증분)는 월 약 $1 ~ 2, 덤프 30일치는 월 $0.50 미만이다([구조 문서](../architecture.md#비용)).

## 인스톨러가 하는 일

아래 예시 값은 내 값으로 바꿔 읽는다: 프로젝트 `kna-wiki-a1b2`, region `asia-northeast3`, VM `kna-wiki-vm`, zone
`asia-northeast3-a`, backups 버킷 `kna-wiki-a1b2-backups`, 위키 주소 `wiki.example.com`.

**1. 스냅샷 정책.** 03단계에서 VM 시간대를 내 시간대로 맞췄다. 스냅샷 정책의 시작 시각은 UTC 로 적으므로, 인스톨러가
VM 시간대의 03:00 을 UTC 로 바꿔 넣는다. 서울(UTC+9)이면 `18:00` 이다.

```bash
gcloud compute resource-policies create snapshot-schedule kna-daily-snapshot --project=kna-wiki-a1b2 --region=asia-northeast3 --start-time=18:00 --daily-schedule --max-retention-days=7 --on-source-disk-delete=apply-retention-policy --description="knowanywhere: daily boot disk snapshot"
gcloud compute disks add-resource-policies kna-wiki-vm --project=kna-wiki-a1b2 --zone=asia-northeast3-a --resource-policies=kna-daily-snapshot
```

`apply-retention-policy` 는 디스크가 지워진 뒤에도 이미 만든 스냅샷을 7일 동안 남긴다.

**2. 덤프 권한.** 03단계에서 VM 에 붙인 전용 서비스 계정 `outline-vm` 에 backups 버킷의 `roles/storage.objectCreator`
를 준다. 새 파일을 올릴 수만 있고, 기존 덤프를 읽거나 덮어쓰거나 지우지는 못한다. `outline-vm` 에는 프로젝트 역할이
없으므로 이것이 VM 이 가진 GCP 권한 전부이고, VM 이 털려도 지난 덤프는 남는다. VM 이 프로젝트 Editor 역할이 붙은 기본
Compute 서비스 계정을 쓰고 있으면 이 권한을 더해도 VM 의 권한이 줄지 않으므로, 인스톨러가 먼저 `outline-vm` 으로 바꾸자고
한다(VM 을 몇 분 멈춘다).

```bash
gcloud storage buckets add-iam-policy-binding gs://kna-wiki-a1b2-backups --project=kna-wiki-a1b2 --member=serviceAccount:outline-vm@kna-wiki-a1b2.iam.gserviceaccount.com --role=roles/storage.objectCreator
```

**3. 덤프 스크립트와 cron.** `deploy/outline/pg-backup.sh` 를 VM 의 `/usr/local/bin/outline-pg-backup` 으로 설치하고
`/etc/cron.d/outline-backup` 을 쓴다.

```
30 3 * * * root /usr/local/bin/outline-pg-backup >> /var/log/outline-backup.log 2>&1
```

스크립트는 `outline-postgres` 컨테이너 안에서 `pg_dump --clean --if-exists` 를 돌려 gzip 으로 묶고, 4096 바이트보다
작으면 실패로 본다. 결과는 `/var/backups/outline/outline-<UTC 시각>.sql.gz`(mode 600)와
`gs://kna-wiki-a1b2-backups/postgres/` 두 곳에 남는다. 버킷 이름은 `/opt/outline/.env` 의 `BACKUP_BUCKET` 에서 읽는다.

**4. 지금 한 번 실행.**

```bash
gcloud compute ssh kna-wiki-vm --project=kna-wiki-a1b2 --zone=asia-northeast3-a --command='sudo /usr/local/bin/outline-pg-backup'
gcloud storage ls -l gs://kna-wiki-a1b2-backups/postgres/ --project=kna-wiki-a1b2
```

```
OK local: /var/backups/outline/outline-20260915-091500.sql.gz (48213 bytes)
OK uploaded: gs://kna-wiki-a1b2-backups/postgres/outline-20260915-091500.sql.gz
```

## 확인

덤프는 위 4에서 확인했다. 스냅샷은 첫 예약 시각이 지나야 생긴다. 다음 날 이 레포에서 `claude` 를 다시 열면 인스톨러가
11단계 확인부터 이어서 한다.

```bash
gcloud compute snapshots list --project=kna-wiki-a1b2 --filter="sourceDisk~/kna-wiki-vm$ AND autoCreated=true" --format="table(name,creationTimestamp,status,storageBytes)"
gcloud compute ssh kna-wiki-vm --project=kna-wiki-a1b2 --zone=asia-northeast3-a --command='sudo tail -5 /var/log/outline-backup.log'
```

`status` 가 `READY` 인 스냅샷이 한 줄 이상 있고, 로그에 03:30 의 `OK uploaded:` 줄이 있으면 된다. 그때 인스톨러가
`backup.verified_at` 을 쓰고 11단계를 `done` 으로 표시한다.

콘솔에서는 **Navigation menu**(☰) > **Compute Engine** > **Snapshots** 에서 스냅샷을, **Snapshots** 화면의
**Snapshot schedules** 탭에서 정책을 본다. 덤프는 **Cloud Storage** > **Buckets** > `kna-wiki-a1b2-backups` > `postgres/`.

## 복원 훈련

백업은 복원해 본 적이 있어야 믿을 수 있다. 이 훈련은 버킷에 있는 덤프를 **새 Compose 스택**에 복원해 보고, 문서 수를
운영 위키와 비교한다. 운영 위키(`/opt/outline`)는 건드리지 않는다. 설치 직후 한 번, 그 뒤로는 몇 달에 한 번 하면 좋다.

훈련 스택은 프로젝트 이름이 `outline-drill` 이고, 컨테이너 이름을 고정하지 않고, 포트를 열지 않는다. 운영 스택의 이름
(`outline`), 볼륨(`outline_pgdata`), 컨테이너 이름(`outline-postgres`), 포트(80, 443)와 겹치지 않는다. 운영 키트의
`docker-compose.yml` 을 그대로 쓰면 이 이름들이 겹쳐 운영 DB 볼륨을 건드리게 되므로 쓰지 않는다.

### 1. 버킷에서 덤프 받기 (노트북)

VM 은 backups 버킷을 읽을 수 없으므로(쓰기만 된다) 노트북에서 받아 VM 으로 보낸다. 이 과정이 "버킷의 사본으로 되살릴
수 있는가"를 확인하는 부분이다. 덤프에는 위키 내용 전부가 들어 있으니 끝나면 지운다.

```bash
gcloud storage ls gs://kna-wiki-a1b2-backups/postgres/ --project=kna-wiki-a1b2 | tail -1
gcloud storage cp gs://kna-wiki-a1b2-backups/postgres/outline-20260916-183000.sql.gz . --project=kna-wiki-a1b2
gcloud compute ssh kna-wiki-vm --project=kna-wiki-a1b2 --zone=asia-northeast3-a --command='mkdir -p ~/outline-drill'
gcloud compute scp --project=kna-wiki-a1b2 --zone=asia-northeast3-a outline-20260916-183000.sql.gz kna-wiki-vm:~/outline-drill/
rm outline-20260916-183000.sql.gz
```

### 2. 훈련 스택 만들기 (VM)

`gcloud compute ssh kna-wiki-vm --project=kna-wiki-a1b2 --zone=asia-northeast3-a` 로 VM 에 들어가서:

```bash
cd ~/outline-drill
grep 'image: outlinewiki' /opt/outline/docker-compose.yml     # 운영과 같은 태그를 아래에 쓴다
cat > docker-compose.yml <<'EOF'
# Restore drill only. Own project name, no fixed container names, no ports.
name: outline-drill
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: outline
      POSTGRES_PASSWORD: drill-only
      POSTGRES_DB: outline
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U outline -d outline"]
      interval: 5s
      timeout: 5s
      retries: 30
  redis:
    image: redis:7-alpine
    profiles: ["app"]
  outline:
    image: outlinewiki/outline:1.10.1
    profiles: ["app"]
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started
    environment:
      NODE_ENV: production
      URL: http://localhost:3000
      SECRET_KEY: ${DRILL_SECRET_KEY:?}
      UTILS_SECRET: ${DRILL_UTILS_SECRET:?}
      DATABASE_URL: postgres://outline:drill-only@postgres:5432/outline
      PGSSLMODE: disable
      REDIS_URL: redis://redis:6379
      FORCE_HTTPS: "false"
      FILE_STORAGE: local
EOF
printf 'DRILL_SECRET_KEY=%s\nDRILL_UTILS_SECRET=%s\n' "$(openssl rand -hex 32)" "$(openssl rand -hex 32)" > .env && chmod 600 .env
docker compose up -d --wait postgres
```

`drill-only` 와 새로 만든 두 값은 이 훈련 스택에서만 쓰는 값이다. 운영 `.env` 의 값을 가져오지 않는다.

### 3. 복원하고 비교하기 (VM)

```bash
gunzip -c outline-*.sql.gz | docker compose exec -T postgres psql -U outline -d outline -v ON_ERROR_STOP=1 -q
Q='SELECT (SELECT count(*) FROM documents WHERE "deletedAt" IS NULL) AS documents, (SELECT count(*) FROM collections WHERE "deletedAt" IS NULL) AS collections, (SELECT count(*) FROM users) AS users, (SELECT max("updatedAt") FROM documents) AS last_edit;'
docker compose exec -T postgres psql -U outline -d outline -c "$Q"      # 훈련 스택
docker exec outline-postgres psql -U outline -d outline -c "$Q"         # 운영 (읽기만)
```

첫 줄은 `NOTICE: ... does not exist, skipping` 을 여러 번 출력할 수 있다. 빈 DB 에 `DROP ... IF EXISTS` 를 하기 때문이고
정상이다. `ERROR` 가 나오면 복원이 멈춘 것이다.

훈련 스택의 `documents`, `collections`, `users` 는 운영과 같거나, 덤프 뒤에 새로 쓴 만큼 적어야 한다. `last_edit` 는
덤프 파일 이름의 시각(UTC)보다 늦을 수 없다.

### 4. (선택) 복원한 DB 로 Outline 띄워 보기 (VM)

같은 버전의 Outline 이 복원한 DB 로 부팅하는지 본다. 운영 스택 옆에 Outline 을 하나 더 띄우는 것이므로, `free -h` 의
available 과 swap 여유를 합쳐 1 GB 가 안 되면 건너뛴다. 이 Outline 은 포트도 로그인 수단도 없고, 첨부 파일은 로컬 디스크를 쓴다.
운영 버킷과 Google 로그인에 닿지 않는다.

```bash
docker compose --profile app up -d
for i in $(seq 1 30); do docker compose exec -T outline wget -qO- http://localhost:3000/_health 2>/dev/null && break; sleep 10; done; echo
docker compose logs outline | grep -iE "error|migrat" | tail -20
```

`OK` 가 출력되면 된다. 5분이 지나도 `OK` 가 없으면 로그의 에러를 본다.

### 5. 치우기 (VM)

```bash
cd ~/outline-drill && docker compose --profile app down -v && cd ~ && rm -rf ~/outline-drill
docker volume ls | grep outline
```

마지막 줄에 운영 볼륨 네 개(`outline_pgdata`, `outline_redisdata`, `outline_caddy_data`, `outline_caddy_config`)가 그대로
보여야 한다. 훈련 스택의 볼륨은 이름 없는(anonymous) 볼륨이라 `down -v` 가 함께 지운다. `down -v` 는 반드시
`~/outline-drill` 에서만 실행한다. `/opt/outline` 에서 실행하면 운영 DB 가 지워진다.

훈련한 날짜와 3의 숫자를 위키에 적어 두면 다음 훈련 때 비교할 수 있다.

## 운영 위키에 복원하기 (Restore into production)

문서를 대량으로 잘못 지웠거나 업그레이드가 잘못돼 되돌릴 때 쓴다. 덤프 시각 이후에 쓴 내용은 사라진다. 먼저 복원 훈련
1~3으로 쓸 덤프가 멀쩡한지 확인하는 편이 안전하다. VM 에서:

```bash
sudo ls -lt /var/backups/outline | head -5                      # 되돌릴 덤프를 고른다
sudo bash /opt/outline/pg-backup.sh --local-only                 # 지금 상태를 먼저 덤프로 남긴다
cd /opt/outline
docker compose stop outline
sudo gunzip -c /var/backups/outline/outline-20260916-183000.sql.gz | docker exec -i outline-postgres psql -U outline -d outline -v ON_ERROR_STOP=1 --single-transaction -q
docker exec outline-redis redis-cli FLUSHALL
docker compose up -d outline
docker compose ps
curl -s https://wiki.example.com/_health; echo
```

- `--single-transaction` 이라 중간에 에러가 나면 아무것도 바뀌지 않는다.
- Redis 의 캐시와 대기 중인 작업은 복원 전 DB 를 가리키므로 `FLUSHALL` 로 비운다.
- 업그레이드를 되돌리는 경우에는 `docker compose up -d outline` 전에 `upgrade.sh` 가 남긴
  `docker-compose.yml.bak.<시각>` 을 `docker-compose.yml` 로 되돌린다. 새 버전의 마이그레이션이 적용된 DB 를 옛 버전이
  읽지 못할 수 있기 때문에, 업그레이드 직전 덤프(`upgrade.sh` 가 출력한 파일)를 복원한다.
- VM 로컬에 없는 덤프는 복원 훈련 1의 방법으로 버킷에서 받아 VM 에 올린다.

Outline 은 일부 값을 `.env` 의 `SECRET_KEY` 로 암호화해 DB 에 둔다. 같은 VM 에 복원하면 문제가 없다. 새 VM 에 복원할 때는
옛 `.env`(스냅샷에 들어 있다)의 `SECRET_KEY` 를 그대로 써야 암호화된 값을 읽을 수 있다.

## 스냅샷으로 VM 되살리기

VM 의 디스크가 망가졌을 때 쓴다. 디스크를 새로 만들므로 돈이 들고, 옛 디스크를 떼어 낸다. 인스톨러에게 도와 달라고 하면
명령마다 먼저 확인받는다. 부팅 디스크 이름은 보통 VM 이름과 같다(`kna-wiki-vm`).

```bash
gcloud compute snapshots list --project=kna-wiki-a1b2 --filter="sourceDisk~/kna-wiki-vm$" --sort-by=~creationTimestamp --format="table(name,creationTimestamp,status)"
gcloud compute disks create kna-wiki-vm-restored --project=kna-wiki-a1b2 --zone=asia-northeast3-a --source-snapshot=<스냅샷 이름> --type=pd-balanced
gcloud compute instances stop kna-wiki-vm --project=kna-wiki-a1b2 --zone=asia-northeast3-a
gcloud compute instances detach-disk kna-wiki-vm --project=kna-wiki-a1b2 --zone=asia-northeast3-a --disk=kna-wiki-vm
gcloud compute instances attach-disk kna-wiki-vm --project=kna-wiki-a1b2 --zone=asia-northeast3-a --disk=kna-wiki-vm-restored --boot
gcloud compute instances start kna-wiki-vm --project=kna-wiki-a1b2 --zone=asia-northeast3-a
gcloud compute disks add-resource-policies kna-wiki-vm-restored --project=kna-wiki-a1b2 --zone=asia-northeast3-a --resource-policies=kna-daily-snapshot
```

마지막 줄은 새 디스크에도 매일 스냅샷을 붙인다. 위키가 되살아난 것을 확인한 뒤 옛 디스크 `kna-wiki-vm` 을 지운다
(`gcloud compute disks delete kna-wiki-vm --project=kna-wiki-a1b2 --zone=asia-northeast3-a`). 붙어 있지 않은 디스크도 요금이 나간다.

VM 자체를 지웠다면 `gcloud compute instances create kna-wiki-vm --project=kna-wiki-a1b2 --zone=asia-northeast3-a` 에 `--disk=name=kna-wiki-vm-restored,boot=yes` 를 주고, 나머지
옵션은 [03단계](03-vm.md)와 같게(`--machine-type=e2-medium`, `--address=<고정 IP>`, `--tags=http-server,https-server`,
`--service-account=outline-vm@kna-wiki-a1b2.iam.gserviceaccount.com`, `--scopes=cloud-platform`) 새 VM 을 만든다. 고정 IP 는 예약해 둔 것을 그대로 쓰므로 DNS 는 바꾸지 않아도 된다.

## 백업 끄기

```bash
gcloud compute disks remove-resource-policies kna-wiki-vm --project=kna-wiki-a1b2 --zone=asia-northeast3-a --resource-policies=kna-daily-snapshot
gcloud compute resource-policies delete kna-daily-snapshot --project=kna-wiki-a1b2 --region=asia-northeast3
gcloud compute ssh kna-wiki-vm --project=kna-wiki-a1b2 --zone=asia-northeast3-a --command='sudo rm /etc/cron.d/outline-backup'
```

이미 만든 스냅샷과 버킷의 덤프는 남는다. 스냅샷은 `gcloud compute snapshots delete <스냅샷 이름> --project=kna-wiki-a1b2`, 덤프는 30일 lifecycle 로 사라진다.

## 기록되는 것

```bash
node .claude/skills/kna-status/state.mjs set '{"backup":{"snapshot_policy":"kna-daily-snapshot"}}'
node .claude/skills/kna-status/state.mjs set '{"backup":{"verified_at":"2026-09-16T03:40:00Z"}}'
node .claude/skills/kna-status/state.mjs step 11 done
```

`verified_at` 은 스냅샷과 덤프를 둘 다 확인한 뒤에만 쓴다.

## 다음

`fresh` 설치가 끝났다. `/kna-status` 로 전체 진행을 본다. 다른 머신이나 에이전트를 붙이려면 인스톨러에게
`kna-12-add-agent` 를 하자고 말한다.
