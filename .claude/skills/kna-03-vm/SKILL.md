---
name: kna-03-vm
description: fresh 모드에서 kna-01-gcp-account(와 kna-02-budget 또는 그 건너뛰기)가 끝난 뒤 knowanywhere 03단계를 진행할 때 쓴다. 프로젝트 역할이 없는 전용 서비스 계정 outline-vm 을 만들고, 고정 IP 를 예약하고, 방화벽 80/443 을 열고, outline-vm 을 --scopes=cloud-platform 으로 붙인 e2-medium Debian 12 30GB pd-balanced VM 을 만든 뒤 SSH 로 패키지 업데이트, 시간대, 2GB swap 과 vm.swappiness=10, Docker Engine 과 compose plugin 설치를 한다.
---

# 03단계: VM

사용자가 쓰는 언어로 말한다. 명령과 키 이름은 원문 그대로 둔다.
콘솔 클릭 경로가 있는 안내서: `docs/steps/03-vm.md`. 이 스킬은 단독으로 동작한다. `gcp-*` 도우미 스킬은 선택이며 없어도 된다.

## 목표

고정 공인 IP, 열린 80/443 포트, swap, Docker 를 갖춘 VM 한 대. VM 에는 프로젝트 역할이 하나도 없는 전용 서비스 계정
`outline-vm` 이 붙는다. 06단계가 여기서 `docker compose` 로 위키를 띄우고, 11단계가 이 계정에 backups 버킷 쓰기 권한
하나만 준다.

## 필요한 state 키

- `steps.01.status` 가 `done`. `gcp.project_id`, `gcp.region`, `gcp.zone` 을 읽는다.

```bash
node .claude/skills/kna-status/state.mjs get gcp
```

- 아래에서 `P` 는 프로젝트 ID, `R` 은 region, `Z` 는 zone 이다. 모든 명령에 실제 값을 넣는다(도구 호출 사이에 셸
  변수가 유지되지 않는다).

## 물을 것

1. VM 이름. 기본값 `kna-wiki-vm`. 고정 IP 이름은 `kna-wiki-ip`, 서비스 계정 이름은 `outline-vm` 으로 한다.
2. VM 시간대(로그와 백업 일정에 쓰인다). 기본값은 이 컴퓨터의 시간대다.
   macOS 는 `readlink /etc/localtime | sed 's#.*/zoneinfo/##'`, Linux 는 `timedatectl show -p Timezone --value`.
3. 비용 확인. 무엇이든 만들기 전에 이 표를 보여주고 yes 를 받는다.

   | 리소스 | 월 USD, 대략 |
   |---|---|
   | e2-medium VM(공유 vCPU 2개, 4 GB), 24시간 | 25(us-central1) ~ 31(asia-northeast3) |
   | 30 GB pd-balanced 부팅 디스크 | 3 ~ 4 |
   | 고정 외부 IP, VM 에 붙어 있을 때 | 약 3.65(예약만 하고 붙이지 않으면 약 7.30) |
   | 서비스 계정 `outline-vm` | 무료 |

   체험 기간에는 무료 크레딧에서 나간다. 가격은 리전마다 다르고 바뀐다.

## 절차

### 1. 이전 실행의 흔적 찾기

```bash
gcloud compute instances list --project=P --format="table(name,zone.basename(),status,serviceAccounts[0].email,networkInterfaces[0].accessConfigs[0].natIP)"
gcloud compute addresses list --project=P --format="table(name,region.basename(),address,status)"
gcloud iam service-accounts list --project=P --format="table(email,disabled)"
```

`kna-wiki-vm`, `kna-wiki-ip`, `outline-vm@P.iam.gserviceaccount.com` 이 이미 있으면 새로 만들지 않고 재사용하며, 아래에서
해당 명령을 건너뛴다. 이미 있는 `kna-wiki-vm` 의 서비스 계정이 `outline-vm` 이 아니면(예: `<번호>-compute@developer.gserviceaccount.com`)
아래 "기존 VM 의 서비스 계정 바꾸기"를 한다.

### 2. VM 전용 서비스 계정 (무료)

새 개인 프로젝트에서는 기본 Compute 서비스 계정(`<번호>-compute@developer.gserviceaccount.com`)에 프로젝트 Editor 역할이
붙어 있다. 그 계정을 VM 에 붙이면 VM 안의 프로세스가 metadata 서버에서 받은 토큰으로 프로젝트의 거의 모든 것을 읽고
바꿀 수 있다. 그래서 VM 에는 역할이 없는 전용 계정을 붙인다.

```bash
gcloud iam service-accounts create outline-vm --project=P --display-name="knowanywhere wiki VM (no project roles)"
```

이 계정에는 `gcloud projects add-iam-policy-binding` 으로 역할을 주지 **않는다**. 권한은 11단계가 backups 버킷 하나에만
준다(`roles/storage.objectCreator`). 사용자에게 이렇게 설명한다: VM 의 access scope 는 `cloud-platform`(모든 API)으로
넓게 두지만, scope 는 토큰이 부를 수 있는 API 의 상한일 뿐이고 실제로 무엇을 할 수 있는지는 그 계정의 IAM 역할이
정한다. 역할이 없는 계정은 scope 가 넓어도 이 프로젝트의 리소스에 아무것도 하지 못한다. scope 를 넓게 두는 이유는,
scope 를 바꾸려면 VM 을 멈춰야 하지만 IAM 역할은 VM 을 켠 채로 더하고 뺄 수 있기 때문이다.

### 3. 고정 IP 예약 (돈이 든다: 묻는다)

```bash
gcloud compute addresses create kna-wiki-ip --project=P --region=R
gcloud compute addresses describe kna-wiki-ip --project=P --region=R --format="value(address)"
```

출력된 주소가 `vm.ip` 다(예 `203.0.113.10`).

### 4. 80, 443 방화벽 (무료)

새 프로젝트의 `default` 네트워크는 SSH(22)는 허용하지만 HTTP/HTTPS 는 막는다. 먼저 확인한다.

```bash
gcloud compute firewall-rules list --project=P \
  --format="table(name,network.basename(),direction,sourceRanges.list(),allowed[].map().firewall_rule().list(),targetTags.list())"
```

없는 규칙만 만든다(콘솔의 HTTP/HTTPS 체크박스가 만드는 규칙과 이름이 같다).

```bash
gcloud compute firewall-rules create default-allow-http --project=P --network=default \
  --direction=INGRESS --action=ALLOW --rules=tcp:80 --source-ranges=0.0.0.0/0 --target-tags=http-server
gcloud compute firewall-rules create default-allow-https --project=P --network=default \
  --direction=INGRESS --action=ALLOW --rules=tcp:443 --source-ranges=0.0.0.0/0 --target-tags=https-server
```

80번도 필요하다. Caddy 가 Let's Encrypt HTTP challenge 와 HTTPS redirect 에 쓴다.
`gcloud compute networks list --project=P` 에 `default` 네트워크가 없으면 멈추고 사용자에게 알린다(조직 정책이 막았을 수
있다). 네트워크 생성은 이 단계 범위 밖이다.

### 5. VM 만들기 (돈이 든다: 묻는다)

```bash
gcloud compute instances create kna-wiki-vm \
  --project=P --zone=Z \
  --machine-type=e2-medium \
  --image-family=debian-12 --image-project=debian-cloud \
  --boot-disk-size=30GB --boot-disk-type=pd-balanced \
  --address=203.0.113.10 \
  --tags=http-server,https-server \
  --service-account=outline-vm@P.iam.gserviceaccount.com \
  --scopes=cloud-platform
```

`--address` 에는 3에서 받은 IP 를 넣는다. `--service-account` 가 기본 Compute 서비스 계정 대신 2의 `outline-vm` 을 붙인다.
`--scopes=cloud-platform` 은 11단계에서 backups 버킷 권한을 더할 때 VM 을 멈추지 않아도 되게 한다. 권한 자체는 역할이
정하므로 이 scope 로 VM 이 할 수 있는 일이 늘지 않는다. Outline 자체는 HMAC 키로 uploads 버킷에 접근한다(06단계).

기대 출력: `STATUS` 가 `RUNNING` 이고 `EXTERNAL_IP` 가 예약한 주소인 행.
`Quota 'CPUS' exceeded` 나 `ZONE_RESOURCE_POOL_EXHAUSTED` 는 같은 region 의 다른 zone(`-b`, `-c`)으로 다시 시도한다.
서비스 계정이 `not found` 로 나오면 2에서 방금 만든 계정이 아직 전파되지 않은 것이다. 30초 뒤 다시 한다.

### 6. 첫 SSH (SSH 키가 만들어진다)

만든 뒤 30초쯤 기다렸다가:

```bash
gcloud compute ssh kna-wiki-vm --project=P --zone=Z --quiet --command='whoami && uname -a'
```

`--quiet` 는 gcloud 가 `~/.ssh/google_compute_engine` 을 passphrase 질문 없이 만들게 한다(도구 호출은 질문에 답할 수
없다). passphrase 를 원하면 사용자가 자기 터미널에서 `gcloud compute ssh kna-wiki-vm --zone=Z` 를 먼저 한 번 실행하게
한다. `whoami` 가 출력한 첫 줄이 `vm.ssh_user` 다. SSH 가 timeout 이면 1분 기다렸다 다시 한다.

### 7. SSH 로 기본 설정

하나씩 실행하고 출력을 보여준다. 모두 다시 실행해도 안전하다.

```bash
# 업데이트
gcloud compute ssh kna-wiki-vm --project=P --zone=Z --command='sudo apt-get update && sudo DEBIAN_FRONTEND=noninteractive apt-get -y -o Dpkg::Options::=--force-confold upgrade'
```

```bash
# 시간대 (사용자가 고른 값)
gcloud compute ssh kna-wiki-vm --project=P --zone=Z --command='sudo timedatectl set-timezone Asia/Seoul && timedatectl | grep "Time zone"'
```

```bash
# 2 GB swap + 낮은 swappiness (Outline, Postgres, Redis 가 4 GB RAM 을 나눠 쓴다)
gcloud compute ssh kna-wiki-vm --project=P --zone=Z --command='if ! sudo swapon --show | grep -q /swapfile; then sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile; fi; grep -q "^/swapfile " /etc/fstab || echo "/swapfile none swap sw 0 0" | sudo tee -a /etc/fstab; echo "vm.swappiness=10" | sudo tee /etc/sysctl.d/99-knowanywhere-swap.conf && sudo sysctl -p /etc/sysctl.d/99-knowanywhere-swap.conf'
```

```bash
# Docker Engine + compose plugin (Docker 공식 설치 스크립트), SSH 사용자를 docker 그룹에 추가
gcloud compute ssh kna-wiki-vm --project=P --zone=Z --command='command -v docker >/dev/null || (curl -fsSL https://get.docker.com -o /tmp/get-docker.sh && sudo sh /tmp/get-docker.sh); sudo usermod -aG docker "$USER"'
```

### 기존 VM 의 서비스 계정 바꾸기 (1에서 필요할 때만)

이전 실행이나 콘솔에서 만든 VM 이 기본 Compute 서비스 계정을 쓰고 있으면 `outline-vm` 으로 바꾼다. VM 을 멈춰야 하므로
몇 분 동안 VM(과 이미 띄운 위키)이 내려간다고 알리고 yes 를 받은 뒤 차례로 실행한다. 컨테이너는
`restart: unless-stopped` 라 부팅 뒤 다시 뜬다.

```bash
gcloud compute instances stop kna-wiki-vm --project=P --zone=Z
gcloud compute instances set-service-account kna-wiki-vm --project=P --zone=Z --service-account=outline-vm@P.iam.gserviceaccount.com --scopes=cloud-platform
gcloud compute instances start kna-wiki-vm --project=P --zone=Z
```

### 되돌리고 싶을 때

사용자가 분명히 요청할 때만, 명령을 보여준 뒤 실행한다(데이터가 지워진다). 붙어 있지 않은 예약 IP 는 계속 요금이 나간다.

```bash
gcloud compute instances delete kna-wiki-vm --project=P --zone=Z
gcloud compute addresses delete kna-wiki-ip --project=P --region=R
gcloud iam service-accounts delete outline-vm@P.iam.gserviceaccount.com --project=P
```

## 검증

새 SSH 세션은 docker 그룹을 반영하므로, 이 명령은 사용자가 sudo 없이 Docker 를 쓸 수 있다는 것도 확인한다.

```bash
gcloud compute ssh kna-wiki-vm --project=P --zone=Z --command='docker --version && docker compose version && docker run --rm hello-world | grep -m1 "Hello from Docker" && free -h && swapon --show && cat /proc/sys/vm/swappiness && timedatectl | grep "Time zone"'
```

기대 출력: Docker 와 Compose 버전, `Hello from Docker!`, 약 `2.0Gi` 인 `Swap:` 줄, `/swapfile` 항목, `10`, 고른 시간대.
바깥에서 IP 와 서비스 계정도 확인한다.

```bash
gcloud compute instances describe kna-wiki-vm --project=P --zone=Z --format="value(status,networkInterfaces[0].accessConfigs[0].natIP,serviceAccounts[0].email,serviceAccounts[0].scopes.list())"
```

기대 출력: `RUNNING`, 예약한 IP, `outline-vm@P.iam.gserviceaccount.com`, `https://www.googleapis.com/auth/cloud-platform`.

마지막으로 `outline-vm` 에 프로젝트 역할이 없는지 확인한다. 이 설계의 전제다.

```bash
gcloud projects get-iam-policy P --flatten="bindings[].members" --filter="bindings.members:serviceAccount:outline-vm@P.iam.gserviceaccount.com" --format="value(bindings.role)"
```

기대 출력: **아무것도 출력되지 않는다.** 역할이 한 줄이라도 나오면(예: `roles/editor`) 누가 이 계정에 프로젝트 역할을
준 것이다. 사용자에게 보여주고, 그 역할을 빼는 명령
(`gcloud projects remove-iam-policy-binding P --member=serviceAccount:outline-vm@P.iam.gserviceaccount.com --role=<역할>`)을
보여준 뒤 yes 를 받고 실행한다. 위 결과가 모두 맞기 전에는 단계를 done 으로 쓰지 않는다.

## state에 쓸 것

```bash
node .claude/skills/kna-status/state.mjs set '{"vm":{"name":"kna-wiki-vm","zone":"asia-northeast3-a","ip":"203.0.113.10","ssh_user":"rose","service_account":"outline-vm@kna-wiki-a1b2.iam.gserviceaccount.com"}}'
node .claude/skills/kna-status/state.mjs step 03 done
```

출력된 조각을 보여준다.

## 다음 단계

`kna-04-dns`: 이 IP 를 가리키는 위키 호스트 이름을 정한다. 시작하기 전에 묻는다.
