# M2 테마 B — 데이터 정합 (quote_asset 필터) 🔄 진행 중

> **상태**: 🔄 **코드 + DB ✅ 완료 (2026-06-12, commit `e0f34e2`~`58f9f8e` 5개 push)**. Step 1~5 전부 완료 — 마이그레이션 Dashboard 적용 + backfill NULL 0/2,160 + 구워커 비파괴 실측 + regen 일치 검증 + 자문 2종 **Critical 0**. **▶ 남은 게이트 3 (순서 고정, /clear 후 진행)**: ① **06-12 운영 관측 세션** (Step 2.5 안정성 + Disk IO `[10-15]` 판단 — 메모리 `project_next_session_0612`) → ② PASS 시 **워커 배포** (ssh 178.105.38.94 — 신규상장 quote_asset 지속 채움 활성화) → ③ **라이브 G2** (crypto-trader 시나리오 5종, §4.5) → 통과 시 `[10-2]` 묘비 + 완결 선언(사용자).
> **단일 진실**: 본 파일 = 테마 B 전체 추적처. 발견 맥락 = `M2-step2-usage-feedback.md §H` (F2). deferred = `[10-2]` + 신규 `[10-24]`~`[10-29]`.
> **계획 출처**: 사용자 테마 B 선택 (2026-06-11) + Plan 에이전트 검증 5-step 분해. 계획 파일 보존 내용은 본 문서로 이관.
> **★ 영구 방향 결정 (Q1, 2026-06-12)**: 기본 quote 스코프의 description 단서 = **소프트 하드코딩으로 기각** — 유저별 기본 스코프는 테마 C 프리퍼런스(`[10-4]`)가 정공 (§4.5).

---

## 0. 무엇을 왜 (비전공자 요약)

> **"'USDT 페어만 보여줘' 쿼리에 터키 리라(TRY)·인도네시아 루피아(IDR) 페어가 섞여 나오던 문제. 원인은 DB 시세 테이블에 '이 페어의 결제통화가 뭔지' 칸 자체가 없어서 AI 가 필터를 만들 수 없었던 것. 결제통화 칸을 만들고(심볼 마스터에서 복사), AI 에게 '이 칸으로 거를 수 있다'고 알려주고, 초기 화면 조회도 서버에서 걸러 오게 했다."**

## 1. 배경 (실사용 F2 / `[10-2]`)

- 실사용 세션 #1 (2026-06-08): "spot USDT pairs" 쿼리에 TRY/BNB/USDC 혼입.
- 근본: `now_spot_ticker` / `now_futures_ticker` 에 `quote_asset` 컬럼 부재 → AI 필터 생성 불가. registry description 은 이미 "filter by quote_asset" **약속 중** (defaults.ts:75) — 구현과 모순 상태였음.
- **라이브 실측 (2026-06-11, Supabase MCP)**:
  - `now_futures_ticker` 한 테이블에 **USDM 689 + COINM 30 동거** (market_type 구분) → 2-테이블 변경 = 3시장 (spot/USDM/COINM) 완결.
  - quote 분포: spot = USDT 444 / **TRY 320** / USDC 293 / BTC 87 / FDUSD 47 / IDR 29 / EUR 29 / BNB 27 / JPY 24 — TRY 단독으로 USDT 의 72% 규모 오염원. futures_usdm = USDT 649 / **USDC 38** / BTC 1 / USD1 1. coinm = USD 30.
  - **symbols 조인 고아 row 0건** (양 테이블 100% 매칭) → backfill 후 NULL 잔존 0 기대.
- **추가 갭 2건 (계획 단계 발견)**: ① CoinListCard 가 AI `filters` 를 서버 SELECT 에 전혀 전달 안 함 (exchange/marketType eq 만) ② spot 1,441행 > limit 500 → 서버 pushdown 없으면 매치 row 초기 윈도우 절단.

## 2. 설계 핵심

| 결정 | 근거 |
|---|---|
| `quote_asset VARCHAR(20) NULL` (NOT NULL 금지) | ticker24hrBatchTask partial 이 WS 보다 먼저 신규 row INSERT 가능 + 구워커 과도기 신규상장 row 보호. NOT NULL 승격은 deferred |
| 단일 진실 = `symbols.quote_asset`, ticker 는 복제 | Realtime 은 조인 불가 → 프론트 필터 + 페이로드용 최소 denormalization. history/kline 미추가 (시계열 중복 저장 = 모델링 오류 + `[10-15]` Disk IO 역행) |
| 채움 = backfill UPDATE 1회 + WS 핸들러 매 upsert | ticker24hrBatchTask 무변경 (9-key partial 균일 유지 — mixed-batch 불변) |
| lookup 맵 = allowlist 와 **같은 getSymbols 스냅샷** | allowlist 통과 심볼은 lookup miss 구조적 불가. miss = 스냅샷 어긋남 신호 → 60s rate-limited warn |
| registry operators `["=", "in", "!="]` 한정 | ⚠️ `not_in` 은 FilterClauseSchema 에 없음 — 등록 시 AI emit → schema reject 함정. type 은 `string` (enum 금지 — 신규 quote 통화 자동 수용) |
| 서버 pushdown = `"="`(string) → eq / `"in"` → in 만 | number `=` 는 PostgREST 캐스팅 보수 제외. `!=`(.neq) pushdown 은 deferred. 클라이언트 evaluateFilters 재평가 유지 (Realtime 정합, AND 중복 무해) |
| `now_futures_indicator` 의도적 제외 | futures 엔 fiat 오염 없음 + market_type 구분 충분 + `[10-16]` deadlock 무대라 쓰기 경로 추가 신중 → 실사용 욕구 확인 시 deferred 회수 |

## 3. Step 별 산출물 (2026-06-11)

### Step 1 — DB 마이그레이션 + backfill (✅ 적용 완료 2026-06-12)
- ➕ `supabase/migrations/20260611000001_m2_themeb_quote_asset.sql` — ALTER 2 + COMMENT 2 + backfill UPDATE 2 (symbols 조인).
- ⚠️ Supabase MCP read-only → 기존 패턴 (`[8-5]` git 추적 + Dashboard 수동 실행) 채택 (사용자 결정 2026-06-11). **사용자 Dashboard 실행 완료 2026-06-12.**
- **적용 후 검증 실측 (2026-06-12, Supabase MCP)**:
  - NULL 잔존 **0건** — spot 0/1,441 + futures 0/719 (고아 row 0 사전 실측과 정합).
  - 분포 = 사전 시뮬레이션과 동일 (spot USDT 444/TRY 320/USDC 293/... · usdm USDT 649/USDC 38/BTC 1/USD1 1 · coinm USD 30).
  - **구워커 비파괴 실측 ✅**: BTCUSDT(usdm) `updated_at` age **0.0초** (구워커 WS full upsert 매초 가동 중)인데 quote_asset="USDT" 보존 — "PostgREST upsert ON CONFLICT SET 절은 payload 컬럼만 포함" 가설 실측 확정. spot BTCTRY="TRY"/BTCUSDC="USDC"/coinm BTCUSD_PERP="USD" 동일 확인.
  - 타입 정식 regen: `generate_typescript_types` 재실행 결과가 수동 패치본과 **일치 검증** (now 2테이블만 quote_asset / history 미포함) → 헤더 임시 표시 제거.
- `database.generated.ts` — **임시 수동 패치** (now_* 2테이블 Row/Insert/Update 6블록에 quote_asset, 알파벳 위치). 헤더에 임시 표시. **마이그레이션 적용 후 `generate_typescript_types` 정식 regen 으로 교체 의무**.
  - ⚠️ 작업 사고 기록: 최초 replace_all 이 history 테이블 2개에도 과잉 패치 + PowerShell Get-Content 가 한글 주석 인코딩 파손 (PS 5.1 ANSI 함정) → git checkout 복원 후 Edit 도구 + 유니크 컨텍스트 (`quote_volume` 다음 `symbol` 인접 — history 는 사이에 recorded_at) 로 재패치. 검증: quote_asset 위치 = now 2테이블 + symbols 만.
- ✏️ `docs/DB_SCHEMA.md` — 29→30 / 25→26 컬럼 + 채움 경로 + 마이그레이션 목록.

### Step 2 — worker (코드 ✅ / 배포는 06-12 후)
- ✏️ `apps/worker/src/index.ts` — `loadAllSymbols()` 반환에 `quoteAssetBySymbol` (마켓별 Map, **같은 getSymbols rows 에서** symbol 리스트와 동시 생성 — 추가 쿼리 0). 24h refresh 에서 allowlist Set 과 동시 교체.
- ✏️ `apps/worker/src/ws-relay/streams/tickerWsHandler.ts` — deps `quoteAssetBySymbol` + normalize 양 함수에 `quote_asset` **고정 key** (miss 시 값만 null — mixed-batch 불변) + `warnQuoteMiss` 60s rate-limit.
- ✏️ `ticker24hrBatchTask.ts` — 주석 1줄 ("quote_asset 의도적 미포함 — 9-key 균일 배치 보존").
- 테스트 ➕3: lookup 적재 (spot/usdm) / miss·미주입 → key 존재 + null / **배치 key 집합 균일성** (일부만 hit 여도 동일). worker **169 test** green.

### Step 3 — registry (✅)
- ✏️ `packages/shared/src/registries/defaults.ts` — now_spot_ticker / now_futures_ticker queryableFields 에 `quote_asset` (string, `["=", "in", "!="]`, 유스케이스 선언 톤 description). 기존 description 의 "filter by quote_asset" 약속이 이제 사실이 됨.
- 테스트 ➕5: aiCardConfig 3 (eq 통과 / in 배열 통과 / 오타 reject + 허용 목록 dump) + registries 2 (양 datasource 등록 + operators drift 가드 / **promptInjection 직렬화 = AI 자동 인지 증명**). shared **38 test** green.

### Step 4 — web 서버 pushdown (✅)
- ✏️ `apps/web/lib/dataService/initialFetch.ts` — `in?: InFilter[]` 옵션 (`query.in()`), YAGNI 주석 갱신.
- ➕ `apps/web/lib/dataService/filterPushdown.ts` — `splitServerFilters` 순수 함수 (operator 기반 일반 변환, 필드명 하드코딩 0).
- ✏️ `apps/web/components/cards/CoinListCard.tsx` — initialFetch 콜백에서 pushdown 적용 (deps 에 filters 추가). 클라이언트 evaluateFilters 유지.
- ✏️ barrel `index.ts` export. 테스트 ➕7 (filterPushdown 5 + initialFetch in 2). web **186 test** green.

### 검증 현황 (코드 게이트)
- `pnpm -r type-check` 6패키지 / `pnpm -r lint` / worker 169 + web 186 + shared 38 test — **전부 green, 회귀 0**.

## 4. 데이터 위생 9항목 체크 (CLAUDE.md 의무)

1. **lifecycle status**: 변경 0 — 기존 TRADING allowlist 경유 불변. quote 맵도 같은 TRADING 스냅샷 ✅
2. **REST+WS allowlist**: tickerWsHandler allowlist 필터 무변경 경유 ✅
3. **주기 재로드**: quote 맵이 기존 24h symbols refresh 에 합류 (allowlist Set 과 동시 swap — 스냅샷 정합) ✅
4. **stale row 정리**: 정책 불변. 고아 row 실측 0건. NULL quote_asset row 는 필터에서 자연 제외 (안전 방향) ✅
5. **극단값 guard**: 계산식 무변경 (정적 속성 복제) ✅
6. **워밍업 가드**: 무관 ✅
7. **RLS**: 컬럼 추가만 — 기존 테이블 SELECT policy (anon, qual=true) 그대로 적용. 신규 policy 불필요 ✅
8. **공식 문서 주석**: 신규 데이터 소스 아님 (symbols.quote_asset 복제). 원천 exchangeInfo 주석은 normalize.ts 기존 기록 ✅
9. **site=DB**: 라이브 G2 게이트 (워커 배포 후) — "USDT pairs" 쿼리 오염 0 + Binance spot/futures 마켓 탭 대조 (URL+수치 기록 예정) ⏳

## 4.5 자문 결과 (2026-06-12, 병렬 2종 — 둘 다 Critical 0)

### code-reviewer
- **Critical 0.** 중점 6항목 전부 통과 — mixed-batch 고정 key ✅ / graceful ✅ / splitServerFilters operator 기반 (필드명 분기 0, "매우 모범적") ✅ / dataService 경유 ✅ / 확장성 (registry 등록만으로 자동) ✅ / 재구독 루프 안전 ✅.
- W1 (generated 헤더 모순): 리뷰 시점 정보 stale — 실제로는 같은 날 마이그레이션 적용 + regen 일치 검증 완료로 **자연 해소**.
- W2 (`symbols_meta.quote_asset` 의 `contains` — FilterClauseSchema 에 없어 emit→reject 함정 잔존, registry↔schema operator enum 이중 진실) → **`[10-25]` 등재** (zod-schema-architect 위임 후보).
- W3 (enrichTickerRow early-return key 비균일) → **`[10-27]` 등재**. W4 (CoinListCard 한국어 stub) → 기존 `[10-10]` (b) 와 동일 — 출처만 추가 인지.
- S3 (in 빈 배열 방어 사유 주석) **즉시 반영**. S1 (마켓별 warn rate-limit 분리) 과설계 판단 보류. S2 (EqFilter string 가드) 인지.

### crypto-trader (advisory only)
- **Q1 기본 스코프**: "top gainers" 의 트레이더 멘탈 모델 = 사실상 USDT 기준 — BTCIDR 상위 노출은 "틀린 화면" 체감. (c) 하드코딩 반대 / (b) description 단서 1줄 강화 권고.
  - **★ 사용자 결정 (2026-06-12): (b) 도 기각 — 현행 유지.** 사유: "USDT 가 기본" 단서는 보편 유저를 가정하는 **소프트 하드코딩** — TRY 페어 트레이더에겐 오히려 틀린 화면. TRAVIS 비전 = "유저별로 원하는 모든 정보를 원하는 형태로" → **기본 스코프는 시스템이 아니라 유저별 프리퍼런스가 정한다** = 테마 C (`[10-4]` user_preferences → buildSystemPrompt 주입) 가 근본 해법. description 은 사실 기술 (fiat 포함됨 + quote_asset 필터 가능) 만 유지.
- **Q2 futures USDC 38페어**: funding/OI 랭킹 혼합 "거슬리는 수준" (같은 코인 2줄 + 얇은 OI 극단값 오독) → **`[10-29]` 등재**.
- **Q3 not_in**: 실질 갭 작음 (트레이더는 양수 지정) — 현 설계 지지 → `[10-24]` 메모 반영.
- **G2 시나리오 5종**: ① "spot USDT pairs" F2 회귀 ② quote 미지정 "top gainers" 관찰 ③ USDC pushdown 정확도 ④ "exclude fiat" AI 번역 관찰 ⑤ funding 랭킹 USDC 중복 판정.

## 5. 잔여 게이트 (순서)

1. ~~사용자 Dashboard 마이그레이션 실행 → 검증 SQL → regen~~ ✅ **완료 (2026-06-12)** — NULL 0/2,160 + 구워커 비파괴 실측 + regen 일치 (§3 Step 1).
2. ~~commit + push~~ ✅ **완료 (2026-06-12)** — `e0f34e2`(Step1) / `94d53c4`(Step2) / `74e844f`(Step3) / `4499cd3`(Step4) / `58f9f8e`(Step5 docs), Vercel 자동 배포.
3. ~~워커 배포~~ ✅ **완료 (2026-06-12 12:43 UTC)** — 게이트 ① 관측 PASS (26.6h 무재시작, incident arr doc §10.4c) 후 `454b8ab` 배포 (테마 B 5 commit + `[10-23]` 1단계 syncSymbols 24h→1h 동반). 검증: 부팅 정상 (5 task, CHK 15연결 maxSilence=1s) + **warnQuoteMiss 0건** + DB freshness <1s + quote_asset NULL 0 유지. 부수 발견: `[10-31]` (poller AbortSignal 미전파 → restart 시 30s+SIGKILL, 멱등 upsert 라 데이터 영향 0) / `[10-32]` (COINM delivering 8심볼 노이즈, 기존 현상). 소유권 정비: `chown -R travis:travis /opt/travis` 실행 (deferred 개선안 (a) 동반 처리 — 이후 git pull 비밀번호 불필요).
4. ⏳ **라이브 G2** (crypto-trader 시나리오 5종, §4.5): "spot USDT pairs" F2 회귀 (전 row USDT + TRY/IDR 0건 + Binance 사이트 대조 URL·수치 기록) / quote 미지정 "top gainers" AI 출력 관찰 / USDC pushdown 정확도 / "exclude fiat" AI 번역 관찰 / funding 랭킹 USDC 중복 체감. ※ G2 ①③ 은 backfill 덕에 **워커 배포 전에도 검증 가능** (Vercel 이미 배포됨) — 단 완결 선언은 배포 후.
5. ⏳ `[10-2]` 묘비 + 테마 B 완결 선언 (사용자).

## 6. 신규 deferred (✅ 등재 완료 2026-06-12, deferred-task.md)

| ID | 내용 |
|---|---|
| `[10-24]` | `not_in` FilterClauseSchema 추가 + `!=`/.not.in() pushdown ("exclude fiat" 1-clause. crypto-trader: 실질 갭 작음) |
| `[10-25]` | registry Operator enum ↔ FilterClauseSchema 이중 진실 (code-reviewer W2 — symbols_meta `contains` 함정 잔존, zod-schema-architect 위임 후보) |
| `[10-26]` | CoinListCard sort → initialFetch `order` pushdown 미소비 |
| `[10-27]` | `enrichTickerRow` early-return pre-compute key 비균일 — mixed-batch 잠재 위반 점검 (W3) |
| `[10-28]` | quote_asset NOT NULL 승격 (⚪ 무기한 — 실익 작음) |
| `[10-29]` | `now_futures_indicator` quote_asset 확장 (crypto-trader Q2 "거슬리는 수준" — `[10-16]` 경합 무대 신중) |

- scope 밖 유지: quote_volume USD 환산 정공 (`[3-54]`). 기본 quote 스코프 = 테마 C `[10-4]` 로 이관 (Q1 결정).
