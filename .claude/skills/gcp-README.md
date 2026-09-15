# gcp-* 도우미 스킬

이 디렉터리의 `gcp-*` 스킬 13개(`gcp-project-setup`, `gcp-projects`, `gcp-billing`, `gcp-billing-accounts`,
`gcp-alerts`, `gcp-vm-create`, `gcp-vm-init`, `gcp-vm-ssh`, `gcp-vm-control`, `gcp-firewall`, `gcp-storage`, `gcp-iam`,
`gcp-snapshot`)는 저자가 [github.com/kubony/openclaw-gcp-setup](https://github.com/kubony/openclaw-gcp-setup) 에서 쓰던
Google Cloud 스킬을 옮겨 온 것이다. 저자 고유의 프로젝트 ID 와 결제 계정 ID 는 예시값으로 바꿨다. kna 단계 스킬이 VM,
방화벽, 버킷, 스냅샷을 다룰 때 곁에서 쓸 수 있는 선택적 도우미이며, kna 단계는 이것에 의존하지 않고 필요한 명령을 모두
스스로 담고 있다. 설치를 마친 뒤에도 단독으로 쓸 수 있다. 예를 들어 `/gcp-vm-control` 로 VM 을 멈추고 켜거나,
`/gcp-snapshot` 으로 업그레이드 전에 스냅샷을 하나 더 뜨거나, `/gcp-firewall` 로 규칙을 확인한다. 이 스킬들은 kna 단계와
달리 돈이 드는 명령 앞에서 스스로 멈추지 않을 수 있으므로, 실행하기 전에 보여주는 명령을 읽고 yes 를 준다.
