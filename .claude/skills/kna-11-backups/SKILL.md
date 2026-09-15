---
name: kna-11-backups
description: knowanywhere 11단계에 쓴다(fresh 모드의 마지막 단계, kna-09-persona와 선택 단계 kna-10-discord 뒤). 부팅 디스크에 매일 03:00(VM 시간대) 스냅샷 정책을 7일 보관으로 붙이고, VM 전용 서비스 계정 outline-vm 에 backups 버킷의 roles/storage.objectCreator 만 준 뒤, VM에 deploy/outline/pg-backup.sh 를 /usr/local/bin/outline-pg-backup 으로 설치해 매일 03:30 cron으로 DB 덤프를 backups 버킷에 올린다. 지금 한 번 덤프해 `gcloud storage ls` 로 확인하고, 첫 예약 스냅샷까지 확인한 뒤 backup.* 를 쓴다.
---

# 11단계: 백업

사용자와는 사용자가 쓰는 언어로 대화한다. 명령, 경로, 변수명, 에러 메시지는 원문 그대로 둔다.
사람용 안내와 복원 훈련: `docs/steps/11-backups.md`.

## 목표

두 겹의 백업이 매일 자동으로 돌고, 둘 다 실제로 만들어진 것을 확인한 상태.

| 백업 | 무엇을 | 언제 | 보관 |
|---|---|---|---|
| 디스크 스냅샷 (resource policy) | 부팅 디스크 전체(`/opt/outline/.env`, Docker 볼륨 포함) | 매일 03:00 VM 시간대 | 7일 |
| DB 덤프 (`outline-pg-backup`) | `pg_dump` 결과 `.sql.gz`. 첨부 파일은 uploads 버킷에 따로 있다 | 매일 03:30 VM 시간대 | VM 로컬 30일, 버킷 30일(lifecycle) |

## 필요한 state 키

```bash
node .claude/skills/kna-status/state.mjs get gcp
node .claude/skills/kna-status/state.mjs get vm
node .claude/skills/kna-status/state.mjs get wiki.buckets.backups
node .claude/skills/kna-status/state.mjs get backup
```

`steps.06` 이 `done` 이어야 한다. 빠진 키는 그 키를 쓰는 단계 이름과 함께 알리고 멈춘다. 아래 예시 값
(`kna-wiki-a1b2`, `asia-northeast3`, `kna-wiki-vm`, `asia-northeast3-a`, `kna-wiki-a1b2-backups`,
`outline-vm@kna-wiki-a1b2.iam.gserviceaccount.com`)은 state 값으로 바꿔 넣는다. `vm.service_account` 가 없으면 이
설계 전에 03단계를 마친 설치다. 절차 1에서 VM 의 실제 서비스 계정을 보고 정한다. `backup.snapshot_policy` 가 이미 있으면 이전 세션에서 설정을 마치고 첫 스냅샷을 기다리던 것이다.
절차 6과 검증으로 바로 간다.

## 물을 것

한 번에 하나씩 묻는다.

1. **시각.** 기본값: 스냅샷 03:00, 덤프 03:30(둘 다 VM 시간대). 위키를 쓰지 않는 시간이면 된다. 덤프는 스냅샷보다
   늦게 둬서 두 작업이 디스크를 동시에 쓰지 않게 한다.
2. **정책 이름.** 기본값 `kna-daily-snapshot`.
3. **비용 확인.** 스냅샷 7개(증분)는 월 약 $1 ~ 2, 30일치 덤프는 월 $0.50 미만이다(`docs/architecture.md`).
   절차 3의 명령을 보여주고 yes를 받는다.

## 절차

### 1. 현재 상태 확인

```bash
gcloud compute resource-policies list --project=kna-wiki-a1b2 --format="table(name,region.basename(),snapshotSchedulePolicy.schedule.dailySchedule.startTime,snapshotSchedulePolicy.retentionPolicy.maxRetentionDays)"
gcloud compute instances describe kna-wiki-vm --project=kna-wiki-a1b2 --zone=asia-northeast3-a --format="value(disks[0].source.basename(),serviceAccounts[0].email,serviceAccounts[0].scopes.list())"
gcloud compute ssh kna-wiki-vm --project=kna-wiki-a1b2 --zone=asia-northeast3-a --command='timedatectl show -p Timezone --value; command -v gcloud; ls -l /opt/outline/pg-backup.sh /usr/local/bin/outline-pg-backup /etc/cron.d/outline-backup 2>&1'
```

둘째 줄에서 부팅 디스크 이름(보통 VM 이름과 같다), VM 서비스 계정 email, scope 목록을 얻는다. 기대값은
서비스 계정 `outline-vm@kna-wiki-a1b2.iam.gserviceaccount.com`(= `vm.service_account`)과 scope
`https://www.googleapis.com/auth/cloud-platform` 이다(3단계). 3단계가 이 계정에 프로젝트 역할을 주지 않았으므로,
절차 4의 버킷 권한이 VM 이 GCP 에 대해 갖는 권한 전부가 된다.

서비스 계정이 `<번호>-compute@developer.gserviceaccount.com`(기본 Compute 서비스 계정)이면 멈추고 알린다. 새 개인
프로젝트에서 이 계정에는 프로젝트 Editor 역할이 붙어 있어서, 여기에 버킷 권한을 더해도 VM 의 권한은 줄지 않는다.
`kna-03-vm` 의 절차 2(역할 없는 `outline-vm` 만들기)와 "기존 VM 의 서비스 계정 바꾸기"를 먼저 한다. VM 을 멈춰야
하므로 몇 분 위키가 내려간다고 알리고 yes를 받은 뒤 차례로 실행한다(컨테이너는 `restart: unless-stopped` 라 부팅 뒤
다시 뜬다):

```bash
gcloud compute instances stop kna-wiki-vm --project=kna-wiki-a1b2 --zone=asia-northeast3-a
gcloud compute instances set-service-account kna-wiki-vm --project=kna-wiki-a1b2 --zone=asia-northeast3-a --service-account=outline-vm@kna-wiki-a1b2.iam.gserviceaccount.com --scopes=cloud-platform
gcloud compute instances start kna-wiki-vm --project=kna-wiki-a1b2 --zone=asia-northeast3-a
```

바꾼 뒤 `kna-03-vm` 검증 절의 `gcloud projects get-iam-policy` 명령으로 `outline-vm` 에 프로젝트 역할이 없는지 보고,
`node .claude/skills/kna-status/state.mjs set '{"vm":{"service_account":"outline-vm@kna-wiki-a1b2.iam.gserviceaccount.com"}}'`
로 기록한다.

셋째 줄은 VM 시간대(예 `Asia/Seoul`), VM의 `gcloud` 경로, 이미 설치된 파일을 보여준다. `gcloud` 가 없으면
`sudo apt-get install -y google-cloud-cli` 가 필요하다. 이미 있는 정책과 파일은 다시 만들지 않는다.

### 2. 스냅샷 시작 시각을 UTC로 바꾸기

`--start-time` 은 UTC다. VM 시간대의 03:00을 UTC 정시로 바꾼다(이 머신에서 실행한다):

```bash
node -e 'const tz=process.argv[1];const off=new Intl.DateTimeFormat("en-US",{timeZone:tz,timeZoneName:"longOffset"}).formatToParts(new Date()).find((p)=>p.type==="timeZoneName").value;const m=off.match(/([+-])(\d\d):(\d\d)/);const mins=m?(m[1]==="-"?-1:1)*(Number(m[2])*60+Number(m[3])):0;const h=Math.floor((((3*60-mins)%1440)+1440)%1440/60);console.log(tz,off,"03:00 local -> --start-time="+String(h).padStart(2,"0")+":00 UTC")' Asia/Seoul
```

기대 출력: `Asia/Seoul GMT+09:00 03:00 local -> --start-time=18:00 UTC`. 사용자가 다른 시각을 골랐으면 식의 `3` 을
바꾼다. 서머타임이 있는 시간대는 계절에 따라 스냅샷이 현지 시각으로 한 시간 옮겨진다. cron은 VM 시간대를 따르므로
덤프 시각은 그대로다.

### 3. 스냅샷 정책을 만들고 부팅 디스크에 붙이기 (비용 발생, yes 필요)

```bash
gcloud compute resource-policies create snapshot-schedule kna-daily-snapshot --project=kna-wiki-a1b2 --region=asia-northeast3 --start-time=18:00 --daily-schedule --max-retention-days=7 --on-source-disk-delete=apply-retention-policy --description="knowanywhere: daily boot disk snapshot"
gcloud compute disks add-resource-policies kna-wiki-vm --project=kna-wiki-a1b2 --zone=asia-northeast3-a --resource-policies=kna-daily-snapshot
```

`apply-retention-policy` 는 디스크가 지워져도 이미 만든 스냅샷을 7일 동안 남긴 뒤 지운다. VM을 실수로 지웠을 때
7일 안에 되살릴 수 있고, 일부러 정리했을 때 잊힌 스냅샷 요금이 계속 나가지 않는다.

### 4. `outline-vm` 에 backups 버킷 쓰기 권한 (무료)

6단계는 backups 버킷에 `outline-storage` 권한을 주지 않았다. 덤프는 VM의 전용 서비스 계정 `outline-vm` 이 올린다.
새 객체를 만드는 권한만 준다(기존 덤프를 읽거나, 덮어쓰거나, 지우지 못한다):

```bash
gcloud storage buckets add-iam-policy-binding gs://kna-wiki-a1b2-backups --member=serviceAccount:outline-vm@kna-wiki-a1b2.iam.gserviceaccount.com --role=roles/storage.objectCreator
gcloud storage buckets get-iam-policy gs://kna-wiki-a1b2-backups --format="table(bindings.role,bindings.members.list())" --flatten="bindings[]"
```

`--member` 에는 `vm.service_account`(절차 1에서 확인한 email)를 넣는다. 둘째 명령의 출력에서
`roles/storage.objectCreator` 행에 `serviceAccount:outline-vm@...` 가 있는지 보여준다. `outline-vm` 에는 프로젝트
역할이 없으므로 VM 이 털려도 지난 덤프는 남는다. 이 성질은 3단계의 역할 없는 계정 설계에 기대므로, 나중에 누가
`outline-vm` 에 프로젝트 역할을 주면 깨진다.

### 5. 덤프 스크립트와 cron 설치 (VM)

6단계의 `install.sh` 가 `pg-backup.sh` 를 `/opt/outline/` 에 복사해 두었다. 그것을 설치하고 cron 파일을 쓴다.
스크립트는 버킷을 `/opt/outline/.env` 의 `BACKUP_BUCKET` 에서 읽으므로 인자가 필요 없다.

```bash
gcloud compute ssh kna-wiki-vm --project=kna-wiki-a1b2 --zone=asia-northeast3-a --command='sudo install -m 755 /opt/outline/pg-backup.sh /usr/local/bin/outline-pg-backup && (dpkg -s cron >/dev/null 2>&1 || sudo apt-get install -y cron) && printf "%s\n" "# knowanywhere: nightly Outline DB dump, VM local time (timedatectl)" "30 3 * * * root /usr/local/bin/outline-pg-backup >> /var/log/outline-backup.log 2>&1" | sudo tee /etc/cron.d/outline-backup >/dev/null && sudo chmod 644 /etc/cron.d/outline-backup && sudo systemctl restart cron && systemctl is-active cron && cat /etc/cron.d/outline-backup'
```

기대 출력: `active` 와 cron 파일 두 줄. `systemctl restart cron` 은 3단계에서 바꾼 시간대를 cron이 확실히 읽게 한다.
cron 은 VM 현지 시각으로 돌므로 `30 3` 은 현지 03:30 이다(`pg-backup.sh` 머리 주석의 예시와 같다).

### 6. 지금 한 번 덤프하고 버킷에서 확인

```bash
gcloud compute ssh kna-wiki-vm --project=kna-wiki-a1b2 --zone=asia-northeast3-a --command='sudo /usr/local/bin/outline-pg-backup'
gcloud storage ls -l gs://kna-wiki-a1b2-backups/postgres/
```

기대 출력: `OK local: /var/backups/outline/outline-<UTC 시각>.sql.gz (<바이트> bytes)`,
`OK uploaded: gs://kna-wiki-a1b2-backups/postgres/outline-<UTC 시각>.sql.gz`, 그리고 `ls -l` 에 같은 객체와
4096 바이트 이상의 크기.

| 출력 | 원인과 조치 |
|---|---|
| `ERROR: no backups bucket` | `.env` 에 `BACKUP_BUCKET` 이 없다. 6단계 `install.sh` 를 `--backups-bucket` 과 함께 다시 실행한다 |
| `ERROR: dump is only N bytes` | postgres가 비정상이다. `sudo docker compose -f /opt/outline/docker-compose.yml ps` 로 `outline-postgres` 상태를 본다 |
| `403` / `AccessDenied` 로 업로드 실패 | 절차 1의 서비스 계정과 scope, 또는 절차 4의 권한. 권한을 방금 더했으면 반영에 1~2분 걸릴 수 있다. 로컬 덤프는 이미 남았다 |
| `gcloud: command not found` | 절차 1의 `google-cloud-cli` 설치 |

## 검증

```bash
gcloud compute disks describe kna-wiki-vm --project=kna-wiki-a1b2 --zone=asia-northeast3-a --format="value(resourcePolicies.basename())"
gcloud compute resource-policies describe kna-daily-snapshot --project=kna-wiki-a1b2 --region=asia-northeast3 --format="value(snapshotSchedulePolicy.schedule.dailySchedule.startTime,snapshotSchedulePolicy.retentionPolicy.maxRetentionDays)"
gcloud compute snapshots list --project=kna-wiki-a1b2 --filter="sourceDisk~/kna-wiki-vm$ AND autoCreated=true" --format="table(name,creationTimestamp,status,storageBytes)"
```

기대: `kna-daily-snapshot`, `18:00  7`, 그리고 `status` 가 `READY` 인 자동 스냅샷 한 줄 이상. 덤프는 절차 6에서
확인했다. 스냅샷 목록이 비어 있으면 첫 예약 시각이 아직 오지 않은 것이다. 그때는:

1. `backup.snapshot_policy` 만 쓰고 11단계는 `pending` 으로 둔다(아래 첫 명령).
2. 첫 스냅샷이 생길 현지 시각(기본 내일 03:00 이후)을 알려주고, 그 뒤 이 레포에서 `claude` 를 다시 열면 11단계
   검증부터 이어서 한다고 말한다. 그때 `sudo tail -5 /var/log/outline-backup.log` 로 03:30 cron 덤프도 함께 본다.

## state에 쓸 것

```bash
node .claude/skills/kna-status/state.mjs set '{"backup":{"snapshot_policy":"kna-daily-snapshot"}}'
```

스냅샷과 덤프를 둘 다 확인한 뒤에만:

```bash
node .claude/skills/kna-status/state.mjs set '{"backup":{"verified_at":"2026-09-16T03:40:00Z"}}'
node .claude/skills/kna-status/state.mjs step 11 done
```

`verified_at` 은 둘 다 확인한 시각(UTC, `date -u +%Y-%m-%dT%H:%M:%SZ`)이다. helper가 출력한 JSON 조각을 보여준다.

## 다음 단계

```bash
node .claude/skills/kna-status/state.mjs next
```

`complete` 가 나오면 fresh 설치가 끝났다고 알린다. 전체 진행은 `/kna-status` 로 보여준다. 이어서 알릴 것:
복원 훈련 절차가 `docs/steps/11-backups.md` 에 있고 운영 위키는 건드리지 않으니 한 번 해 보기를 권한다.
다른 머신이나 에이전트를 붙이려면 `kna-12-add-agent` 를 쓴다. `next` 가 다른 단계를 가리키면 그 스킬 이름을 말하고
시작 전에 묻는다.
