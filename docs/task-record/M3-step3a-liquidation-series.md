# M3 Step 3a — 청산 events→series 집계 ([10-84]) · 배관 관통

**Milestone**: M3 "Binance 우주 완성"
**Step**: 3a (사이클 M3-3, Phase 1 / Phase 2 = `M3-step3b-chart-multicolumn.md`)
**착수일**: 2026-07-19
**상태**: 🔄 진행 중 — Step 1 ✅ 완료
**단일 진실**: 본 record + `docs/M3-plan.md §사이클 추적`
**Plan**: `~/.claude/plans/nifty-drifting-dusk.md` (사용자 승인 2026-07-19)

---

## 📖 비전공자 친화 설명

청산 데이터는 지금 **"영수증 낱장 더미"** 입니다 — "12:03:11 BTC 롱 $50k 청산" 같은 개별 사건이 쌓여 있고, 피드 카드와 표 카드가 그 낱장을 보여줍니다.

차트는 낱장을 못 그립니다. 차트가 먹는 건 **"5분마다 합계 얼마"** 같은 가지런한 막대표입니다. 그래서 유저가 "청산 추이를 차트로"라고 해도 **AI가 아무리 똑똑해도 물리적으로 불가능**했습니다. AI 판단 문제가 아니라 주방(데이터 레이어)에 그 손질법이 없었던 것입니다.

이번 작업은 **영수증을 시간 상자에 나눠 담아 합산하는 계산기**를 만듭니다. 중요한 건 **이게 결정의 하드코딩이 아니라 능력 추가**라는 점입니다 — 피드/표/차트 중 무엇을 띄울지, 몇 분 단위로 얼마 기간을, 롱만·숏만·합계·양방향 중 어느 형태로 볼지는 **전부 AI가 유저 문장에서 판단**합니다. 코드는 선택지만 넓힙니다.

접는 작업은 **DB 안에서** 합니다. 브라우저로 영수증을 다 끌고 오면 3,000장에서 잘리는데(전 시장 24시간 = 24,692장), 잘린 채로 **차트가 정상처럼 보이기** 때문입니다.

---

## 🔒 최상위 불변식 — 큐레이션 금지 (사용자 재강조 2026-07-19)

> "유저별로 원하는 기본 버킷/기간 조합이 다를 건데, 하나로 정해두면 안 됩니다. TRAVIS는 유저가 어떤 데이터를 어떤 형태로 어떤 인터랙션으로 요청하든 모두 가능해야 함을 명심하세요."

코드는 **어떻게 그릴지**(포맷·색·단위·고지)만 소유하고, **무엇을 보여줄지**(버킷·기간·형태·범위)는 전부 AI 계약에서 파생한다.

| 축 | 결정 주체 | 통로 |
|---|---|---|
| 버킷 크기 | AI | `data.interval` (enum 9종 **전체 개방**) |
| 기간 | AI | `limit × interval` (기존 chart-card 계약 그대로) |
| 롱/숏/양쪽 | AI | `filters: side = SELL｜BUY`, 생략 = 양쪽 |
| 합계 vs 성분분해 | AI | `style.breakdown: "total"｜"components"` |
| 심볼 vs 시장전체 | AI | `data.symbol` 지정 / **생략 = 전 시장 집계** |
| 다이버징 렌더·색·부호 | **코드(descriptor)** | AI에게 픽셀 정책을 떠넘기지 않음 |

🔴 `defaultInterval` 은 **AI가 생략했을 때만** 발화하는 폴백이며 **AI 명시값을 절대 덮지 않는다**. `defaultLimit` 은 **신설 금지**(`feedback_card_default_overrides_ai_intent` 계보). Step 4에서 진리표 테스트로 핀.

---

## ✅ Step 1 — 계약 설계 확정 (2026-07-19, 코드 0줄)

`@zod-schema-architect` 자문 + CTO 검토. 확정 8건.

### 1) datasource id = `liquidation_volume_history`
기존 `liquidation`(events/set, `table: history_futures_liquidation`, `transport: ws_direct`)은 **무변경**. `liquidation_history` 는 기존 엔트리가 이미 그 테이블을 점유해 혼동되므로 기각. metric(청산 **규모**)을 id에 담아 history 6종 명명 규약과 정합.

**기존 엔트리를 고치지 않는 이유**: `liquidation` 은 경로 A(WS 직결) 엔트리다. 여기에 RPC 기반 series를 얹으면 한 엔트리가 **경로 A와 경로 B 두 운반을 동시 선언**하게 되어 경로 혼합 금지에 저촉된다. `funding_history` 선례대로 별도 엔트리.

### 2) `fetchKind` + `rpcSpec` 신설 (registry 가산 필드)
`datasourceRegistry.ts:82` 주석이 이미 예고한 자리. `transport`/`mergeMode` 와 **완전 동형**의 default 있는 가산 필드 → **기존 15종 한 줄도 안 고침, 회귀 0**.

- `fetchKind: z.enum(["table","rpc"]).default("table")` — "어디서 꺼내나" 축 (transport "어느 길로 닿나"와 직교)
- `rpcSpec: { functionName, argNames }` — 함수명과 **fetch 축 → SQL 인자명** 매핑을 데이터로 선언
- `argNames` 는 자유 record가 아닌 **축 고정 object + optional 필드** — 오타(`marketTyp`)가 등록 시점에 안 잡히면 "그 축만 조용히 미전달"(= 전 시장 스캔) silent-wrong
- superRefine: `fetchKind:"rpc" ⇒ rpcSpec 필수` (기존 `ws_direct ⇒ liveTopicSpec` 규칙 미러)
- **AI 비노출** — `serializeDatasource` allowlist 방식이라 자동 미노출, 별도 작업 0

### 3) ★ 롱/숏/총합/다이버징 = 2축 직교 분해

| 유저 의도 | AI 계약 |
|---|---|
| "long liquidations" | `filters: side = "SELL"` |
| "short liquidations" | `filters: side = "BUY"` |
| "total liquidations" | side 생략 + `style.breakdown: "total"` |
| "long vs short" | side 생략 + style 생략 (**도메인 기본 = 성분분해**) |

- **subset 축** = `filters.side` → RPC `p_side` 로 **실제 pushdown**. history 6종이 값 필터를 못 눌러 silent-wrong 되던 문제가 여기선 **구조적으로 부재** → 노출이 정당
- **표현 축** = `style.breakdown` (사이클 4a `style` 재사용, 하위 필드 가산 = forward-compat 안전). fetch는 완전 동일(RPC가 항상 long/short/total 3컬럼 반환), 어느 컬럼을 플롯할지만 다름
- **"다이버징"은 enum 값이 아니다** — descriptor가 "성분이 서로 반대 방향"(midline 0)이라 선언하면 form이 다이버징으로 그린다. `"stepped"` 가 enum에 없고 form이 자동 전환하는 선례와 동형
- **기각 ①** id 3분할(long/short/total): LSR 3분할은 *물리적으로 다른 3컬럼*이지만 여기 셋은 *한 집계의 성분*. Phase 2 다중 컬럼 시 즉시 부채 + taker buy/sell 등 미래 데이터마다 반복 분할
- **기각 ②** side 필터만으로 구분: "필터 없음"이 총합·다이버징 두 의미를 겸하게 되어 총합을 표현할 통로가 **아예 없음**
- **Phase 2 생존성**: descriptor `valueFields[]` 는 `(filters.side, style.breakdown)` 에서 파생 = 4b `dynamicColumns` 의 차트판. **AI 계약 통로 불변**

### 4) 시장 전체 스코프 = `optionalScopeFields` (registry 파생, 하드코딩 0)
`symbol` 생략이 "결핍"이 아니라 **"전 시장 집계"라는 정의된 의미**를 갖는 축을 registry가 선언. 기본 `[]` → 기존 15종 거동 완전 불변.

- `aiCardConfig` superRefine (3)의 symbol 강제에 `&& !ds.optionalScopeFields.includes("symbol")` 가산 — **면제는 "강제 안 함"이지 "금지"가 아니므로 per-symbol도 그대로 가능**
- 같은 superRefine의 발화 조건 `ds.table` → `isServedByDataLayer(ds) = Boolean(ds.table) || ds.fetchKind === "rpc"` 로 일반화. kline은 여전히 면제(table 없음 + fetchKind 기본값), 신규 RPC 엔트리는 **marketType 강제 유지**
- `ChartCard.tsx:356` 의 `symbols.length === 0` → "missing symbol scope" 가드도 **같은 필드**를 읽어 완화(단일 진실). 기존 6종 안내문 그대로 유지

### 5) queryableFields = 축 6개만
`exchange` / `market_type` / `symbol` / `interval`(enum 9종 전체) / `bucket_time` / `side`.

- **집계 값 컬럼 전면 미노출** (`long_notional`·`short_notional`·`total_notional`·`event_count`·`null_notional_count`) — RPC가 집계 결과에 HAVING을 걸지 않으므로 노출하면 AI 필터가 **스키마 통과 후 조용히 무시**. history 6종 값컬럼 미노출과 동일 사유
- **`bucket_time` 은 `string`(ISO) — `number` 금지**: 청산 `trade_time` 을 epoch ms로 선언했다가 실제 wire는 ISO라 범위 필터가 문자열 비교로 무력화됐던 정정 이력 그대로
- `symbol` operators에서 **`contains` 제거** (RPC는 LIKE 미지원 = silent-wrong 방지). commonFields 머지가 되살리지 않는지 테스트 핀
- 시간축 이름은 `recorded_at` 재사용 대신 `bucket_time` — "원본 기록 시각"과 "버킷 경계"의 의미 충돌은 AI 오추론 소스

### 6) `limit` 의미 = 기존 계약 그대로
chart-card description **한 글자도 수정 안 함**(`limit × interval` = 표시 시간 범위, 1버킷 = 1포인트라 문자 그대로 참). RPC는 `bucket_time DESC LIMIT p_limit` 로 최신 N버킷 → 프론트가 reverse(oldest-first), 기존 `seriesFetch` 계약 동일.

**빈 버킷은 행을 만들지 않는다**(`generate_series` 금지) — 인덱스 친화 + `spanGaps:false` 로 "그 시간엔 청산 없음"이 시각적으로 정직 + 0으로 채우면 "0으로 plot/연결 금지" 공통 규칙 위반. 결과로 희소 심볼은 표시 범위가 `limit × interval` 보다 길어질 수 있음 = **데이터 진실이지 결함 아님**(AI description에는 넣지 않음 — 디테일 덤프 금지).

### 7) interval 우선순위 = 이미 정상, 핀만 신설
실측 `ChartCard.tsx:151-153` = **유저 토글 > AI > descriptor**. descriptor가 AI를 덮는 경로 **없음**. `defaultLimit` 은 애초에 존재하지 않음. 위험은 "지금 틀림"이 아니라 **"핀이 없어 리팩터에 조용히 뒤집힘"**(`??` 순서 한 칸) → `resolveEffectiveInterval` 순수 함수로 추출 + 진리표 4행 테스트.

### 8) 🆕 CTO 판단 — 오염 필터는 "마스터 **존재**"로, **status 무관**
`@zod` / `@crypto-domain` 은 TRADING allowlist 조인을 제안했으나 **다르게 결정**했다.

- **이유**: 지금 SETTLING인 심볼도 **3일 전 청산은 진짜 역사**다. 상태로 거르면 과거를 왜곡한다. 위생 #1의 TRADING allowlist는 *현재 스크리닝*(Top gainers 등)의 원칙이고, *역사 집계*의 올바른 게이트는 **존재 여부**다.
- **실측 근거**: 7일 창 매칭 행의 **100%가 TRADING** — status 필터는 오늘 아무것도 걸러내지 않으면서 미래에 과거를 왜곡할 위험만 진다.
- **오염 제거 효과는 동일**: 아래 §오분류 발견의 유령 행은 마스터에 해당 `(exchange, market_type, symbol)` 조합이 없어 **INNER JOIN 만으로 전부 제거**된다.
- 이 결정을 `docs/DB_SCHEMA.md` RPC 항목에 근거와 함께 기록한다.

### RPC 시그니처 (Step 2 확정 입력)

| SQL 인자 | 타입 | NULL | 출처 | NULL 의미 |
|---|---|---|---|---|
| `p_exchange` | text | ✗ | `data.exchange` | — |
| `p_market_type` | text | ✗ | `data.marketType` (superRefine 강제) | 스키마가 차단 |
| `p_symbol` | text | ✓ | `data.symbol` / `filters symbol in` 각 원소 | **전 시장 집계** |
| `p_bucket` | interval | ✗ | `data.interval` → 폴백 `defaultInterval` | 폴백만 |
| `p_side` | text | ✓ | `filters side =` | **양쪽 모두** |
| `p_from` / `p_to` | timestamptz | ✓ | `filters bucket_time` 범위 | 무제한 / now |
| `p_limit` | int | ✗ | `data.limit` ?? 300 | AI 생략 시만 |

**반환**: `bucket_time`(timestamptz) · `long_notional` · `short_notional` · `total_notional` · `event_count` · `null_notional_count`
**side 매핑**: `long_notional = SUM(notional) FILTER (WHERE side='SELL')` — 상수 근거는 `apps/web/lib/cards/liquidationSemantics.ts` 가 단일 진실(SQL 리터럴에는 근거 주석 명시, 재구현 금지)

---

## ✅ Step 2 — 집계 RPC + 마이그레이션 (2026-07-19)

**신규**: `supabase/migrations/20260719000001_m3_step3a_liquidation_volume_series.sql`

`liquidation_volume_series(p_exchange, p_market_type, p_bucket, p_symbol, p_side, p_from, p_to, p_limit)`

- **버킷 = text + allowlist 매핑** (interval 캐스팅 금지) — 임의 문자열 캐스팅은 `'1 microsecond'` 류가 수백만 버킷을 만드는 DoS 벡터. 미허용 값은 **throw 가 아니라 폴백**(graceful).
- **버킷 어휘 10종**(`1m,5m,15m,30m,1h,2h,4h,6h,12h,1d`) — history 6종(9종)보다 **넓다**. history 는 워커가 그 주기로 *수집·저장한 것*만 존재하지만 이 함수는 **요청 시점 계산**이라 어떤 버킷이든 가능하다. 이유 없이 좁히는 것은 큐레이션(최상위 불변식).
- **스캔 자기 제한**: `p_from` 미지정 시 `v_end - (limit × bucket)` 으로 하한을 스스로 계산 → 풀스캔 방지.
- **진행 중 버킷 제외**: 상한 = `date_bin(bucket, now())` **미만**.
- **마스터 INNER JOIN** (status 무관, Step 1 결정 8) — 오분류/유령 행 구조적 제거.
- **보안 3종**: `SECURITY INVOKER` + `SET search_path = public, pg_temp` + 파라미터 allowlist/클램프(`limit` 1~2000).

### 검증 결과 (전부 PASS)

- [x] **EXPLAIN ANALYZE 37ms** (24h × 1h 버킷, 전 시장) — `Index Scan(idx_hist_liq_time)` + `Index Only Scan(symbols_pkey, Heap Fetches 0)`, **Seq Scan 0**. 100ms 게이트 통과.
- [x] **출력 정확** — 24 버킷 UTC 정렬, 롱/숏 분리, 진행 중 버킷(08:00) 자동 제외. 사용자 대시보드 실행 결과 일치.
- [x] **notional 절벽 방어 실증** — 18일 창 테스트에서 07-05 이전 = `total_notional NULL`(0 아님) + `null_notional_count = event_count`. **가장 교묘한 케이스**인 07-06(롤아웃 당일)은 합계 $171M 인데 `null_notional_count = 9,451` = "부분적으로만 집계된 날"이 정확히 표시됨.
- [x] **배포 후 객체 검증** — `prosecdef = false`(INVOKER ✓) / `anon EXECUTE` 권한 ✓ / 트리거 `tgenabled='O'` ✓ / 오염 잔여 **0** ✓
- [x] **위생 #7** — `history_futures_liquidation` · `symbols` 양쪽 anon SELECT policy(`qual=true`) 사전 확인 → INVOKER 로 "200 OK + 빈 결과" 함정 회피.

### 정리 결과 실측 (2026-07-19)

| 검증 | 결과 |
|---|---|
| 오염 잔여 (`coinm` ∧ `_` 없음) | **0행** |
| KORUUSDT USDM 행수 | 8,611 → **8,613**(신규 2건) = 712행이 **합쳐지지 않고 삭제**됨. 교정 방식이었다면 9,323행으로 총액 부풀림 |
| G2 교정 + notional 재계산 | MUU 107 / SOXS 105 / TZA 17 / ZHIPU 21 / MINIMAX 8 전부 USDM 이동 + **금액 100% 충전** |

---

## 🔄 Step 3~4 — 계약 코드 + dataService 배관 (2026-07-19, 진행 중)

### 완료분

**`packages/shared` (계약층 — 전부 가산, 기존 15 datasource 무변경)**
- `datasourceRegistry.ts`: `FetchKindSchema`("table"|"rpc", default "table") + `RpcSpecSchema`(functionName + **축 고정 strict object** argNames) + entry 3필드(`fetchKind`/`rpcSpec`/`optionalScopeFields`) + superRefine 2건(rpc⇒rpcSpec 필수 / optionalScopeFields 실재성).
  - ★ `argNames` 를 자유 record 가 아닌 strict object 로 둔 이유: 오타(`marketTyp`)가 등록 시점에 안 잡히면 "그 축만 조용히 미전달" = 전 시장 스캔 같은 silent-wrong.
  - ★ optionalScopeFields 검사는 **commonFields 도 유효 이름으로 인정** — store 가 머지 **전** raw 를 검증하므로(머지는 getter 시점) 공통 상속 필드를 빠뜨리면 정상 선언이 거짓 거부돼 datasource 가 통째로 미등록되는 무증상 결함이 된다.
- `defaults.ts`: `liquidation_volume_history` 등록(rpc + optionalScopeFields:["symbol"] + 축 6필드, 집계 값 컬럼 미노출) + `chart-card.dataShapes` 가산(requiredFields=`["market_type"]` — symbol 은 선택이라 필수 축이 아님) + `liquidation` 주석을 **이력형으로 갱신**(별도 id 분리 근거 명시).
- `defaults.ts` chart-card description: **"for one symbol" 단정 삭제** — 시장 전체 집계 서빙 datasource 가 생겨 부류 전체에 참이 아니게 됐다. 스코프 규칙은 각 datasource description 소유(form desc 는 부류 전체에 참인 것만 — `feedback_form_desc_no_datasource_id` 계보).
- `aiCardConfig.ts` superRefine (3) **일반화 2건**: ① 발화 조건 `ds.table` → `isServedByDataLayer = table || fetchKind==="rpc"`(RPC 서빙은 table 이 없어 스코프 강제가 통째로 꺼지면 [10-91] 재발. kline 은 여전히 자연 면제) ② symbol 강제에 `optionalScopeFields` 면제(**marketType 강제는 면제하지 않음** — PK prefix 축은 여전히 필수).

**`apps/web` (배관층)**
- ➕ `lib/dataService/rpcFetch.ts` — `.rpc()` **유일 진입점**(카드·AI 직접 호출 금지 = initialFetch choke point 원칙). 축→인자명 매핑은 registry rpcSpec 파생. 매핑에 없는 축은 조용히 버리지 않고 **warn**. SSR/미배포/권한 실패 전부 빈 배열 graceful.
- ✏️ `lib/dataService/seriesFetch.ts` — `fetchKind==="rpc"` 분기 **가산**(table 경로 무변경 = history 7종 회귀 0). `symbols` 가 비면 **전 시장 집계 1회 호출**(symbol 인자 미전달, group key `__market__`). RPC 는 DESC 반환이라 table 경로와 동일하게 reverse → oldest-first 계약 유지. `side` 파라미터는 **rpc 경로에서만** 전달(table 경로에 넘기면 pushdown 없이 조용히 무시되는 silent-wrong).

### 검증 (완료분)

- [x] `pnpm -F @travis/shared test` **121 PASS** (신규 3: 불변식 4c 정확값 핀 / 4d 스키마 거부 / 스코프 면제 3케이스)
  - ★ **불변식 4 정확값 핀이 신규 datasource 를 즉시 적발** — 과다·오태깅 그물이 설계대로 작동(의도된 변경이라 핀 갱신).
  - ★ 신규 핀: `fetchKind==="rpc"` 인 datasource 정확값 `["liquidation_volume_history"]` / `optionalScopeFields` 정확값 / rpc 아닌 전 datasource 는 `rpcSpec` 부재 / argNames 정확값(키 오타 = 축 조용한 미전달).
  - ★ 테스트가 registry store 를 오염시키지 않도록 성공 케이스는 `registerDatasource` 대신 **스키마 safeParse** 로 검증(`ensureRegistries` 는 `beforeAll` 이라 describe 안에서 store 공유 — 더미가 남으면 위 전수 정확값 핀이 깨진다).
- [x] `pnpm -r type-check` **전 워크스페이스 green**

### Step 4 잔여 — 표시 계약 + 폼 가드 (완료)

- ✏️ `lib/cards/chartDescriptors.ts`: `LIQUIDATION_VOLUME_HISTORY` descriptor + `ChartDescriptor.disclosure` 필드 신설.
  - **★ `valueField: "total_notional"` 한 컬럼이 3형태를 덮는다** — RPC 가 side 를 pushdown 하므로 `filters side="SELL"` 이면 `total_notional ≡ 롱 청산액`, `="BUY"` 면 `≡ 숏`, 생략이면 양쪽 합. 즉 **Phase 1 이 이미 총합·롱만·숏만 3형태를 제공**하고, Phase 2 는 "롱·숏 **동시**"(다이버징) 하나만 남는다.
  - `seriesStyle:"bars"`(이산 버킷 = 펀딩 정산 동형. 구간 합계를 선으로 이으면 "연속 변화"라는 없는 함의) / `midline` 없음(금액 ≥ 0) / `tone:"neutral"`(**총량은 그 자체로 방향이 아니다** — 방향색은 side 가 갈린 Phase 2 소관) / `defaultInterval:"1h"` **폴백 전용**.
  - **`disclosure` 신설 근거**: 피드는 낱장 사건이라 각 행이 참이고 "전체"를 주장하지 않지만, **차트는 y축 자체가 "이 구간의 총액"을 암시**한다 — 같은 데이터라도 form 이 바뀌면 오독 위험이 오른다(crypto-domain 판정). AI subtitle 위임만으로는 부분 실패 시 대가가 커서 시맨틱 레이어가 바닥선을 보장. form 은 "있으면 그린다"만 알아 하드코딩 0.
- ✏️ `components/cards/ChartCard.tsx`: `allowsMarketWide`(registry `optionalScopeFields` 파생) → `hasScopeTarget` 로 심볼 가드 완화(기존 7종 안내문 불변) + `disclosure` 상시 오버레이(UTC 표식 대칭, `pointer-events-none`) + **`sideFilter` 파생**(AI filters → 훅. registry 가 side 를 선언한 datasource 에만 전달 — 아니면 fetch 층이 조용히 무시해 값이 틀린다).
- ✏️ `lib/dataService/{types,useDataServiceSeries}.ts`: `side` 축 관통.
- ✏️ 테스트 핀: `columnsForKey` **삼항 → 명시 맵**(3번째 소스가 생겨 옛 삼항은 새 key 가 조용히 잘못된 테이블 컬럼셋으로 떨어져 **오타 valueField 가 거짓 통과**하는 구조가 됐다 — `feedback_column_drop_grep_misses_test_pins` 계보) / `ds.table` 단정 → `fetchKind==="rpc"` 분기(rpc 엔트리는 table 부재가 정상, 있으면 두 경로 겸용 모순) / KEYS 7→8 / 렌더 매트릭스 스냅샷 +1.

### ✅ 검증 (Step 3~4 통합)

- [x] `pnpm -F @travis/shared test` **121 PASS** / `pnpm -F web test` **505 PASS**
  - ★ 정확값 핀 2개가 신규 조합을 **즉시 적발**(registry 불변식 4 / 렌더 매트릭스) = 과다·오태깅 그물이 설계대로 작동. 의도된 변경이라 갱신.
- [x] `pnpm -r type-check` 전 워크스페이스 green / `pnpm -F web lint` clean
- [x] 원자 배포 조건 충족 — datasource·descriptor·fetch 배관이 **한 커밋에** 존재 (`feedback_datasource_form_atomic_deploy`)

### 남은 작업 (Phase 1)

| # | 내용 |
|---|---|
| Step 5 | `[10-81]` `buildSystemPrompt` 현재시각 주입 + **기존 쿼리 회귀 0**(프롬프트 전역 변경이라 이게 핵심 비용) |
| Step 6 | 라이브 G2 — **파생 parity**(차트 버킷값 ≡ 직접 SQL SUM) / notional 절벽(30일 창에서 0 막대 아닌 결측) / 진행 중 버킷 미붕괴 / sampled 고지 도달 / **AI 자율 분기 4+ 쿼리**(버킷·기간·형태·범위가 코드 분기 0으로 갈리는지 log_chat 대조) + `@code-reviewer` + `@crypto-trader` + docs/commit |

---

## 🔴 착수 중 발견 — 청산 마켓 오분류 (해소 완료)

Step 1의 DB 실측 중 **기존 데이터의 정확도 결함**을 발견했다. 본 사이클이 만든 결함이 아니며, 신규 소비자(집계)가 잠복 결함을 표면화시킨 사례(`feedback_new_card_surfaces_latent_data_defect`).

**실측 사실 (supabase 직접 확인, 2026-07-19)**

| 항목 | 값 |
|---|---|
| `market_type='futures_coinm'` 인데 심볼이 USDT 페어 | **1,232행** |
| 기간 | 2026-07-09 14:07 ~ 07-17 04:25 (이후 현재까지 0) |
| 대표 심볼 | KORUUSDT(712)·MUUUSDT(107)·SOXSUSDT(105)·ZHIPUUSDT(21)·TZAUSDT(17)·MINIMAXUSDT(8) |
| 마스터상 실제 정체 | 전부 **`futures_usdm` / TRADING / `contract_type = TRADIFI_PERPETUAL`** (Binance 신상품 = 미국 주식·ETF 무기한) |
| `notional` | **전부 NULL** (COINM 경로가 contractSize를 못 찾아 계산 실패) |
| 같은 심볼의 정상 USDM 행 | 8,611행 (2026-07-19 07:39까지 계속 정상 유입) |
| `now_futures_ticker` / `now_futures_indicator` 오염 | **0건** — 청산(forceOrder) 경로 한정 |

**의미**: (a) 지금도 "COIN-M 청산"을 조회하면 한국 3배 ETF(KORU)가 COIN-M으로 노출 = 사이트=DB 위반 (b) notional NULL이라 해당 청산액이 USDM 총합에서 조용히 누락 (c) 2026-06-30 발효 CM 병합 스트림의 `st` 판별 함정([10-14] 상시 감시)의 **3번째 적중** — ff#2(07-06)에서 21.9만 행 청소 후 "재오염 0" 확인했으나 신상품 등장과 함께 07-09부터 재발.

**본 사이클 영향**: **없음** — Step 1 결정 8)의 마스터 INNER JOIN이 유령 행을 자동 제거하므로 집계 차트는 처음부터 안전.
**기존 카드 영향**: 있음(피드·표는 필터 없음).

### 근본원인 (확정, `@backend-infra-specialist` 진단 2026-07-19 — 코드 역산 + DB 실측)

**초기 추측("TradFi 신상품이라 뚫렸다")은 기각.** 오염 14종 중 **7종은 평범한 크립토 무기한**(BOT/BNC/SNXX/INTW/WEN/XBI/FWDI). 유일한 공통점은 **"상장 직후"**.

1. **`st` 분기는 죽은 코드** — `!forceOrder@arr` 페이로드에 `st` 필드가 **애초에 없다**(`!ticker@arr` 에는 있음 — 스트림마다 다름). 역산 증명: `st` 가 숫자였다면 UM 이벤트는 `st=1 ≠ expectedSt(2)` 로 반드시 drop 됐을 것인데 오염 행이 존재한다 ⇒ `typeof st !== "number"` 확정. **ff#2 주석의 "st 가 있으면 신규 상장 오폭 완전 면역" 주장은 성립한 적이 없다** (`forceOrderWsHandler.ts:131-155`).
2. **유일 방어선인 폴백이 fail-open** — "상대 마켓 allowlist 에 **있다고 확인될 때만** drop". 신규 상장 심볼은 워커 **인메모리** allowlist(24h 갱신)에 없어 **모르면 통과**된다. 방향이 뒤집혀 있다.
3. **오염 창 = 상장 → 다음 24h refresh**. DB `symbols` 는 1h 동기화지만 워커 인메모리는 24h(`index.ts:454-476`), per-symbol WS 구독은 **재부팅 시에만** 갱신. 실측 7건이 전부 워커 재부팅(07-14 04:26 UTC) 기준 refresh 경계와 일치 — MUUUSDT 는 상장 **3초 후** 오염 시작.
4. **ticker/markPrice 면역은 필연** — 그쪽은 "자기 마켓 allowlist 에 있는 것만 수용"(fail-closed). 청산만 "경로 B는 이력 보존" 정책으로 양성 필터를 의도적으로 우회했고, 그 대가로 fail-open 폴백이 유일 방어선이 됐다.
5. **07-17 이후 멈춘 건 고쳐져서가 아니라 신규 상장이 없어서** — 워커 코드 최종 변경은 07-14.

**🚨 재발 확정**: 2026-07-20 03:00~03:10 UTC 상장 3종(HK0700USDT·HK1810USDT·TENCENTUSDT, 창 ~1.5h) + 09:00 SPCXUSD1(창 ~19.5h).

### 사용자 결정 (2026-07-19) 및 처분

| # | 결정 | 내용 |
|---|---|---|
| 1 | **드롭 전용 트리거** (워커 무접촉) | `20260719000002_..._market_guard.sql` — coinm 라벨인데 심볼에 `_` 없으면 BEFORE INSERT 에서 폐기 + `RAISE WARNING` |
| 2 | **방어 적용 직후 기존 행 정리** | `20260719000003_..._cleanup.sql` — G1 DELETE / G2 교정+notional 재계산 |
| 3 | 워커 근본 수정 | **다음 워커 사이클**로 이월 → `[10-117]` 등재. 그때 `[10-110]` Step 0 동반 |

**★ CTO가 자문안을 수정한 지점 — "교정" 기각, "폐기" 채택**: 자문 초안은 트리거가 `market_type` 을 usdm 으로 **교정**하자고 했으나, 이 테이블의 유일 제약이 `PRIMARY KEY(id)` 뿐이라 **중복 방지 장치가 없다**. 정본이 따로 들어오는 케이스(KORUUSDT)에서 교정은 곧 **중복 생성 = 청산 총액 2배 오염**이 된다. 폐기는 두 케이스 모두에서 현 상태보다 엄격히 낫다(신규 상장 건은 어차피 틀린 라벨로 저장돼 못 쓰는 데이터 / 정본 중복 건은 버리는 게 정답). 대가인 무음 손실은 `RAISE WARNING` 으로 관측 가능하게 둔다.

**검출 조건 = `strpos(symbol,'_') = 0`** — `LIKE '%USDT'` 로 쓰면 quote 가 USD1 인 **SPCXUSD1**(07-20 상장 예정)을 놓친다. COINM 심볼이 예외 없이 `_` 를 포함한다는 **시간 무관 구조 불변식**이 allowlist 스냅샷보다 견고하다.

### G1/G2 분류 (CTO 직접 실측 검증, 자문 결과와 일치)

| 그룹 | 심볼 | 행수 | USDM 정본 완전중복 | 처분 |
|---|---|---|---|---|
| G1 | KORUUSDT | 712 | **712 / 712 (100%)** | DELETE |
| G2 | 13종(MUU 107·SOXS 105·SKHY 80·BOT 64·BNC 56·SNXX 36·ZHIPU 21·TZA 17·INTW 14·MINIMAX 8·WEN 8·XBI 3·FWDI 1) | 520 | **0 / 520** | market_type 교정 + notional 재계산 |

14종 전부 `symbols` 마스터에 `futures_usdm` / `TRADING` 으로 존재 확인 → 정리 후 집계에 정상 반영됨.

### 부수 발견 (별도 등재)

- **역방향 무음 손실** — 신규 상장 심볼은 refresh 후 병합 스트림 사본이 걸러지는데 per-symbol 구독은 **재부팅 전까지 생기지 않아** 그 사이 청산이 통째로 유실(SKHYUSDT 07-11~07-14 실측 0건). 오염보다 조용해 더 위험. → `[10-118]`
- **dedup 주석이 사실과 다름** — `forceOrderWsHandler.ts:18-21` 은 "복합 고유 인덱스가 중복을 자연 처리"라 적었으나 실제 제약은 `PRIMARY KEY(id)` 뿐이고 두 인덱스는 **비유니크**. KORUUSDT 712행 중복이 그 증거. → `[10-117]` 수정 시 동반 정정

---

## ⚠️ 다음 step에서 조심할 것

- **`table` 미설정 엔트리의 파급**: 신규 datasource는 `table` 이 없다. `resolveDatasourceTable` / `filterPushdown` / `channelManager` 등 "table 존재"를 전제하는 코드 경로를 Step 3에서 전수 확인할 것. 이미 알려진 1곳 = `chartDescriptors.test.ts:70`(모든 chart descriptor의 `ds.table` 단정) — **놓치면 빌드 red라 조용히 새지는 않음**.
- **Step 2 EXPLAIN 필수**: 기존 인덱스는 `(exchange, market_type, symbol, trade_time DESC)` 와 `(trade_time DESC)` 2종. per-symbol과 시장 전체가 각각 어느 인덱스를 타는지 실측 — 비-PK-prefix 스캔은 이미 Disk IO 사고 벡터로 분류돼 있음.
- **RPC 보안 3종 세트**: `SECURITY INVOKER`(DEFINER 금지) + `SET search_path = public, pg_temp` + 버킷 파라미터 allowlist 검증(미허용 시 throw 아닌 폴백). `GRANT EXECUTE TO anon, authenticated` 후 **anon 경로로 실제 200+행 반환 확인**(RLS deny-all "200 OK + 빈 결과" 함정).
- **notional 절벽**: 금액 컬럼은 **2026-07-06 07:09:35 UTC** 이후 행만(전체 140만 중 977,777행 NULL). RPC가 `null_notional_count` 를 동반 반환해 form이 "0 청산" vs "데이터 없음"을 구분해야 한다.
- **Zod 버전 확인**: 설계는 v3/v4 공통 안전 API만 사용(`z.record(enum, …)` 의도적 회피). 구현 착수 시 context7 1회 확인.

## 📁 관련 파일 경로

**수정 예정**: `packages/shared/src/registries/datasourceRegistry.ts`(fetchKind·rpcSpec·optionalScopeFields) · `defaults.ts`(신규 등록 + chart-card dataShapes) · `schemas/aiCardConfig.ts:521-581`(superRefine (3)) · `schemas/cardStyle.ts`(breakdown) · `apps/web/lib/cards/chartDescriptors.ts` · `components/cards/ChartCard.tsx:151-176,353-369` · `apps/web/lib/dataService/{seriesFetch,types}.ts`
**신규 예정**: `supabase/migrations/*_liquidation_volume_series.sql` · `apps/web/lib/dataService/rpcFetch.ts`

## 🔗 링크

- **이전**: `M3-step2-interaction-2.md`
- **다음(Phase 2)**: `M3-step3b-chart-multicolumn.md` (다중 컬럼 다이버징 + `[10-98]` 분할 + `[10-83]`)
