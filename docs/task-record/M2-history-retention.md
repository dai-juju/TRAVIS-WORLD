# M2 Disk Retention 묶음 — `history_futures_indicator` 용량/IO 최적화

> **상태**: 🔄 진행 중 (2026-06-13 착수). **S1 코드+마이그레이션 ✅ / 라이브 적용 대기**.
> **회수 대상 deferred**: `[10-15]`(인덱스 다이어트) + `[10-34]`(용량 시한 ~4주) + `[8-18]`(retention 정책).
> **단일 진실**: 본 파일 = 묶음 전체 추적처. 승인 계획 = `~/.claude/plans/travis-bubbly-blum.md`. 백엔드 설계 권고 = 동 디렉터리 `*-agent-*.md`.
> **사용자 확정 보존 정책 (변경 금지)**: 단주기 5m/15m/30m=14일 · 중주기 1h/2h/4h=60일 · 장주기 6h/12h/1d=180일.

---

## 0. 무엇을 왜 (비전공자 요약)

> **"과거 지표 시계열 테이블이 DB의 97.5%(2.95GB)를 먹고 하루 ~136MB씩 자라 4주 뒤 한도(8GB)에 닿는다. 게다가 인덱스(색인표)가 본체보다 크고, forward-fill이 '값이 같아도 매번 덮어쓰기' 해서 죽은 행(dead tuple)이 18.7% 쌓였다. ① 안 쓰는 색인 버리고 ② 덮어쓰기 줄이고 ③ 오래된 데이터를 자동 폐기해서 용량 성장을 평형으로 잡고 IO 부담을 구조적으로 낮춘다."**

## 1. 진단 실측 (2026-06-13, Supabase MCP read-only)

| 항목 | 값 |
|---|---|
| 테이블 total | ~2.95GB (DB 전체 ~3.2GB의 97.5%) |
| 행 수 | 767만 (live), recorded_at 5/17~6/13 = **27일치** (14일 backfill로 시작했으나 retention 부재로 누적) |
| dead tuple | 18.7% (143만) — 멱등 재쓰기 누적 |
| 성장 | ~136MB/일 → **~4주 내 8GB** |
| interval 분포 | 5m=444만(58%) · 15m=161만 · 30m=80만 · 1h=39만 · 2h=20만 · 4h=9.8만 · 6h=6.8만 · 12h=3.3만 · 1d=1.7만 |
| 인덱스 (총 ~1.87GB) | natural_pk 889MB · **idx_lookup 534MB** · pkey(id) 337MB · freshness 112MB |

**코드 탐색 확정 (Explore + backend-infra-specialist)**:
- 유일 SELECT = `getMaxRecordedAt` (SupabaseDataService.ts:447) = (exchange, market_type, interval) eq + recorded_at DESC LIMIT 1 → **symbol 무관** → `idx_freshness` 가 서빙.
- 프론트 카드는 이 테이블 **직접 조회 0건** (apps/web 참조 0, 카드는 now_futures_indicator 만 읽음).
- upsert = PostgREST `.upsert(onConflict: 5축 natural key, defaultToNull:false)` — **IS DISTINCT FROM 가드 없음** → 값 같아도 UPDATE → dead tuple.
- forward-fill = `startMs = anchor − SAFETY_BARS×interval` 부터 **now 까지 전체** 재수집 (forwardFillTask.ts:183).

**라이브 검증된 전제**: pg_cron 미설치이나 설치가능 / 이 테이블 Realtime publication 미포함 / id FK 참조 0건.

## 2. 접근 (위험 낮음→높음, backend-infra-specialist 자문 채택)

세 레버: ① 인덱스 다이어트(저위험·가역) → ② 멱등 재쓰기 가드(lookback 축소) → ③ retention(pg_cron 배치 DELETE).

> **retention 방식 선택**: native partition(정공)은 "날짜 파티션 통째 drop"이 *모든 interval 동일 보존*일 때만 깔끔한데 우리는 차등 → 안 맞음 + 라이브 767만 행 무중단 전환 위험(디스크 2배 점유). → **pg_cron DELETE 가 1순위** (차등 = WHERE 한 줄로 표현). 파티션은 억 단위 시 `[8-18]` 재평가.

Step 분해 (`@roadmap-milestone-manager` GO): **S1(저·가역) → S2(중·비가역) → S3(중·비가역) → S4(선택)**. 한 세션 1 Step, DDL/코드 별도 commit.

---

## S1 — 인덱스 다이어트(1차) + lookback 축소 · ✅ 코드+마이그레이션 (라이브 적용 대기)

### 산출물
- ➕ `supabase/migrations/20260613000001_m2_history_retention_s1_drop_lookup_index.sql` — `DROP INDEX CONCURRENTLY idx_hist_futures_indicator_lookup` (534MB, 미사용 확정). ⚠️ **Dashboard SQL Editor 수동 실행** (CONCURRENTLY = 트랜잭션 밖 → apply_migration 불가, `[8-5]` 패턴).
- ✏️ `packages/exchange-collectors/src/core/forwardFillWindow.ts` — `FORWARD_FILL_SAFETY_BARS` **2 → 1** + 주석(왜 1봉으로 충분한지: anchor 기준 + now까지 전체 재수집이라 cycle 건너뛰기 강건, forming 보정은 최근 1봉만 필요).
- ✏️ `apps/worker/src/__tests__/forwardFillWindow.test.ts` — 회귀 가드 2건 추가: (a) anchor 봉 재방문 불변 `startMs ≤ anchor` (5m/1d, forming 보정 — roadmap-mm 핵심 우려 해소) (b) 정확히 1봉 `anchor − startMs == interval` + `SAFETY_BARS === 1`.
- ✏️ `docs/DB_SCHEMA.md` — 인덱스 4→3 + S2 제거 예정 주석.

### lookback 2→1 안전성 논거 (roadmap-mm 우려 해소)
`startMs = anchor − N×interval` 부터 **now 까지 전체** 재수집 → anchor~now 사이 모든 봉은 N 무관 항상 채워짐(cycle 건너뛰기 강건). N 의 유일 역할 = anchor 봉(직전 forming 가능한 단 1봉) 재방문 보정 → **1봉으로 충분**. 2봉은 이미 확정된 직전 봉까지 재쓰기 = dead tuple 원인. 장주기(1d)도 동일(now까지 전체라 누락 불가).

### 검증 (코드 게이트 ✅ 2026-06-13)
- worker test **171 passed** (forwardFillWindow 7 = 기존 5 + 신규 2, 회귀 0).
- `pnpm -r type-check` 6패키지 Done / `pnpm -r lint` 에러 0.

### 라이브 적용 (사용자 인프라 — 대기 중)
1. **Supabase Dashboard SQL Editor** 에서 마이그레이션 SQL 실행 (DROP INDEX CONCURRENTLY).
2. **collector-history 서버(49.13.138.121)** git pull + 프로세스 재시작 (lookback 1봉 반영).
3. 적용 후 MCP 검증: 인덱스 3개로 감소(lookup 사라짐) + indexes_size ~534MB↓ + getMaxRecordedAt EXPLAIN(idx_freshness Index Scan 유지, Seq 회귀 아님) + 5m/15m/1h/1d freshness lag 회귀 없음 + dead tuple 증가율 하락 추세.

### deferred 매핑
- `[10-15]` **부분 회수**: idx_lookup 534MB DROP + lookback 축소(write amp 1차 완화). **잔여 → S2**(surrogate id ~337MB) / **S4**(조건부 upsert로 dead tuple 근본 차단).
- `[10-34]`/`[8-18]` **미회수 유지** — S1 은 성장 속도만 늦춤. 4주 용량 시한의 실제 해결은 **S3(retention)**. ⚠️ S2/S3 를 시한 내(~7/11) 반드시 진행.

---

## S2 — surrogate id PK 제거 + natural_pk 승격 (예정, 중·비가역)
`DROP CONSTRAINT pkey` → `ADD PRIMARY KEY USING INDEX natural_pk`(인덱스 재사용) → `DROP COLUMN id`. ~337MB+heap. **백업 확인 + 저트래픽 시각 + id read 0건 grep 선행.**

## S3 — pg_cron retention (예정, 중·비가역)
`CREATE EXTENSION pg_cron` + `prune_history_futures_indicator()` 배치 DELETE(ctid LIMIT 8000 + pg_sleep) + 일1회 cron + 첫 1회성 대량청소 점진. interval별 14/60/180. **백업 확인 선행.** → `[10-34]`/`[8-18]` 회수.

## S4 — (선택) RPC 조건부 upsert (S3 후 dead tuple 잔존 시)
`ON CONFLICT DO UPDATE WHERE existing.* IS DISTINCT FROM excluded.*` RPC, dataService 내부 구현만 교체(시그니처 불변).

---

## 데이터 위생 9원칙 체크 (해당분)
- **#4 stale 정리**: 본 작업이 retention = stale 정리 메커니즘 ✅
- **#7 RLS**: 방식 B(DELETE) → 테이블 동일 → RLS 영향 0 ✅
- **#8 근거 주석**: 마이그레이션에 정책 결정일·보존정책·출처 인라인 기록 ✅
