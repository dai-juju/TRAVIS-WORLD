// TRAVIS 워커 진입점 (M1.3 Step 5e ~ M2 테마 A Step 2.5, 2026-06-10).
//
// 역할:
//   - REST 어댑터 2개 (perSymbolTask 전용) + WsRelay(COINM @arr) + ChunkedRelay
//     (USDM·spot per-symbol) + KlineRelay(1m kline)
//   - 롤링 윈도우 3개: ticker / indicator / volumeKline(1m)
//   - REST poller: perSymbolTask 1개 (OI/LSR/Taker — WS 스트림 없음)
//   - SIGINT/SIGTERM 수신 시 graceful shutdown (poller + ws 3종 전부)
//
// WS 구독 정책 (M2 테마 A Step 2.5 — [10-11] @arr stall 근본 수정, 2026-06-10):
//   - spot          : `<symbol>@ticker` chunked (full 21필드) — @arr stall 회피
//   - futures_usdm  : `<symbol>@ticker`(full 17필드) + `<symbol>@markPrice@1s`
//                     + `<symbol>@forceOrder` chunked — @arr stall 회피 + full 승격
//   - futures_coinm : `!ticker@arr` + `!markPrice@arr@1s` + `!forceOrder@arr`
//                     현행 유지 (30심볼 소형 @arr 무사고 — 변경 0)
//   상세 사유는 아래 WS_SUBSCRIPTIONS / CHUNKED_STREAM_SUFFIXES 주석 참조.
//
// 절대 crash 금지(CLAUDE.md): main catch에서 exit 1 하지 않고 로그만 남긴다.
// 단, 초기 부팅 실패(adapters 생성 등)는 워커가 돌아갈 수 없으니 exit 1 허용.

import {
  BinanceCoinmAdapter,
  BinanceSpotAdapter,
  BinanceUsdmAdapter,
} from "./adapters/binance/index.js";
import { RollingWindow } from "./compute/RollingWindow.js";
import type { IndicatorSample, KlineVolumeSample, TickerSample } from "./compute/preCompute.js";
import { dataService } from "./dataService.js";
import { runGracefulShutdown } from "./shutdown.js";
import {
  SELF_RESTART_MAX_ADDED,
  formatAddedSymbols,
  planSymbolRefresh,
} from "./symbolRefresh.js";
// [10-68] (2026-06-27): buildLiveTopic 직접 호출은 makeTopicPublisher 로 이전 —
// 워커는 더 이상 토픽을 직접 조립하지 않음.
import { TierPoller } from "@travis/shared";
import {
  createFundingInfoTask,
  createPerSymbolTask,
  createPremiumIndexTask,
  createSyncSymbolsTask,
  createTicker24hrBatchTask,
  runSyncSymbols,
} from "./poller/tasks/index.js";
import { withTimeout } from "./utils/withTimeout.js";
import {
  BinanceChunkedRelay,
  BinanceKlineRelay,
  BinanceWsRelay,
  MarkPriceWriteCoalescer,
  StreamCoalescer,
  StreamRouter,
  buildPerSymbolStreams,
  createForceOrderWsHandler,
  createKlineWsHandler,
  createMarkPriceWsHandler,
  createTickerWsHandler,
  type CoalescerRule,
  type MarketType,
} from "./ws-relay/index.js";
// 경로 A (WS 프론트 직결) Step 1 + Step 2 — 프론트向 WS 서버 + 방송 버스 + JWT 인증.
import {
  LiveBus,
  LiveWsServer,
  createSupabaseTokenVerifier,
  makeTopicPublisher,
} from "./ws-server/index.js";

// ─── 설정 상수 ─────────────────────────────────────

const ROLLING_WINDOW_MAX_SIZE = 1500; // 25시간치 (1분 간격 샘플링 기준)
const ROLLING_WINDOW_SAMPLE_INTERVAL_MS = 60_000; // 1분 1샘플
/**
 * volumeKlineWindow 는 "최근 10분치" 면 충분 (5m vs 5m 비교).
 * 메모리 절약 위해 15개로 축소 (15분치, 3~4배 여유).
 */
const VOLUME_KLINE_WINDOW_SIZE = 15;
const STATUS_LOG_INTERVAL_MS = 300_000; // 5분마다 상태 로그
/**
 * symbols 재로드 주기 (M1.4 Step 4.7 신설 → M3-step4 [10-118] 차선책으로 1h 단축).
 *
 * 24h → 1h 근거 (2026-07-22, 사용자 결정): 신규 상장 심볼이 인메모리 allowlist 에
 * 없는 창 = 오염([10-117])·무음 유실([10-118])의 창. DB `symbols` 는 syncSymbolsTask
 * 가 이미 1h 동기화이므로 인메모리도 1h 로 정렬해 창을 24h → ≤1h 로 축소한다.
 * 부하: loadAllSymbols 는 DB(supabase) pagination 조회(외부 REST 아님) + 피기백
 * refreshCoinmContractSizes 가 dapi exchangeInfo REST 1콜(weight 극소) — 일 24회는
 * 양쪽 다 무시 가능. 근본 해결(동적 WS 재구독)은 별건 — 대신 신규 상장 감지 시
 * 자기 재시작(아래 symbolRefreshTimer)이 per-symbol 구독 갭을 닫는다.
 */
const SYMBOL_REFRESH_INTERVAL_MS = 60 * 60 * 1000;
/**
 * graceful shutdown watchdog (M3-step4 Step 0, [10-110]).
 * 이 시간 안에 종료가 안 끝나면 강제 exit(1) — 2026-07-14 "반쪽 좀비" 재발 방지.
 * 25s 근거: 각 stop() 은 AbortSignal 기반이라 정상적으로 수 초 내 완료([8-31]ⓑ 검증).
 * ★ production 유닛(travis-worker)의 TimeoutStopSec 이 30s 실측(2026-07-22,
 * `systemctl show`) — systemd SIGKILL(30s)보다 확실히 먼저 발화해 우리가 exit
 * code 로 실패를 보고하고 물러난다 (동시 발화 경합 방지 여유 5s).
 */
const SHUTDOWN_WATCHDOG_MS = 25_000;
/**
 * 신규 상장 자기 재시작 exit code (M3-step4 Step 3).
 * 0(정상)·1(실패)과 구분되는 전용 코드 — systemd 는 Restart=always/on-failure
 * 어느 정책이든 비 0 코드에서 재기동하므로 유닛 설정과 무관하게 재시작이 보장된다.
 * (배포 시 유닛의 RestartPreventExitStatus 에 64 미포함 확인 — Step 4 체크리스트.)
 */
const SELF_RESTART_EXIT_CODE = 64;

// ─── 경로 A (WS 프론트 직결) 서버 설정 (M2 경로 A Step 1 + Step 2, 2026-06-22) ──
// host 기본 127.0.0.1 — Caddy 리버스 프록시(443)가 같은 박스에서 wss→내부 ws 로
// 프록시하므로 WS 서버를 0.0.0.0 으로 직접 열 필요 없음(security-auditor W-1 = 이중 안전).
// ★ Step 4 Phase B (2026-06-24): 핸드셰이크 인증을 HS256 → **ES256/JWKS** 로 전환.
//   이 Supabase 프로젝트는 비대칭 서명(ES256)으로 마이그레이션돼 있어 HS256 검증은
//   토큰을 전량 거부했다(라이브 B-3). SUPABASE_URL 의 JWKS 로 검증 — 미설정이면 fail-closed.
const WS_SERVER_PORT = Number.parseInt(process.env.WS_SERVER_PORT ?? "", 10) || 8081;
const WS_SERVER_HOST = process.env.WS_SERVER_HOST ?? "127.0.0.1";
const SUPABASE_URL = process.env.SUPABASE_URL ?? "";

// 경로 A 토픽 빌더용 marketType → ticker datasource id 매핑 (M2 경로 A Step 4).
//   tickerWsHandler 의 enriched 행을 어느 datasource 의 liveTopicSpec 으로 방송할지 결정.
//   spot→now_spot_ticker / usdm·coinm→now_futures_ticker (DB 테이블 구분과 동일).
//   ★ 토픽 문자열은 워커가 직접 조립하지 않고 buildLiveTopic 단일 진실 경유 —
//   프론트(useDataServiceRow)와 같은 함수·같은 spec 으로 drift 차단(W2 grep gate).
const TICKER_DATASOURCE_BY_MARKET: Record<MarketType, string> = {
  spot: "now_spot_ticker",
  futures_usdm: "now_futures_ticker",
  futures_coinm: "now_futures_ticker",
};

// 경로 A fast-follow #1 Step 3 (2026-06-26) — markPrice(마크/펀딩) 방송 datasource.
//   USDM·COINM 모두 같은 premium_index(물리 테이블 now_futures_indicator) → 맵 불필요.
//   buildLiveTopic 단일 진실 경유 (토픽 리터럴 직접 조립 금지, W2 grep gate).
const PREMIUM_INDEX_DATASOURCE = "premium_index";
// 경로 A fast-follow #2 (2026-06-27) — 청산 datasource id. USDM·COINM 공용
//   (market_type 세그먼트로 토픽 구분). 토픽 리터럴 직접 조립 금지(buildLiveTopics 경유).
const LIQUIDATION_DATASOURCE = "liquidation";

// ─── WS 구독 스트림 (M2 테마 A Step 2.5 — [10-11] @arr stall 근본 수정, 2026-06-10) ──
//
// 히스토리:
//   M1.6 Step 4 hotfix B (2026-04-28): Windows 개발 환경 payload-size selective
//     failure 로 전 마켓 mini 임시 롤백 → M1.8 §8.4-e (2026-05-28) spot 만 full 복귀.
//   M2 테마 A Step 2.5 (2026-06-10): production(Hetzner Linux)에서도 `@arr`
//     큰 프레임 stall 확정 — USDM markPrice/funding frozen + 청산 43일 정지 +
//     spot/usdm 매 2.5분 sawtooth 재연결 (재시작 복구 불가, 구조적).
//     docs/task-record/M2-themeA-incident-arr-stream-stall.md 참조.
//
// 현 구조 (근본 수정):
//   USDM·spot 의 @arr 소비 스트림 전부를 BinanceChunkedRelay(per-symbol,
//   250 streams/conn — 무사고 kline relay 패턴) + StreamCoalescer(1초 재조립)
//   로 이전. COINM 만 본 @arr relay 에 잔류 (30심볼 = 프레임 작아 무사고).
//
//   - spot          : (chunked 로 이전 — 본 relay 구독 0)
//   - futures_usdm  : (chunked 로 이전 — 본 relay 구독 0)
//   - futures_coinm : `!ticker@arr` + `!markPrice@arr@1s` + `!forceOrder@arr`
//     (★ 2026-07-14 Stage 1b G2 hotfix: mini → full 승격 — mini 의 P/p/w/n 부재가
//      매초 null 을 기입해 REST 보강을 클로버링, COINM 24h 변화율 영구 null 이던
//      위생 #9 결함. dstream `!ticker@arr` 는 UM+CM 병합(st 판별) — st 가드는
//      tickerWsHandler 소유. 상세 = M2-cycle5-stage1b.md §8.)
//
//   구독 0개 마켓은 BinanceWsRelay.start() 가 연결 자체를 생략 (기존 동작).
const WS_SUBSCRIPTIONS = {
  spot: [] as const,
  futures_usdm: [] as const,
  futures_coinm: ["!ticker@arr", "!markPrice@arr@1s", "!forceOrder@arr"] as const,
} as const;

// ─── chunked per-symbol 스트림 suffix (M2 테마 A Step 2.5) ──────────────────
//
// 심볼당 suffix 인접 배치(buildPerSymbolStreams) → 모든 chunk 에 markPrice@1s
// (1초 고정 push)가 섞여 연결 생존 신호 보장. sparse 한 forceOrder(청산 없으면
// 무음 — 공식 문서 확인 2026-06-10)가 watchdog 오발동을 일으키지 않는 구조.
//
//   - USDM: @ticker(full 17필드 — [3-50] full 승격) + @markPrice@1s + @forceOrder
//           608 심볼 × 3 = 1,824 streams → 8 연결
//   - spot: @ticker(full 21필드) — 1,408 심볼 → 6 연결
//   - COINM: chunked 미사용 (@arr 잔류)
//
// 페이로드 규모: @arr 시절과 동일한 데이터를 작은 프레임 여러 개로 받는 것 —
// 총 트래픽/파싱량 동급, 연결 수만 +14 (Binance 300 conn/5min 한도 대비 여유).
const CHUNKED_STREAM_SUFFIXES = {
  spot: ["@ticker"] as const,
  futures_usdm: ["@ticker", "@markPrice@1s", "@forceOrder"] as const,
  futures_coinm: [] as const,
} as const;

// per-symbol 단건 → 기존 @arr 핸들러 계약 재조립 규칙 (streamCoalescer.ts 헤더 참조).
// synthetic 이름은 기존 핸들러 canHandle 과 일치해야 함 (tickerWsHandler 등).
// 타입 명시 (code-reviewer W1): mode 오타·키 누락을 컴파일 타임에 차단.
const COALESCER_RULES: readonly CoalescerRule[] = [
  { suffix: "@markPrice@1s", synthetic: "!markPrice@arr@1s", mode: "batch" },
  { suffix: "@ticker", synthetic: "!ticker@arr", mode: "batch" },
  // forceOrder 는 기존 핸들러 계약도 단건 객체 → passthrough
  { suffix: "@forceOrder", synthetic: "!forceOrder@arr", mode: "passthrough" },
];

// ─── 부팅 ──────────────────────────────────────────

async function bootstrap(): Promise<void> {
  console.log("[worker] TRAVIS 워커 부팅...");

  if (!dataService) {
    console.error("[worker] dataService 가 null — SUPABASE env 확인. 종료.");
    process.exit(1);
  }

  // REST 어댑터
  // - usdm/coinm: perSymbolTask (OI/LSR/Taker)
  // - spot/usdm/coinm: ticker24hrBatchTask (24h 변화율 보완, M1.6 Step 4 hotfix B)
  const spotAdapter = new BinanceSpotAdapter();
  const usdmAdapter = new BinanceUsdmAdapter();
  const coinmAdapter = new BinanceCoinmAdapter();

  // ─── [10-22] symbols 마스터 부팅 동기화 (2026-06-11) ─────
  // loadAllSymbols **이전**에 1회 실행 — 신규 상장 심볼이 부팅 allowlist/WS 구독
  // 스냅샷에 즉시 반영되도록 순서 고정. 실패해도 graceful (기존 DB 값으로 진행).
  // 배경: 일회성 시드(04-19) 이후 동기화 태스크 부재로 symbols 2달 stale —
  //   4/19 이후 상장 심볼 전체 부재 사고 (funding 랭킹 카드가 가시화).
  await runSyncSymbols({ spotAdapter, usdmAdapter, coinmAdapter, dataService });

  // ─── 심볼 리스트 조회 (전 심볼 kline WS 구독용) ─────
  const symbols = await loadAllSymbols();
  console.log(
    `[worker] 심볼 로드 완료: spot=${symbols.spot.length} usdm=${symbols.futures_usdm.length} coinm=${symbols.futures_coinm.length}`,
  );

  /**
   * TRADING 심볼 allowlist (M1.4 Step 4.7).
   *
   * tickerWsHandler 가 `!ticker@arr` 수신 시 이 Set 을 체크해 SETTLING/CLOSE
   * 등 상장폐지 심볼은 upsert 하지 않는다. (M1.6 Step 3.5 hotfix 2026-04-27) 참조(Set 객체) 는 유지하고 내용만
   * swap 하는 방식으로 24h 주기 재로드에서 갱신 — 핸들러는 매번 최신 값 조회.
   */
  const tradingSymbolsByMarket = {
    spot: new Set(symbols.spot),
    futures_usdm: new Set(symbols.futures_usdm),
    futures_coinm: new Set(symbols.futures_coinm),
  };

  /**
   * 마켓별 symbol → quote_asset lookup (M2 테마 B [10-2], 2026-06-11).
   * tickerWsHandler 가 매 upsert 에 quote_asset 를 포함시키는 데 사용.
   * allowlist Set 과 동일하게 Record 참조는 유지, 24h 재로드에서 Map 만 교체.
   */
  const quoteAssetBySymbol = symbols.quoteAssetBySymbol;

  /**
   * COINM symbol → contractSize(계약당 USD) 인메모리 맵 ([10-72], ff#2 재개 Step 2).
   * forceOrderWsHandler 가 청산 notional(USD) = z × contractSize 계산에 사용.
   * allowlist 패턴 미러: Map 참조는 고정, 내용만 swap (핸들러는 매번 최신 조회).
   * 부팅 1회 + 24h symbolRefreshTimer 피기백. 실패 시 기존 맵 유지 (graceful —
   * 비어 있으면 COINM notional=null 결측일 뿐 수집·방송은 정상).
   */
  const coinmContractSizeBySymbol = new Map<string, number>();
  const refreshCoinmContractSizes = async (): Promise<void> => {
    const res = await coinmAdapter.fetchContractSizes();
    if (!res.success) {
      console.error(
        `[worker] COINM contractSize 조회 실패 (기존 맵 ${coinmContractSizeBySymbol.size}종 유지): ${res.error}`,
      );
      return;
    }
    coinmContractSizeBySymbol.clear();
    for (const [sym, size] of res.data) coinmContractSizeBySymbol.set(sym, size);
    console.log(
      `[worker] COINM contractSize 맵 갱신: ${coinmContractSizeBySymbol.size}종`,
    );
  };
  await refreshCoinmContractSizes();

  // ─── 롤링 윈도우 3개 ────────────────────────────
  const tickerWindow = new RollingWindow<TickerSample>({
    maxSize: ROLLING_WINDOW_MAX_SIZE,
    sampleIntervalMs: ROLLING_WINDOW_SAMPLE_INTERVAL_MS,
  });
  const indicatorWindow = new RollingWindow<IndicatorSample>({
    maxSize: ROLLING_WINDOW_MAX_SIZE,
    sampleIntervalMs: ROLLING_WINDOW_SAMPLE_INTERVAL_MS,
  });
  // 1m kline volume 전용 — volume_chg_5m 해석 B 계산에만 사용.
  const volumeKlineWindow = new RollingWindow<KlineVolumeSample>({
    maxSize: VOLUME_KLINE_WINDOW_SIZE,
    sampleIntervalMs: ROLLING_WINDOW_SAMPLE_INTERVAL_MS,
  });

  // ─── REST Poller ─────────────
  // M1.9 Step 1 (2026-06-02) — 4 task 등록 (historyBackfillTask 는 apps/collector-history 로 이관):
  //   1. perSymbolTask: OI/LSR Acc/LSR Pos/Global LSR/Taker/Basis (USDM 6 fetcher 직선 ~11분 cycle)
  //   2. ticker24hrBatchTask: 24h 변화율 (M1.6 Step 4 hotfix B 한시, 1분 주기)
  //   3. fundingInfoTask: 1h funding interval 4h/8h cache + symbols dual-write (D9)
  //   4. premiumIndexTask: 30분 mark/index/interest_rate sweep (★ N1 hotfix 2026-07-10:
  //      last_settled_funding_* 채움 제거 — 정산 확정값은 collector-history 소관)
  //
  // history forward-fill 은 별도 IP 가 필요(같은 IP backfill+perSymbol 합산 시 -1003 ban 실측,
  //   2026-05-31)하여 production worker 에서 분리 — apps/collector-history(M1.9) 또는
  //   별도 IP one-shot 스크립트(scripts/runHistoryBackfill.ts)로 수행.
  //
  // 등록 순서 의미 (N1 hotfix 후):
  //   fundingInfoTask ↔ premiumIndexTask 사이 Map 의존은 제거됨(premiumIndexTask 가 더 이상
  //   fundingIntervalHours 를 쓰지 않음). 두 task 는 이제 독립.
  //   같은 cycle 안에서 두 task 가 순서대로 실행되지는 않음 (TierPoller 가 각 task 독립
  //   intervalMs 로 스케줄). 그러나 worker 부팅 직후 fundingInfo 가 먼저 1회 실행되도록
  //   register 순서를 의도적으로 fundingInfo → premiumIndex 로 배치.
  const poller = new TierPoller();
  poller.register(
    createPerSymbolTask({
      usdmAdapter,
      coinmAdapter,
      dataService,
      indicatorWindow,
    }),
  );
  poller.register(
    createTicker24hrBatchTask({
      spotAdapter,
      usdmAdapter,
      coinmAdapter,
      dataService,
      // M1.8 §8.4 (2026-05-26) — TRADING allowlist 주입.
      // 사유: ticker24hrBatchTask 의 fetchTicker24hr 가 BREAK 심볼도 전체 응답 반환.
      // partial upsert 가 BREAK row INSERT → row 만 존재 + last_price/volume 등 NULL.
      // tickerWsHandler 는 이미 TRADING 필터 (M1.4 Step 4.7) — 동일 패턴 미러링.
      tradingSymbolsByMarket,
    }),
  );
  // M1.8 §8.2a-2 신설 — fundingInfo Map source (Map 채움)
  poller.register(
    createFundingInfoTask({
      usdmAdapter,
      dataService,
    }),
  );
  // M1.8 §8.2a-2 신설 — premiumIndex polling (Map 의존, miss 시 8h default)
  // M1.8 §8.4-d (2026-05-26) — TRADING allowlist 주입 (BREAK row 누적 차단)
  poller.register(
    createPremiumIndexTask({
      usdmAdapter,
      dataService,
      tradingSymbolsByMarket,
    }),
  );
  // [10-22] (2026-06-11) — symbols 마스터 24h 동기화 (위생 #3).
  // 부팅 1회는 위에서 runSyncSymbols 로 명시 실행 — task 의 initialDelayMs=24h 가
  // 부팅 직후 중복 실행을 막는다.
  poller.register(
    createSyncSymbolsTask({
      spotAdapter,
      usdmAdapter,
      coinmAdapter,
      dataService,
    }),
  );

  // ─── 경로 A (WS 프론트 직결) Step 1 + Step 2 — 방송 버스 + WS 서버 ──────
  // LiveBus = 프로세스 내부 토픽 pub/sub. tickerWsHandler 가 enriched 행을
  // 여기에 publish → LiveWsServer 가 구독 중인 프론트 클라에게 직결 전달.
  // 경로 B(Supabase upsert)는 그대로 — 두 경로 병행.
  const liveBus = new LiveBus();
  // ★ fail-closed (security-auditor W-3): 인증 없는 WS 서버는 절대 띄우지 않는다.
  //   단 수집 파이프(경로 B)는 SUPABASE_URL 유무와 무관하게 계속 돌아야 하므로,
  //   URL 미설정 시 worker 전체를 죽이지 않고 WS 서버만 graceful 생략(미노출).
  //   (liveBus 는 항상 존재 — 구독자 0 이면 publish 가 무비용 no-op.)
  let liveWsServer: LiveWsServer | null = null;
  if (SUPABASE_URL.length > 0) {
    liveWsServer = new LiveWsServer({
      liveBus,
      // ES256/JWKS 검증 (Step 4 Phase B) — SUPABASE_URL 의 .well-known/jwks.json 공개키.
      verifyToken: createSupabaseTokenVerifier(SUPABASE_URL),
      port: WS_SERVER_PORT,
      host: WS_SERVER_HOST,
    });
  } else {
    console.warn(
      "[worker] SUPABASE_URL 미설정 — 경로 A WS 서버 비활성(인증 없는 외부 노출 차단). 수집(경로 B)은 정상 동작.",
    );
  }

  // ─── StreamRouter + handler 4종 등록 ───────────
  const router = new StreamRouter();
  router.register(
    createTickerWsHandler({
      dataService,
      tickerWindow,
      volumeKlineWindow,
      tradingSymbolsByMarket,
      // 테마 B (2026-06-11): symbols.quote_asset 복제 적재 — allowlist 와 같은
      // 스냅샷이라 TRADING 심볼 lookup miss 구조적 불가.
      quoteAssetBySymbol,
      // 경로 A (Step 1 → Step 4 → [10-68]): enriched ticker 행을 토픽으로 방송.
      //   방송 배선(구독자 0 가드 + buildLiveTopic + publish 루프)은 makeTopicPublisher
      //   단일화 — ticker 는 marketType 별 datasource(spot/usdm/coinm) 해석만 주입.
      publish: makeTopicPublisher(
        liveBus,
        (marketType) => TICKER_DATASOURCE_BY_MARKET[marketType],
      ),
    }),
  );
  // M1.8 §8.4-d (2026-05-26) — markPriceWsHandler 에 TRADING allowlist 주입.
  // BREAK 심볼이 markPrice push 받아 indicator 에 누적되는 stale 함정 차단 (8.4-a 패턴).
  // [10-77] (M2 사이클 1, 2026-07-07) — markPrice DB 쓰기 전용 60초 코얼레서.
  //   경로 A publish(아래)는 매 배치(~1초) 그대로 — 화면 실시간성 무영향.
  //   DB upsert 만 창당 1회 = now_futures_indicator Realtime churn ~60배↓.
  const markPriceWriteCoalescer = new MarkPriceWriteCoalescer({ dataService });
  router.register(
    createMarkPriceWsHandler({
      dataService,
      tradingSymbolsByMarket,
      // 경로 A (fast-follow #1 Step 3 → [10-68]): markPrice 부분 row 를 토픽으로 방송.
      //   ticker 와 동일 makeTopicPublisher 배선 — USDM·COINM 모두 premium_index
      //   datasource(market_type 세그먼트로 토픽 구분)라 marketType 무관 상수 해석.
      //   ★ transport=realtime 휴면이면 premium_index 토픽 구독자 0 → publish no-op.
      publish: makeTopicPublisher(liveBus, () => PREMIUM_INDEX_DATASOURCE),
      writeCoalescer: markPriceWriteCoalescer,
    }),
  );
  // 경로 A (M2 fast-follow #2 Step 2, 2026-06-27) — forceOrder 청산 이벤트를 토픽으로 방송.
  //   markPrice 선례와 동형(makeTopicPublisher). liquidation 은 marketType 무관 상수
  //   datasource (USDM·COINM 모두 동일 datasource, market_type 세그먼트로 토픽 구분).
  //   ★ transport=realtime 휴면 중 → liquidation 토픽 구독자 0 = publish no-op(idle 무비용).
  //   Phase B(Step 6) 워커 재배포 + transport 플립 시 비로소 프론트 구독.
  //   allowlist 통과 심볼만 방송(위생 #1/#2) — 경로 B INSERT 는 무관(이력 보존).
  router.register(
    createForceOrderWsHandler({
      dataService,
      tradingSymbolsByMarket,
      publish: makeTopicPublisher(liveBus, () => LIQUIDATION_DATASOURCE),
      // [10-72] notional(USD) 계산 재료 — 부팅 1회 + 24h 재로드 인메모리 맵.
      coinmContractSizeBySymbol,
    }),
  );
  router.register(createKlineWsHandler({ volumeKlineWindow }));

  // ─── WS relay (common) ──────────────────────────
  const wsRelay = new BinanceWsRelay({
    router,
    subscriptions: {
      spot: [...WS_SUBSCRIPTIONS.spot],
      futures_usdm: [...WS_SUBSCRIPTIONS.futures_usdm],
      futures_coinm: [...WS_SUBSCRIPTIONS.futures_coinm],
    },
  });

  // ─── WS kline relay (전 심볼 1m) ────────────────
  const klineRelay = new BinanceKlineRelay({
    router,
    symbols,
    intervals: ["1m"], // E1 scope: 1m 만
  });

  // ─── WS chunked relay (USDM·spot per-symbol — [10-11] @arr stall 근본 수정) ──
  // 심볼 리스트는 부트 시점 스냅샷 (klineRelay 와 동일 정책 — 신규상장 반영은
  // 워커 재시작 시. 상장폐지는 tradingSymbolsByMarket allowlist 가 upsert 차단).
  const streamCoalescer = new StreamCoalescer({
    router,
    rules: COALESCER_RULES,
  });
  const chunkedRelay = new BinanceChunkedRelay({
    sink: streamCoalescer,
    streamsByMarket: {
      spot: buildPerSymbolStreams(symbols.spot, CHUNKED_STREAM_SUFFIXES.spot),
      futures_usdm: buildPerSymbolStreams(
        symbols.futures_usdm,
        CHUNKED_STREAM_SUFFIXES.futures_usdm,
      ),
      futures_coinm: [], // COINM 은 @arr 잔류 (변경 0)
    },
  });

  // ─── 시작 ───────────────────────────────────────
  poller.start();
  wsRelay.start();
  klineRelay.start();
  streamCoalescer.start(); // relay 보다 먼저 — 첫 메시지부터 버퍼링 가능하도록
  markPriceWriteCoalescer.start(); // [10-77] markPrice DB 쓰기 60초 flush 시작
  chunkedRelay.start();
  liveWsServer?.start(); // 경로 A — 프론트向 WS 서버 (JWT secret 있을 때만)

  // ─── 주기적 symbols 재로드 (Step 4.7 → M3-step4 1h + 자기 재시작) ──────────
  // 실제 setInterval 생성은 graceful shutdown 정의 **뒤**에 있다 (파일 하단) —
  //   refresh 콜백이 신규 상장 감지 시 shutdown("SELF_RESTART") 을 호출하는
  //   상호 참조 때문. 선언만 여기 두어 shutdown 의 clearInterval 이 참조 가능.
  // eslint-disable-next-line prefer-const -- shutdown 과의 상호 참조를 위한 의도적 선언·할당 분리
  let symbolRefreshTimer: ReturnType<typeof setInterval> | undefined;

  // ─── 주기적 상태 로그 ───────────────────────────
  const statusTimer = setInterval(() => {
    const pollerStatuses = poller.getStatus();
    const wsStatus = wsRelay.getStatus();
    const klineStatus = klineRelay.getStatus();
    const mem = process.memoryUsage();
    const memMb = Math.round(mem.heapUsed / 1024 / 1024);
    console.log(
      `[worker] status (heap=${memMb}MB, tickerWin=${tickerWindow.symbolCount()}, indicatorWin=${indicatorWindow.symbolCount()}, volumeKlineWin=${volumeKlineWindow.symbolCount()}):`,
    );
    for (const s of pollerStatuses) {
      console.log(
        `  REST ${s.taskId} (${s.intervalMs}ms, tier=${s.tier}): success=${s.lastSuccess}, fails=${s.consecutiveFailures}, lastErr=${s.lastError ?? "-"}`,
      );
    }
    console.log(
      `  WS  spot: ${wsStatus.spot.state}, attempts=${wsStatus.spot.reconnectAttempts}, lastMsg=${formatAge(wsStatus.spot.lastMessageAt)}`,
    );
    console.log(
      `  WS  usdm: ${wsStatus.usdm.state}, attempts=${wsStatus.usdm.reconnectAttempts}, lastMsg=${formatAge(wsStatus.usdm.lastMessageAt)}`,
    );
    console.log(
      `  WS  coinm: ${wsStatus.coinm.state}, attempts=${wsStatus.coinm.reconnectAttempts}, lastMsg=${formatAge(wsStatus.coinm.lastMessageAt)}`,
    );
    console.log(
      `  KLN total=${klineStatus.totalConnections} connected spot=${klineStatus.connectedByMarket.spot}/usdm=${klineStatus.connectedByMarket.futures_usdm}/coinm=${klineStatus.connectedByMarket.futures_coinm}`,
    );
    // chunked relay (Step 2.5) — maxSilence 가 수초 이상 지속되면 stall 신호.
    const chunkedStatus = chunkedRelay.getStatus();
    console.log(
      `  CHK total=${chunkedStatus.totalConnections} connected spot=${chunkedStatus.connectedByMarket.spot}/usdm=${chunkedStatus.connectedByMarket.futures_usdm}, maxSilence=${chunkedStatus.maxSilenceMs === null ? "-" : `${Math.round(chunkedStatus.maxSilenceMs / 1000)}s`}`,
    );
    // [10-77] markPrice DB write coalescer — 창(60초) 대기 row 수 (Phase B 관측용).
    const mpwStatus = markPriceWriteCoalescer.getStatus();
    const mpwParts = Object.entries(mpwStatus)
      .map(([m, n]) => `${m}=${n}`)
      .join(" ");
    console.log(`  MPW buffered ${mpwParts || "-"}`);
  }, STATUS_LOG_INTERVAL_MS);

  // ─── graceful shutdown ([10-110] 풀 견고화 — 실행기·방어 3종은 shutdown.ts) ──
  // 기존 인라인 Promise.all + 무조건 exit(0) 구조의 결함 3종(부분 실패 시 flush
  // 건너뜀 / hang 시 반쪽 좀비 / 실패 exit 0 위장)은 runGracefulShutdown 이 막는다.
  let shuttingDown = false;
  const shutdown = async (signal: string, exitCodeOnSuccess = 0): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n[worker] ${signal} 수신 — graceful shutdown 시작`);
    clearInterval(statusTimer);
    clearInterval(symbolRefreshTimer);
    await runGracefulShutdown({
      signal,
      exitCodeOnSuccess,
      stops: [
        { name: "poller", stop: () => poller.stop() },
        { name: "wsRelay", stop: () => wsRelay.stop() },
        { name: "klineRelay", stop: () => klineRelay.stop() },
        { name: "chunkedRelay", stop: () => chunkedRelay.stop() },
        // 경로 A — 프론트向 WS 서버 정지 (미기동 시 undefined = no-op)
        { name: "liveWsServer", stop: () => liveWsServer?.stop() },
      ],
      // 순서 의존 (선언 순서대로 순차 실행): streamCoalescer 최종 flush 가
      // handler → enqueue 로 밀어넣은 잔여 markPrice 까지 markPriceWriteCoalescer
      // 가 DB 반영 후 종료 ([10-77] 계약 유지).
      flushes: [
        { name: "streamCoalescer", stop: () => streamCoalescer.stop() },
        { name: "markPriceWriteCoalescer", stop: () => markPriceWriteCoalescer.stop() },
      ],
      watchdogMs: SHUTDOWN_WATCHDOG_MS,
      exit: (code) => process.exit(code),
    });
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  process.on("unhandledRejection", (reason) => {
    console.error("[worker] unhandledRejection:", reason);
  });

  // ─── 주기적 symbols 재로드 본체 (M3-step4 Step 3 — 판정 로직은 symbolRefresh.ts) ──
  // 1h 마다 symbols 테이블에서 TRADING 상태를 다시 가져와 allowlist Set 교체 +
  // 신규 상장 감지 시 graceful 자기 재시작. 에러는 로그만 남기고 기존 Set 유지.
  symbolRefreshTimer = setInterval(() => {
    loadAllSymbols()
      .then((fresh) => {
        const plan = planSymbolRefresh(tradingSymbolsByMarket, fresh);

        // 부분 실패 위생: 빈 리스트 마켓은 swap 생략 (기존 allowlist 유지) —
        //   그대로 swap 하면 fail-closed 핸들러들이 그 마켓 전량 drop ([10-117] 후 대가 상승).
        for (const market of plan.skippedEmptyMarkets) {
          console.warn(
            `[worker] symbols refresh: ${market} 빈 리스트(부분 실패 의심) — 기존 allowlist ${tradingSymbolsByMarket[market].size}종 유지`,
          );
        }
        // 테마 B: quote_asset 맵은 allowlist 와 같은 스냅샷으로 **같은 마켓만** 교체
        // (둘이 어긋나면 lookup miss → null 적재 가능성이 생김).
        for (const market of plan.marketsToSwap) {
          tradingSymbolsByMarket[market] = new Set(fresh[market]);
          quoteAssetBySymbol[market] = fresh.quoteAssetBySymbol[market];
        }
        console.log(
          `[worker] symbols refresh: spot=${fresh.spot.length} usdm=${fresh.futures_usdm.length} coinm=${fresh.futures_coinm.length}`,
        );

        // ★ 신규 상장 감지 → per-symbol WS 구독(청산·실시간 push)이 부팅 스냅샷
        //   고정이라 재시작으로만 반영된다 — graceful 자기 재시작 (systemd 재기동).
        //   루프 가드 2중: ① 구조적 1h 최소 간격 ② 대량 추가(>SELF_RESTART_MAX_ADDED)
        //   는 부팅 부분실패 회복/이상 신호로 보고 억제 — "부팅 실패↔회복 감지" 의
        //   1h 무한 재시작 루프 차단 (reviewer W1, symbolRefresh.ts 상수 주석).
        if (plan.selfRestartAdvised && !shuttingDown) {
          console.log(
            `[worker] 신규 상장 감지 (${formatAddedSymbols(plan.addedSymbols)}) — ` +
              `per-symbol WS 구독 재구성 위해 자기 재시작 (exit ${SELF_RESTART_EXIT_CODE})`,
          );
          void shutdown("SELF_RESTART", SELF_RESTART_EXIT_CODE);
        } else if (plan.addedSymbols.length > SELF_RESTART_MAX_ADDED) {
          console.warn(
            `[worker] 심볼 대량 추가 ${plan.addedSymbols.length}종 (${formatAddedSymbols(plan.addedSymbols)}) — ` +
              "부팅 부분실패 회복/이상 신호로 판단해 자기 재시작 억제 (allowlist swap 만 적용, per-symbol 구독은 다음 재시작에서 반영)",
          );
        }
      })
      .catch((e) => {
        console.error("[worker] symbols refresh 실패 (기존 allowlist 유지):", e);
      });
    // [10-72] contractSize 맵도 같은 주기로 재로드 (신규 상장 COINM 계약 반영).
    void refreshCoinmContractSizes().catch((e) => {
      console.error("[worker] COINM contractSize refresh 실패 (기존 맵 유지):", e);
    });
  }, SYMBOL_REFRESH_INTERVAL_MS);

  console.log("[worker] 정상 부팅 완료 — Ctrl+C로 종료");
}

// ─── 심볼 로드 ─────────────────────────────────────

/**
 * symbols 테이블에서 마켓별 TRADING 심볼 리스트 조회.
 * getSymbols 는 PAGE=1,000 pagination 루프로 전 심볼 확보
 * (2026-04-20 실측: SPOT TRADING 1,408 / USDM 608 / COINM 30).
 *
 * 각 쿼리는 withTimeout 으로 60초 가드 — Supabase 간헐 장애 시 무한 hang 방지.
 * Promise.allSettled 로 부분 실패 허용 — 한 마켓이 timeout 나도 다른 마켓은 진행.
 * 실패한 마켓은 빈 리스트 → KlineRelay 는 0개 연결로 graceful 동작.
 */
async function loadAllSymbols(): Promise<{
  spot: string[];
  futures_usdm: string[];
  futures_coinm: string[];
  /**
   * 마켓별 symbol → quote_asset lookup (M2 테마 B [10-2], 2026-06-11).
   * allowlist 와 **같은 getSymbols 응답**에서 생성 — allowlist 통과 심볼은
   * 구조적으로 lookup miss 불가 (둘이 항상 같은 스냅샷).
   */
  quoteAssetBySymbol: {
    spot: Map<string, string>;
    futures_usdm: Map<string, string>;
    futures_coinm: Map<string, string>;
  };
}> {
  if (!dataService) {
    return {
      spot: [],
      futures_usdm: [],
      futures_coinm: [],
      quoteAssetBySymbol: {
        spot: new Map(),
        futures_usdm: new Map(),
        futures_coinm: new Map(),
      },
    };
  }
  const SYMBOL_QUERY_TIMEOUT_MS = 60_000;
  const [spotRes, usdmRes, coinmRes] = await Promise.allSettled([
    withTimeout(
      dataService.getSymbols({
        exchange: "binance",
        marketType: "spot",
        status: "TRADING",
      }),
      SYMBOL_QUERY_TIMEOUT_MS,
      "getSymbols(spot)",
    ),
    withTimeout(
      dataService.getSymbols({
        exchange: "binance",
        marketType: "futures_usdm",
        status: "TRADING",
      }),
      SYMBOL_QUERY_TIMEOUT_MS,
      "getSymbols(futures_usdm)",
    ),
    withTimeout(
      dataService.getSymbols({
        exchange: "binance",
        marketType: "futures_coinm",
        // COINM 은 TRADING 30 + DELIVERING 8 (2026-04-20 MCP 실측).
        // DELIVERING 은 Binance WS 에 push 되지 않으므로 kline 구독 대상에서 제외.
        status: "TRADING",
      }),
      SYMBOL_QUERY_TIMEOUT_MS,
      "getSymbols(futures_coinm)",
    ),
  ]);

  // PromiseSettledResult + Result<SymbolRow[]> 2중 wrap 언래핑.
  // timeout/network 예외는 rejected, Supabase 쿼리 실패는 fulfilled+success:false.
  // 타입 명시로 의도 가시화 — typeof 우회 대신 구조적 alias 사용.
  type SymbolQueryOutcome = typeof spotRes;
  // 심볼 리스트 + quote_asset 맵을 **같은 응답 rows** 에서 동시 생성 (테마 B).
  // getSymbols 가 select("*") 라 quote_asset 포함 — 추가 쿼리 0.
  const pick = (
    res: SymbolQueryOutcome,
    label: string,
  ): { symbols: string[]; quoteMap: Map<string, string> } => {
    if (res.status === "rejected") {
      const reason = res.reason instanceof Error ? res.reason.message : String(res.reason);
      console.error(`[worker] ${label} 심볼 조회 실패(timeout/network): ${reason}`);
      return { symbols: [], quoteMap: new Map() };
    }
    if (!res.value.success) {
      console.error(`[worker] ${label} 심볼 조회 실패: ${res.value.error}`);
      return { symbols: [], quoteMap: new Map() };
    }
    const symbols: string[] = [];
    const quoteMap = new Map<string, string>();
    for (const s of res.value.data) {
      symbols.push(s.symbol);
      if (typeof s.quote_asset === "string" && s.quote_asset.length > 0) {
        quoteMap.set(s.symbol, s.quote_asset);
      }
    }
    return { symbols, quoteMap };
  };

  const spot = pick(spotRes, "spot");
  const usdm = pick(usdmRes, "usdm");
  const coinm = pick(coinmRes, "coinm");

  return {
    spot: spot.symbols,
    futures_usdm: usdm.symbols,
    futures_coinm: coinm.symbols,
    quoteAssetBySymbol: {
      spot: spot.quoteMap,
      futures_usdm: usdm.quoteMap,
      futures_coinm: coinm.quoteMap,
    },
  };
}

// ─── 헬퍼 ─────────────────────────────────────────

function formatAge(ts: number | null): string {
  if (ts === null) return "-";
  const age = Math.round((Date.now() - ts) / 1000);
  return `${age}s`;
}

// ─── 진입 ─────────────────────────────────────────

bootstrap().catch((err) => {
  console.error("[worker] 부팅 실패:", err);
  process.exit(1);
});
