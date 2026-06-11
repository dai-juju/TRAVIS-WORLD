# M2 — Supabase Disk IO 고갈 사고 (Nano compute 과부하 → DB 무응답)

> **상태**: ✅ **해소 완료 (2026-06-11 08:00 UTC)** — Small compute 업그레이드 + 워커 순차 재개 + 안정 검증 통과. 잔여 = `[10-15]` 인덱스 다이어트(🟠) / `[10-16]` row 경합(🟢) / `[10-17]` 운영 관측 루틴(📋).
> **단일 진실**: 본 파일 = 사고 전말 + 진단 + 조치 추적처. deferred = `[10-15]`~`[10-17]`. 메모리 = `project_m2_incident_supabase_disk_io.md`.
> **발견 경위**: Supabase "Disk IO Budget 고갈" 경고 이메일 (사용자 수신) → 테마 A Step 3 착수 세션의 Phase 0 진단 중 DB 전면 무응답 실측.

---

## 0. 한 줄 요약 (비전공자용)

> **"가장 작은 서버(Nano, 0.5GB)로 워커 2대의 쓰기를 받다가 디스크 속도 한도(Disk IO Budget)가 바닥났고, 느려진 DB 위에서 잠금 충돌(deadlock)까지 연쇄해 어젯밤부터 DB가 무응답이었다. 워커를 멈추니 즉시 회복 → Small(2GB, 실질 +$5/월)로 업그레이드 후 재개, 전부 정상."**

---

## 1. 타임라인 (UTC)

| 시각 | 사건 |
|---|---|
| 06-10 13:03~13:39 | postgres 로그: `deadlock detected` 다수 + `statement timeout` 폭풍 + 같은 tuple AccessExclusiveLock 경합 |
| 06-10 16:38~ | API 로그: worker upsert POST **100/100건 522** (ticker/indicator/청산/symbols 전부) |
| (그 사이) | Supabase Disk IO Budget 고갈 경고 이메일 발송 |
| 06-11 06:27 | **Postgres 재시작** (과부하 crash 추정, pg_stat 리셋으로 확인) |
| 06-11 07:08~ | 재시작 후에도 워커 쓰기 폭주 재개 → collector upsert 전부 "Could not query the database for the schema cache" 실패, `SELECT 1` 조차 connection timeout |
| 06-11 07:11~07:13 | **양쪽 워커 중지** (사용자 승인) — production 은 graceful 종료가 DB 무응답에 막혀 SIGKILL, collector 는 graceful 정상 |
| 06-11 07:14 | **DB 즉시 회복** (13.5s → 0.9s) — 쓰기 부하 인과 실험 확정 |
| 06-11 07:56 | **Small compute 업그레이드 적용** (사용자, Dashboard) — `shared_buffers` 512MB 확인 |
| 06-11 07:58~08:01 | production 재개 (WS usdm 8 + spot 6 + kline 10 + COINM @arr 전 연결 정상, 3 테이블 60초 내 fresh) → collector 재개 (608+30 심볼, tasks=6, 첫 사이클 무실패) → REST 0.15~0.3s 안정 |

## 2. 원인 (3중 결합)

1. **Nano compute (0.5GB, 공유 CPU)** — Pro 플랜이라 Micro 크레딧($10/월)을 내고 있었으나 인스턴스는 Free 시절 Nano 그대로 (플랜 업그레이드 ≠ 인스턴스 업그레이드 함정). 최저 Disk IO baseline.
2. **쓰기량의 정직한 증가** — Step 2.5(2026-06-10) 배포로 USDM full ticker + markPrice 1초 + **청산 43일 만에 재개** + M1.9 forward-fill 동시 가동 = 데이터 파이프 건강 회복 → 쓰기 IO 도 정상 수준으로 회복 → Nano 한도 초과.
3. **`history_futures_indicator` 인덱스 비대** — total 2,737MB 중 **인덱스 1,652MB > heap 1,085MB**. upsert 1건당 write amplification + 멱등 재쓰기(upd≈ins×5, dead/live 3.58) → autovacuum 상시 IO.

**deadlock 은 2차 증상**: 무대 = `now_futures_indicator`(relation 18692). 여러 task 가 같은 심볼 row 의 다른 컬럼을 병렬 update — IO 고갈로 트랜잭션이 느려지자 row lock 경합 폭발. `feedback_concurrent_upsert_deadlock`(단일 task 내 순차 await) 규율로는 task 간 경합 못 막음 → `[10-16]`.

## 3. 조치

- ✅ **긴급 완화**: 양쪽 워커 중지 (어차피 쓰기 전부 522 실패 중 = 추가 손실 0) → DB 즉시 회복으로 인과 확정.
- ✅ **구조 조치**: Compute **Nano → Small** (2GB/ARM 2코어, $0.0206/h ≈ $15/월, 크레딧 $10 차감 = **실질 +$5/월**). Medium($60/월)은 `[10-15]` 회수 후에도 IO 70%+ 반복 시 (`[10-17]` 기준).
- ✅ **재개 검증**: production 가동 중 REST 0.15~0.5s + futures 623 / indicator 638 / spot 1,408 심볼 60초 내 fresh + collector 첫 사이클 무실패.
- 📋 **이월**: `[10-15]` 인덱스 다이어트(IO 비용 자체 절감 — 업그레이드는 한도 상향일 뿐) / `[10-16]` row 경합 완화 / `[10-17]` Disk IO 관측 루틴.

## 4. 재발 시 대응 절차 (운영 메모)

1. 증상: 사이트 카드 stale + Supabase 이메일 / `SELECT 1` timeout / API 로그 522 / collector "schema cache" 실패.
2. `get_logs(postgres)` 로 deadlock/timeout 확인 → **워커 중지** (production `travis-worker.service` @178.105.38.94 / collector `travis-collector-history.service` @49.13.138.121, key `~/.ssh/travis_hetzner`).
3. 회복 확인 (REST curl) → Dashboard Reports 에서 Disk IO 그래프 확인 → compute/절감 판단 → 워커 순차 재개 (production 먼저).
4. ⚠️ production graceful 종료는 DB 무응답 시 hang → SIGKILL 됨 (정상 동작, 데이터 무손실 — upsert 멱등).

## 5. 데이터 영향

- **데이터 공백**: 06-11 07:11~07:58 UTC (~47분) now_* 갱신 정지 + 06-10 저녁~06-11 새벽 간헐 유실 (522 구간). history forward-fill 은 증분 설계(getMaxRecordedAt)라 재개 후 자동 채움 — 무구멍.
- **사이트 읽기**: DB 무응답 구간 동안 카드 로딩 실패했을 것 (사용자 미관측 — 수면 시간대).
