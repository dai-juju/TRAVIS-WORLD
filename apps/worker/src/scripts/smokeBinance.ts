// ============================================================
// M1.3 Step 3 smoke — Binance 3마켓 1회 수집 + Supabase upsert 검증.
//
// 실행:
//   pnpm -F @travis/worker smoke:binance
//
// 동작:
//  1) 레지스트리 등록(registerDefaults) → generatePromptInjection() 출력 미리보기
//  2) 3마켓 exchangeInfo → symbols upsert
//  3) 3마켓 ticker/24hr → now_*_ticker upsert
//  4) USDM·COINM premiumIndex 전체 배치 → now_futures_indicator partial
//  5) per-symbol 지표 (top 20 심볼만 샘플링, 전량은 Step 4 폴링에서)
//     - OI · topLongShortAccount · taker
//  6) 결과 요약 콘솔 출력
//
// 심볼 제한 (smoke 전용, 5~6분 내 완료 목표):
//   per-symbol 엔드포인트는 전체 심볼에 대해 호출하면 ~10분+ 걸림.
//   smoke에서는 "quote_volume 상위 20"만 샘플링. 전량 수집은 Step 4 폴러가
//   tier별 스케줄에 따라 수행할 예정.
// ============================================================

import { generatePromptInjection, registerDefaults } from "@travis/shared";
import {
  BinanceCoinmAdapter,
  BinanceSpotAdapter,
  BinanceUsdmAdapter,
} from "../adapters/binance/index.js";
import { dataService } from "../dataService.js";

const TOP_N_FOR_PER_SYMBOL = 20;

async function main(): Promise<void> {
  if (!dataService) {
    console.error("[smoke:binance] dataService not initialized (env 누락)");
    process.exit(1);
  }

  console.log("\n=== M1.3 Step 3 smoke: Binance 3마켓 1회 수집 ===\n");

  // ─── [1] 레지스트리 등록 + generatePromptInjection 미리보기 ───
  console.log("[1/6] registerDefaults() + generatePromptInjection preview");
  registerDefaults();
  const injected = generatePromptInjection();
  console.log(`  generatePromptInjection length: ${injected.length} chars`);
  console.log("  (AI가 읽을 메뉴판 샘플, 첫 800자):");
  console.log("  " + injected.slice(0, 800).replace(/\n/g, "\n  "));
  console.log("  ...");

  // ─── [2] 3마켓 exchangeInfo → symbols upsert ──────
  console.log("\n[2/6] fetching exchangeInfo × 3 markets");
  const spot = new BinanceSpotAdapter();
  const usdm = new BinanceUsdmAdapter();
  const coinm = new BinanceCoinmAdapter();

  const [spotSyms, usdmSyms, coinmSyms] = await Promise.all([
    spot.fetchExchangeInfo(),
    usdm.fetchExchangeInfo(),
    coinm.fetchExchangeInfo(),
  ]);
  assertFetchOk("spot exchangeInfo", spotSyms);
  assertFetchOk("usdm exchangeInfo", usdmSyms);
  assertFetchOk("coinm exchangeInfo", coinmSyms);
  if (spotSyms.success && usdmSyms.success && coinmSyms.success) {
    const all = [...spotSyms.data, ...usdmSyms.data, ...coinmSyms.data];
    console.log(
      `  fetched: spot=${spotSyms.data.length}, usdm=${usdmSyms.data.length}, coinm=${coinmSyms.data.length} (total ${all.length})`,
    );
    const up = await dataService.upsertSymbols(all);
    assertWriteOk("upsertSymbols", up);
  }

  // ─── [3] 3마켓 ticker/24hr → now_*_ticker upsert ───
  console.log("\n[3/6] fetching ticker/24hr × 3 markets");
  const [spotTick, usdmTick, coinmTick] = await Promise.all([
    spot.fetchTicker24hr(),
    usdm.fetchTicker24hr(),
    coinm.fetchTicker24hr(),
  ]);
  assertFetchOk("spot ticker", spotTick);
  assertFetchOk("usdm ticker", usdmTick);
  assertFetchOk("coinm ticker", coinmTick);
  if (spotTick.success && usdmTick.success && coinmTick.success) {
    console.log(
      `  fetched: spot=${spotTick.data.length}, usdm=${usdmTick.data.length}, coinm=${coinmTick.data.length}`,
    );
    const r1 = await dataService.upsertNowSpotTicker(spotTick.data);
    assertWriteOk("upsertNowSpotTicker", r1);
    const r2 = await dataService.upsertNowFuturesTicker([
      ...usdmTick.data,
      ...coinmTick.data,
    ]);
    assertWriteOk("upsertNowFuturesTicker (usdm+coinm)", r2);
  }

  // ─── [4] premiumIndex 전체 배치 (USDM + COINM) ─────
  console.log("\n[4/6] fetching premiumIndex × USDM + COINM");
  const [usdmPrem, coinmPrem] = await Promise.all([
    usdm.fetchPremiumIndex(),
    coinm.fetchPremiumIndex(),
  ]);
  assertFetchOk("usdm premiumIndex", usdmPrem);
  assertFetchOk("coinm premiumIndex", coinmPrem);
  if (usdmPrem.success) {
    console.log(`  usdm premium: ${usdmPrem.data.length} rows`);
    const r = await dataService.upsertNowFuturesIndicatorPartial(usdmPrem.data);
    assertWriteOk("upsertNowFuturesIndicatorPartial (usdm premium)", r);
  }
  if (coinmPrem.success) {
    console.log(`  coinm premium: ${coinmPrem.data.length} rows`);
    const r = await dataService.upsertNowFuturesIndicatorPartial(coinmPrem.data);
    assertWriteOk("upsertNowFuturesIndicatorPartial (coinm premium)", r);
  }

  // ─── [5] per-symbol 지표 (top N 샘플링) ───────────
  console.log(
    `\n[5/6] per-symbol 지표 샘플 (top ${TOP_N_FOR_PER_SYMBOL} by USDM quote_volume)`,
  );
  const topSymbols = usdmTick.success
    ? [...usdmTick.data]
        .sort((a, b) => (b.quote_volume ?? 0) - (a.quote_volume ?? 0))
        .slice(0, TOP_N_FOR_PER_SYMBOL)
        .map((t) => t.symbol)
    : [];
  console.log(`  sample symbols (${topSymbols.length}):`, topSymbols.slice(0, 5), "...");

  if (topSymbols.length > 0) {
    const started = Date.now();
    const oi = await usdm.fetchOpenInterestBatch(topSymbols);
    const lsAcct = await usdm.fetchTopLongShortAccountBatch(topSymbols);
    const taker = await usdm.fetchTakerLongShortBatch(topSymbols);
    console.log(
      `  USDM per-symbol fetched in ${Math.round((Date.now() - started) / 1000)}s — OI=${oi.success ? oi.data.length : 0}, LSAcct=${lsAcct.success ? lsAcct.data.length : 0}, Taker=${taker.success ? taker.data.length : 0}`,
    );

    // 각 도메인 배치로 upsert (mixed-batch hazard 회피)
    if (oi.success && oi.data.length > 0) {
      const r = await dataService.upsertNowFuturesIndicatorPartial(oi.data);
      assertWriteOk("upsertNowFuturesIndicatorPartial (USDM OI)", r);
    }
    if (lsAcct.success && lsAcct.data.length > 0) {
      const r = await dataService.upsertNowFuturesIndicatorPartial(lsAcct.data);
      assertWriteOk("upsertNowFuturesIndicatorPartial (USDM LSAcct)", r);
    }
    if (taker.success && taker.data.length > 0) {
      const r = await dataService.upsertNowFuturesIndicatorPartial(taker.data);
      assertWriteOk("upsertNowFuturesIndicatorPartial (USDM Taker)", r);
    }
  }

  // ─── [5b] COINM per-symbol 최소 검증 (W-7 code-reviewer 반영) ─
  // COINM은 심볼 수가 적으므로(~30) 전체 적용해도 ~5초. 필드 스키마 차이
  // (takerBuyVol vs buyVol)가 실제 값으로 들어오는지 여기서 실증.
  const coinmSymbolsForPerSymbol = coinmTick.success
    ? coinmTick.data.map((t) => t.symbol).slice(0, 5) // smoke 속도 위해 5개만
    : [];
  if (coinmSymbolsForPerSymbol.length > 0) {
    console.log(
      `\n[5b] COINM per-symbol 샘플 (${coinmSymbolsForPerSymbol.length}개): ${coinmSymbolsForPerSymbol.join(", ")}`,
    );
    const coi = await coinm.fetchOpenInterestBatch(coinmSymbolsForPerSymbol);
    const clsa = await coinm.fetchTopLongShortAccountBatch(coinmSymbolsForPerSymbol);
    const ct = await coinm.fetchTakerLongShortBatch(coinmSymbolsForPerSymbol);
    console.log(
      `  COINM: OI=${coi.success ? coi.data.length : 0}, LSAcct=${clsa.success ? clsa.data.length : 0}, Taker=${ct.success ? ct.data.length : 0}`,
    );
    if (coi.success && coi.data.length > 0) {
      await dataService.upsertNowFuturesIndicatorPartial(coi.data);
    }
    if (clsa.success && clsa.data.length > 0) {
      await dataService.upsertNowFuturesIndicatorPartial(clsa.data);
    }
    if (ct.success && ct.data.length > 0) {
      await dataService.upsertNowFuturesIndicatorPartial(ct.data);
    }
  }

  // ─── [6] 요약 ─────────────────────────────────────
  console.log("\n[6/6] Supabase round-trip 확인");
  const symCheck = await dataService.getSymbols({
    exchange: "binance",
    marketType: "spot",
    status: "TRADING",
  });
  if (symCheck.success) {
    console.log(`  getSymbols(binance/spot/TRADING): ${symCheck.data.length} rows`);
    const btc = symCheck.data.find((s) => s.symbol === "BTCUSDT");
    console.log(
      `  BTCUSDT row:`,
      btc
        ? {
            base_asset: btc.base_asset,
            tick_size: btc.tick_size,
            step_size: btc.step_size,
            min_notional: btc.min_notional,
          }
        : "not found",
    );
  }

  const btcTicker = await dataService.getNowSpotTicker("binance", "BTCUSDT");
  if (btcTicker.success && btcTicker.data) {
    console.log(
      `  BTCUSDT now_spot_ticker:`,
      {
        last_price: btcTicker.data.last_price,
        price_change_pct: btcTicker.data.price_change_pct,
        quote_volume: btcTicker.data.quote_volume,
      },
    );
  }

  console.log("\n=== smoke:binance PASSED ===");
  console.log(
    "  Supabase Studio에서 symbols, now_spot_ticker, now_futures_ticker, now_futures_indicator에 실 데이터 확인 권장.",
  );
}

function assertFetchOk<T>(
  label: string,
  r: { success: true; data: T } | { success: false; error: string },
): void {
  if (!r.success) {
    console.error(`  [FAIL fetch ${label}]`, r.error);
    process.exit(1);
  }
}

function assertWriteOk(
  label: string,
  r: { success: true; data: void } | { success: false; error: string },
): void {
  if (!r.success) {
    console.error(`  [FAIL write ${label}]`, r.error);
    process.exit(1);
  }
  console.log(`  [OK write ${label}]`);
}

main().catch((err) => {
  console.error("[smoke:binance] fatal:", err);
  process.exit(1);
});
