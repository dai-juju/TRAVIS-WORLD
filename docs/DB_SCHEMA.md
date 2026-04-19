# TRAVIS — DB Schema

> 이 문서는 개발 진행에 따라 점진적으로 채워집니다.
> 테이블은 데이터 종류별로 카테고리를 나누어 관리하며, 각 테이블의 이름·컬럼·인덱스·RLS 정책은 실제 구현 시점에 하나씩 결정합니다.
> 개발 순서는 `docs/ROADMAP.md`를 참조하세요.

## 네이밍 규칙

```
{시점}_{도메인}_{세부}

시점:   now_     = 최신 스냅샷 (Supabase Realtime 구독 대상, 심볼당 1행 유지)
        history_ = 시계열 축적 (차트, 추이 분석, 패턴 분석)
도메인: spot_    = 현물
        futures_ = 선물 (USDM + COINM 모두)
        (확장 루프에서 추가: news_, onchain_, sentiment_ 등)
세부:   ticker, indicator, kline, liquidation, ...
```

## 다중 거래소 처리

모든 테이블에 `exchange` + `market_type` + `symbol` 공통 컬럼이 존재합니다.
- **같은 종류의 새 거래소** → 기존 테이블에 행 추가 (테이블 구조 변경 없음)
- **기존 도메인의 새 지표** → 컬럼 추가 (ALTER TABLE)
- **완전히 새로운 데이터 종류** → 새 테이블 쌍 (`now_` + `history_`) 생성

## 카테고리

- `now_*` — 최신 스냅샷 테이블 (워커 폴링 결과, Supabase Realtime 구독 대상). **거래소 원시 데이터와 사전 계산된 가공 값이 같은 행(row)에 컬럼으로 함께 저장됨.** 컬럼은 3가지 카테고리로 구성됩니다:
  - **원시 데이터**: 거래소 API에서 직접 수집한 값 (가격, 거래량, OI, 펀딩레이트 등)
  - **단순 변화율**: 시간대별 변화율 (가격·거래량·OI 등의 N분/N시간 변화율)
  - **핵심 기술 지표 현재값**: 실시간 스크리닝에 필요한 핵심 지표 (구체 지표 종류는 개발 중 결정)
  
  사전 계산 범위는 **실시간 스크리닝에 필요한 핵심만**으로 한정하여 컬럼 수를 관리합니다. 워커가 메모리의 롤링 윈도우에서 지표를 계산하여 원시 데이터와 함께 한 번의 upsert로 저장. Supabase Realtime 한 번의 행 변경 알림으로 원시값+가공값 모두 프론트엔드에 도달. 별도 가공 테이블 분리 금지 — JOIN 비용과 구독 복잡도 방지. 사용자 로그 분석을 통해 특정 지표가 반복적으로 스크리닝에 사용되면 사전 계산 대상으로 승격 가능.

  **M1.3 Step 4 기준 실제 채움 타이밍 (2026-04-19)**:
  - `now_spot_ticker`, `now_futures_ticker`의 `price_chg_{5m,15m,1h,4h}` / `volume_chg_{5m,15m,1h}` / `volume_ratio` → tickerTask(3초 주기)가 RollingWindow에서 과거 값 조회 → pctChange 계산 → 원시 데이터 row에 merge → upsert.
  - `now_futures_indicator`의 `oi_chg_{5m,15m,1h,4h}` → perSymbolTask(직선 순회, 실질 주기 ~341초)가 OI 도메인 배치 fetch 시 indicatorWindow에서 과거 값 조회 → 같은 row에 merge.
  - **24h 변화율 컬럼은 의도적으로 없음**: Binance ticker가 `price_change_pct` 필드로 24h 변동률을 이미 반환하므로 중복 방지.
  - **volume_chg_5m 해석 주의**: Step 4에서는 24h rolling volume의 차분(해석 A 근사)을 사용하며, Step 5 WebSocket(`!miniTicker@arr` 또는 1m kline 스트림) 연결 후 1m kline 5개 합(해석 B)로 자동 전환될 예정. 컬럼명은 유지되고 데이터만 정확해짐.
- `history_*` — 과거 데이터 축적 테이블, **시계열 분석의 핵심 데이터 소스**. 시간에 따른 변화 추이 조회, 차트 데이터 제공, 과거 패턴 분석에 사용됩니다. 데이터 소스 레지스트리에 `_history` 테이블의 특성·용도·queryable fields가 기술되며, AI가 사용자 의도에 따라 `_now`와 `_history` 중 적절한 소스를 스스로 선택합니다. 설계 가이드라인:
  - **인덱스**: 시계열 조회 최적화 복합 인덱스 (구체 구성은 테이블별로 개발 중 결정)
  - **다운샘플링**: 최근 데이터는 고해상도(원본), 오래된 데이터는 저해상도(집계)로 보관하여 스토리지 효율 관리 (구체 티어·보존 기간은 개발 중 결정)
  - **파티셔닝**: PostgreSQL 네이티브 파티셔닝으로 시간 범위별 분할, 쿼리 성능 확보 및 오래된 데이터 효율적 삭제 (구체 기간 단위는 개발 중 결정)
  - **보존 정책**: 다운샘플링 티어별 자동 보존/삭제 정책 적용 (구체 정책은 개발 중 결정)
  - 저장할 컬럼 범위(원시 데이터만 vs 가공 값 포함)는 개발 중 테이블별로 결정
- `symbols` — 전 거래소 심볼 마스터 (1행 = 1거래소 × 1마켓타입 × 1심볼)
- `log_*` — 로그 테이블 (**RLS 필수**: M1.6에서 `auth.uid() = user_id` 추가)
* 위의 종류는 확장 루프에서 추가/변경될 수 있습니다.

각 테이블이 생성되면 이 문서에 (이름, 목적, RLS 정책, 특이사항)을 추가합니다. 컬럼 구조는 마이그레이션 파일이 진실 공급원이므로 여기에 중복하지 않습니다.

---

## 테이블 목록 (M1.3 — 2026-04-18 생성)

### 마스터

| 테이블 | 목적 | PK | RLS | 비고 |
|--------|------|-----|-----|------|
| `symbols` | 전 거래소 심볼 마스터 | (exchange, market_type, symbol) | M1.6 | 워커가 exchangeInfo 주기 호출로 신규 상장/폐지 자동 반영 |

### _now (최신 스냅샷, Realtime 활성화)

| 테이블 | 목적 | PK | RLS | Realtime |
|--------|------|-----|-----|----------|
| `now_spot_ticker` | 현물 시세 + 사전 계산 (변화율) | (exchange, market_type, symbol) | M1.6 | O |
| `now_futures_ticker` | 선물 시세 + 사전 계산 (USDM + COINM) | (exchange, market_type, symbol) | M1.6 | O |
| `now_futures_indicator` | 선물 지표 통합 (펀딩, 마크, OI, 롱숏, 테이커) | (exchange, market_type, symbol) | M1.6 | O |

### _history (시계열 축적)

| 테이블 | 목적 | PK | 인덱스 | RLS |
|--------|------|-----|--------|-----|
| `history_spot_ticker` | 현물 시세 히스토리 | id (auto) | (exchange, market_type, symbol, recorded_at DESC) | M1.6 |
| `history_futures_ticker` | 선물 시세 히스토리 | id (auto) | (exchange, market_type, symbol, recorded_at DESC) | M1.6 |
| `history_futures_indicator` | 선물 지표 히스토리 | id (auto) | (exchange, market_type, symbol, recorded_at DESC) | M1.6 |
| `history_spot_kline` | 현물 캔들 OHLCV (1m, 5m, 1h, 1d) | (exchange, market_type, symbol, interval, open_time) | PK가 곧 인덱스 | M1.6 |
| `history_futures_kline` | 선물 캔들 OHLCV (1m, 5m, 1h, 1d) | (exchange, market_type, symbol, interval, open_time) | PK가 곧 인덱스 | M1.6 |
| `history_futures_liquidation` | 청산 이벤트 로그 | id (auto) | (exchange, market_type, symbol, trade_time DESC), (trade_time DESC) | M1.6 |

### 로그

| 테이블 | 목적 | PK | RLS | 비고 |
|--------|------|-----|-----|------|
| `log_validation_failure` | AI Zod 검증 실패 로그 | id (auto) | M1.6 | M1.5에서 AI 오케스트레이터가 기록 |

### 마이그레이션 파일

| 파일 | 내용 |
|------|------|
| `supabase/migrations/20260418000001_create_symbols_and_log.sql` | symbols + log_validation_failure |
| `supabase/migrations/20260418000002_create_now_tables.sql` | now_spot_ticker + now_futures_ticker + now_futures_indicator + Realtime 활성화 |
| `supabase/migrations/20260418000003_create_history_tables.sql` | history 6개 테이블 |
| `supabase/migrations/20260418000004_alter_symbols_add_trading_filters.sql` | symbols에 tick_size/step_size/min_notional 추가 |

---

## TypeScript 타입 동기화 (M1.3 Step 2~)

모든 테이블 타입은 `packages/data-service/src/types/database.generated.ts`에서 **자동 생성**하고, `tables.ts`에서 도메인별 짧은 별칭을 붙입니다(예: `NowFuturesTickerInsert`). **진실 공급원은 언제나 이 문서의 마이그레이션 파일**이고, TS는 거울.

### 마이그레이션 추가 시 워크플로
1. `supabase/migrations/` 아래에 새 SQL 파일 추가(또는 `execute_sql`로 DDL 실행).
2. Supabase MCP: `mcp__supabase__generate_typescript_types` 호출.
3. 반환된 타입을 `packages/data-service/src/types/database.generated.ts`에 **전체 덮어쓰기**.
4. 필요하면 `tables.ts`에 새 테이블용 Row/Insert 별칭 추가(보통 1줄씩).
5. `pnpm -r type-check` → 영향 받는 컬러 자동 탐지.
6. `apps/worker smoke` 재실행으로 회귀 확인.

`database.generated.ts`는 절대 수동 편집 금지 — DB와 어긋나면 배포 후 런타임에 터집니다.

### dataService 경유 규칙 (M1.3 Step 2 확정)
- 모든 Supabase 접근은 `@travis/data-service`의 `IDataService` 계약을 통과합니다.
- `apps/web`·`apps/worker` 런타임 코드에서 `.from('table')` **직접 호출 금지**. 예외: smoke/test 스크립트만 허용(파일 상단에 예외 근거 주석 필수).
- 새 테이블에 대한 읽기/쓰기가 필요해지면 **(1) IDataService에 메서드 시그니처 먼저 선언 → (2) SupabaseDataService에 구현 → (3) consumer에서 호출** 순서. 추측성 메서드 선언 금지(deferred decision).
