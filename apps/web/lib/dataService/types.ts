// apps/web/lib/dataService/types.ts
//
// dataService 공개 면 타입 (M1.6 Step 3, 2026-04-26).
//
// 외부(카드/페이지) 가 보는 면만 정의. 내부 구조 (Entry / Listener) 는
// channelManager.ts 에 비공개.

import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

/** 구독/조회 라이프사이클 상태 — 카드 측 status 표시용. */
export type DataServiceStatus = "idle" | "loading" | "ready" | "error";

/**
 * 단일 row 구독 옵션.
 * `match` 는 client-side row 매칭 함수 — 서버측 channel 은 datasource 단위로
 * 통합되어 있어 server-side filter 사용 안 함 (channelManager Q3 → 옵션 a).
 * 따라서 match 가 PK 매칭(symbol/exchange/marketType) 책임을 진다.
 */
export interface DataServiceRowOptions<T> {
  /** 구독할 테이블 (= datasource id). 예: "now_spot_ticker" */
  datasource: string;
  /**
   * client-side row 매칭. payload 의 new/old row 가 통과해야만 카드로 전달.
   * 단일 row hook 의 의미: "match 가 true 인 row 1개" (보통 PK 정확 매칭).
   * useCallback 안정화 권장 — 참조 변경 시 재구독.
   */
  match: (row: T) => boolean;
  /**
   * 초기 SELECT — 구독 시작 직후 1회 호출되어 기준값 채움.
   * 생략 시 첫 Realtime 이벤트 도착까지 data = null.
   * useCallback 안정화 권장.
   */
  initialFetch?: () => Promise<T | null>;
  /** false 시 구독 안 함. 기본 true. */
  enabled?: boolean;
  /**
   * [10-7] 회수 (M2 테마 A Step 2, 2026-06-09) — 관심 컬럼 dirty check (opt-in).
   *
   * 배경: 테마 A Step 1 에서 같은 물리 테이블(now_futures_indicator)을 가리키는 논리
   *   datasource(premium_index / open_interest / long_short_ratio / taker_long_short)가
   *   channel 을 공유한다. 그런데 markPrice WS 가 1초마다 row **전체**를 push 하므로,
   *   OI 카드의 match 는 symbol 만 보고 통과시켜 funding 만 바뀐 payload 에도 재렌더한다
   *   (fan-out cross-talk).
   *
   * 지정 시: payload 의 new row 가 match 를 통과해도, watchColumns 중 **하나도 값이
   *   바뀌지 않았으면** 카드로 전달하지 않는다 (re-render 억제). 채널 공유는 유지 →
   *   효율은 그대로, 불필요 재렌더만 차단. 저사양(Intel UHD 620) 다중 카드 부하 완화.
   *
   * 생략 시: 기존 동작 (match 통과 = 무조건 전달). TickerCard / 단일 테이블 카드 영향 0.
   * useCallback / useMemo 등으로 참조 안정화 권장 (변경 시 재구독).
   */
  watchColumns?: string[];
  /**
   * 경로 A(ws_direct) 전용 — 토픽 조립용 selector 값 (M2 경로 A Step 3b, 2026-06-22).
   *
   * datasource 의 transport 가 "ws_direct" 일 때 buildLiveTopic(datasource, selector)
   * 으로 워커와 동일한 토픽을 만들어 직결 구독한다. 키는 그 datasource 의
   * liveTopicSpec.selectorKeys 와 일치해야 함 (예: { market_type, symbol }).
   *
   * - transport 가 "realtime"(경로 B)인 datasource 는 **무시됨** (기존 동작 0 영향).
   * - ws_direct 인데 생략/키 누락 시: 토픽을 못 만들어 구독 skip → status loading 유지
   *   (graceful, crash 없음). 콘솔 경고 1회.
   * - 새 객체를 매 렌더 넘기면 재구독 → useMemo 로 참조 안정화 권장.
   */
  selector?: Record<string, string>;
}

export interface DataServiceRowResult<T> {
  data: T | null;
  status: DataServiceStatus;
  error: Error | null;
}

/**
 * 전 테이블 구독 옵션. TableCard(스크리너) 용.
 * Map<pk, row> 형태로 누적된 스냅샷을 throttle 단위로 카드에 전달.
 */
export interface DataServiceTableOptions<T> {
  /** 구독할 테이블 (= datasource id). 예: "now_spot_ticker" */
  datasource: string;
  /** row → 결정적 PK 문자열. 복합 PK 직렬화 함수. useCallback 안정화 권장. */
  pk: (row: T) => string;
  /** 초기 SELECT — 전체 목록. 생략 시 빈 Map. useCallback 안정화 권장. */
  initialFetch?: () => Promise<T[]>;
  /** flush 간격 (ms). 기본 500. 0 시 throttle off (microtask 즉시 flush). */
  throttleMs?: number;
  /** false 시 구독 안 함. 기본 true. */
  enabled?: boolean;
  /**
   * working Map 행 수 상한 (ff#2 재개 Step 4, 2026-07-05 — code-reviewer C2).
   *
   * now_* 스냅샷은 pk 덮어쓰기라 자연 유계지만, 이벤트성 set(청산 등 INSERT 마다
   * 새 pk)은 세션 내내 무한 누적 + flush 전량 복사 O(n) 폭증(폭락장 캐스케이드 =
   * 최악의 타이밍). 초과 시 **삽입 순서 앞(가장 오래 머문 키)** 부터 축출.
   * ⚠️ 정렬-상위 fetch(biggest 류)의 초기 행이 장수 세션에서 먼저 축출될 수 있는
   * 의도된 트레이드오프 — 근본(shape 인식 eviction)은 Stage 2, [10-80].
   * 생략 = 무제한(기존 동작, 회귀 0).
   */
  maxRows?: number;
}

export interface DataServiceTableResult<T> {
  rows: Map<string, T>;
  status: DataServiceStatus;
  error: Error | null;
}

/**
 * 피드 이벤트 1건 (M2 경로 A fast-follow #2 Step 4, 2026-06-28).
 *
 * 청산(forceOrder) 같은 **append-only 이벤트 스트림**을 카드로 넘길 때 각 이벤트를
 * 감싸는 래퍼. 단일 row(덮어쓰기)·테이블(키 갱신)과 달리 "사건이 쌓이는" 구조라,
 * 안정적인 React 리스트 key 가 필수다.
 *
 * - `seq`: **훅 로컬** 단조 증가 번호. 청산 payload 엔 보장된 유니크 id 가 없어
 *   (같은 심볼/가격/수량이 거의 동시 도착 가능) index 를 key 로 쓰면 prepend 시
 *   React 가 전체 행을 재마운트한다. seq 가 유일한 안정 key.
 *   ★ `LiveEnvelope.seq`(워커 연결당 방송 번호, 재연결 리셋·토픽 공유)와 **다름** — 절대 혼용 금지.
 * - `arrivedAt`: 클라이언트 도착 시각(`Date.now`). 상대시간 표시("5s ago")·디버그용.
 * - `row`: 워커가 방송한 원본 payload. 카드가 자기 datasource 스키마로 해석.
 */
export interface FeedEvent<T> {
  seq: number;
  arrivedAt: number;
  row: T;
}

/**
 * 피드(이벤트 스트림) 구독 옵션. 청산 피드 카드 등 `content` updateMode 카드용.
 *
 * `useDataServiceRow`(단일 최신 row)·`useDataServiceTable`(스냅샷 목록)과 별개로,
 * 도착 이벤트를 상한 N개 ring buffer 에 누적(newest-first)하고 초과분은 제거한다.
 *
 * ★ **ws_direct(경로 A) 전용** — 이벤트 스트림이 존재 이유다. transport 가 realtime
 *   이거나 토픽 조립 실패면 구독하지 않고 빈 배열(idle)을 반환한다(경로 B 폴백 없음 —
 *   Row 훅과 의도적 차이). 청산 datasource 가 realtime 인 Phase A 동안 자동 휴면.
 */
export interface DataServiceFeedOptions<T> {
  /** 구독할 datasource id. transport 가 ws_direct 일 때만 실제 구독. 예: "liquidation" */
  datasource: string;
  /**
   * 경로 A 토픽 조립용 selector. buildLiveTopic(datasource, selector) 로 워커와 동일한
   * 토픽을 만든다. 키는 datasource 의 liveTopicSpec.selectorKeys(+optionalSelectorKeys)와
   * 일치해야 함. 예: 전체 tape = `{ market_type }`, 심볼별 = `{ market_type, symbol }`.
   *
   * ★ 안정화는 **훅이 흡수**(값 기준 토픽 메모이즈) — 인라인 객체로 매 렌더 새로 넘겨도
   *   내용이 같으면 동일 구독이라 무한루프/버퍼 소실 없음. **값이 바뀔 때만** 재구독+버퍼
   *   clear(예: BTC→ETH). useMemo 는 권장(잉여 직렬화 절약)이나 필수 아님. 불완전 시 휴면(빈 배열).
   */
  selector?: Record<string, string>;
  /**
   * 버퍼에 넣기 전 이벤트를 거르는 술어(AI 임계값 등 — 예: "$100k+ 청산만").
   * false 반환 row 는 피드에서 제외. throw 시 그 이벤트만 제외(피드 전체는 안 막힘).
   *
   * ★ ref 로 **라이브 적용** — 참조가 매 렌더 바뀌어도 재구독/clear 없음(무한루프 방어).
   *   filter 변경은 **새 이벤트부터** 적용(기존 버퍼는 안 비움 = 임계값 조정 forward). 생략 시 전량 통과.
   */
  filter?: (row: T) => boolean;
  /**
   * ring buffer 상한(개수). 초과 시 가장 오래된 이벤트부터 제거. 기본 100.
   * ★ 변경 시 재구독 = **버퍼 비워짐 + WS 재구독** — 동적 슬라이더에 직접 바인딩 금지(고정 config 로).
   */
  limit?: number;
  /**
   * flush(재렌더) 최소 간격 ms. burst 흡수용. 기본 250. 0 이면 microtask 즉시.
   * ★ limit 과 동일 — 변경 시 버퍼 clear + 재구독(동적 컨트롤 바인딩 금지).
   */
  throttleMs?: number;
  /** false 시 구독 안 함(idle + 빈 배열). 기본 true. */
  enabled?: boolean;
  /**
   * 과거 이벤트 seed (ff#2 Step 7, 2026-07-06 — 사용자 결정 "빈 피드로 시작 X").
   *
   * 구독 시작과 동시에 호출되어 최근 이벤트로 버퍼를 미리 채운다 — 카드가 "최근
   * 흐름"이라는 컨텍스트를 안고 시작하고 라이브가 그 위에 이어붙는다.
   * ★ 계약: **oldest-first** 배열 반환(호출자가 정렬 책임 — 훅은 timeField 를 모름).
   * ★ filter 는 seed 행에도 동일 적용(라이브와 같은 조건). 실패 시 라이브-only 로
   *   graceful 진행(console.warn). 재구독(selector 변경) 시 재실행. 생략 = 빈 시작.
   * ★ form-레벨 표준 능력 — 특정 데이터 하드코딩 아님(어떤 events datasource 든 동일).
   */
  seedFetch?: () => Promise<T[]>;
  /**
   * seed↔라이브 중복 제거 키 (seedFetch 와 세트, 선택).
   *
   * seed 조회와 첫 라이브 이벤트 사이의 겹침 창(같은 사건이 DB 조회와 방송 양쪽에서
   * 도착)을 제거한다. 버퍼 내 키 집합을 유지(O(limit))해 동일 키 재도착을 skip.
   * 생략 시 dedupe 없음(겹침 허용). throw 시 그 행만 dedupe 미적용(graceful).
   */
  dedupeKey?: (row: T) => string;
}

export interface DataServiceFeedResult<T> {
  /**
   * newest-first 정렬. 원소 참조 불변(React.memo 행 단락 가능). 최대 limit 개.
   * ★ 각 이벤트는 "도착 시점에 활성이던 filter" 를 만족 — 런타임에 filter 를 **강화**하면
   *   옛 항목이 age out(밀려나기) 전까지 잔류해 현재 filter 를 불만족할 수 있다(forward 적용).
   */
  events: FeedEvent<T>[];
  status: DataServiceStatus;
  error: Error | null;
}

/**
 * 시계열 곡선 1개 (Composable Stage 2 Step 2, 2026-07-08).
 *
 * - `key`: React/uPlot 시리즈 안정 정체성. 현재 = symbol. Stage 4(다중 metric
 *   오버레이)에서 `"${datasource}:${symbol}"` 로 확장해도 shape 가 안 깨지도록
 *   symbol 과 분리해 둔다.
 * - `symbol`: 시맨틱 정체성 — 범례 라벨·descriptor 조회용.
 * - `rows`: **oldest-first(timeField 오름차순) 를 훅이 보증**하는 raw row 배열.
 *   값 추출({t,v} projection)·단위·색은 chartFormat(form 픽셀 레이어) 소관 —
 *   훅은 "어느 컬럼이 값인지" 를 몰라야 datasource-agnostic (Form↔Data 직교).
 */
export interface SeriesGroup<T> {
  key: string;
  symbol: string;
  rows: T[];
}

/**
 * series(시계열) 구독 옵션 — 4번째 형제 (Composable Stage 2 Step 2, 2026-07-08).
 *
 * ★ 3형제와 결정적 차이 2가지:
 *   1) **Realtime push 없음 → 주기 pull** — history 테이블은 밀어주는 스트림이 없어
 *      훅이 스스로 재fetch 한다(refreshIntervalMs). TRAVIS 첫 주기 pull 구현.
 *   2) **호출자 콜백 0개** — Row/Table 의 initialFetch, Feed 의 filter/seedFetch 와
 *      달리 fetch 를 primitive 옵션(eq 축 + symbol + range + order)으로 완전 명세해
 *      훅이 스스로 만든다 → ref-안정화 표면 자체가 없음(footgun 최소).
 *      symbols[] 만 값-기준 메모(인라인 배열 안전).
 *
 * ★ 다중 심볼 = **per-symbol 병렬 쿼리** (backend-infra 실측 2026-07-08: PK prefix
 *   완전 정합 7ms vs `symbol IN + 글로벌 정렬` 500ms 디스크 폭탄 — IN 금지).
 */
export interface DataServiceSeriesOptions {
  /** datasource 논리 id. 훅은 문자열에 무지 — resolveDatasourceTable 이 물리 매핑. */
  datasource: string;
  /**
   * 곡선 심볼들. 1개=단일, N개=오버레이(같은 metric). [] = idle(fetch 안 함).
   * ★ 값-기준 메모 — 인라인 배열로 매 렌더 새 참조여도 내용 같으면 재fetch 없음.
   *   순서가 곧 출력 순서(uPlot 색/범례 슬롯) — 순서 변경은 재fetch.
   */
  symbols: string[];
  /** eq 축 필터. 생략 = 무제약. ★ DB 저장값 기준: market_type 은 "futures_usdm"
   *  (WS 토픽의 "usdm" 문자열과 다름 — backend-infra 실측 0행 함정). */
  exchange?: string;
  marketType?: string;
  /**
   * interval eq (예: "5m"·"1h"). 생략 시 cadence 혼합 = 깨진 x축 — 훅은 기계라
   * 통과시키고, 정책(유효 interval 강제)은 상위 AI-config zod(Step 3/5)가 담당.
   */
  interval?: string;
  /**
   * 집계 부분집합 축 ([10-84] M3-step3a) — 집계 RPC datasource 에서만 의미.
   * 예: 청산 `side="SELL"`(롱 강제청산만). ★ table 경로 datasource 에는 전달되지
   * 않는다 — initialFetch 가 임의 값 필터를 pushdown 하지 않아, 넘기면 스키마는
   * 통과하고 값만 조용히 틀리는 silent-wrong 이 된다(seriesFetch 가 분기에서 차단).
   */
  side?: string;
  /** 정렬 시간축 컬럼. 기본 "recorded_at" (history_* 공통). */
  timeField?: string;
  /** 상대 시간창(ms) → timeField >= now-lookback 서버 range. 생략 = 시간 무제약. */
  lookbackMs?: number;
  /** series 당 최신 포인트 상한(심볼별 limit — 합산 아님). 기본 500. */
  maxPoints?: number;
  /**
   * 주기 pull 간격(ms). 생략/0 = 1회성 fetch.
   * ★ 데이터 interval 보다 빠르게 주지 말 것 — 새 봉이 없는데 전체 재fetch 낭비
   *   (권장: interval/2 비례, backend-infra 자문. 닫힌 봉은 안 바뀌어 신선도 손실 0).
   */
  refreshIntervalMs?: number;
  /** false = 구독 안 함(idle). 카드 IntersectionObserver 오프스크린 pause 이음매. 기본 true. */
  enabled?: boolean;
}

export interface DataServiceSeriesResult<T> {
  /**
   * symbols[] 입력 순서 보존(색/범례 안정). ★ 변화 없는 series 는 **이전 참조 재사용**
   * (length + 마지막 row shallow 비교) → uPlot setData/React.memo 가 변한 곡선만 갱신.
   */
  series: SeriesGroup<T>[];
  status: DataServiceStatus;
  /** hard fail(첫 fetch 전체 실패, 표시할 데이터 0)에서만 set. soft fail 은 null 유지. */
  error: Error | null;
  /**
   * 마지막 **성공** fetch 시각(epoch ms). soft fail(재fetch 실패, 기존 데이터 유지) 시
   * 전진하지 않음 → 소비자가 staleness 를 스스로 계산("as of HH:MM"). null = 아직 없음.
   */
  lastUpdatedAt: number | null;
}

/**
 * channelManager 내부에서 Realtime payload 를 listener 에게 전달할 때 사용.
 * hooks.ts 가 import — 외부 노출 X (index.ts 에서 export 안 함).
 */
export type RealtimePayload<T extends Record<string, unknown>> =
  RealtimePostgresChangesPayload<T>;
