// ============================================================
// M1.3 Step 2 smoke test — 실제 Supabase에 대해 dataService 메서드가
// 모두 동작하는지 1회 검증. SMOKE_<timestamp>* marker로 삽입·조회·
// 삭제하므로 실제 데이터에 간섭하지 않는다.
//
// 실행:
//   pnpm -F @travis/worker smoke
//
// 성공 시:
//   "=== smoke test PASSED ===" 출력 + exit 0
// 실패 시:
//   실패 지점 + error 메시지 + exit 1
//
// Step 3 Binance 어댑터가 실제 데이터로 이 경로를 매번 밟으므로
// 이 스크립트는 영구 유지할 필요는 없지만, bootstrap 초기에는
// 회귀 방지 용도로 남겨두는 편이 안전.
//
// ⚠️ 이 파일은 dataService 배관 규율의 **예외 구역**.
// cleanup과 partial-update verification을 위해 supabase raw client를
// 직접 호출한다. 다른 런타임 코드는 반드시 dataService 경유.
// ============================================================

import { supabase } from "../supabase.js";
import { dataService } from "../dataService.js";

// 실제 심볼과 충돌하지 않도록 SMOKE_ 접두 + 타임스탬프.
const base = `SMOKE_${Date.now()}`;
const marker = base;
// W2(code-reviewer) 회귀 케이스: "배치 내 컬럼 셋이 섞이면
// 의도한 대로 NULL 덮어쓰기가 발생함" 을 실증하는 두 번째 marker.
const markerMixed = `${base}_MIX`;

async function main(): Promise<void> {
  if (!dataService) {
    console.error("[smoke] dataService not initialized (env 누락 확인)");
    process.exit(1);
  }
  if (!supabase) {
    console.error("[smoke] supabase client not initialized");
    process.exit(1);
  }

  console.log(`\n=== smoke test marker: ${marker} ===`);

  // ─── 1. upsertSymbols ──────────────────────────
  console.log("\n[step 1] upsertSymbols");
  const r1 = await dataService.upsertSymbols([
    {
      exchange: "binance",
      market_type: "spot",
      symbol: marker,
      base_asset: "SMOKE",
      quote_asset: "USDT",
      status: "TRADING",
      tick_size: 0.01,
      step_size: 0.001,
      min_notional: 10,
    },
  ]);
  await assertOk("upsertSymbols", r1);

  // ─── 2. getSymbols (filter) ───────────────────
  console.log("\n[step 2] getSymbols(filter: exchange=binance, marketType=spot)");
  const r2 = await dataService.getSymbols({
    exchange: "binance",
    marketType: "spot",
    status: "TRADING",
  });
  await assertOk("getSymbols", r2);
  if (r2.success) {
    const found = r2.data.find((s) => s.symbol === marker);
    console.log("  marker row found:", !!found);
    if (!found) {
      console.error("  ERROR: upsert 이후 getSymbols가 marker를 못 찾음");
      await cleanup();
      process.exit(1);
    }
  }

  // ─── 3. upsertNowSpotTicker + getNowSpotTicker ─
  console.log("\n[step 3] upsertNowSpotTicker");
  const r3 = await dataService.upsertNowSpotTicker([
    {
      exchange: "binance",
      market_type: "spot",
      symbol: marker,
      last_price: 12345.67,
      price_change_pct: 1.23,
      volume: 1000,
      quote_volume: 12345670,
    },
  ]);
  await assertOk("upsertNowSpotTicker", r3);

  console.log("\n[step 4] getNowSpotTicker");
  const r4 = await dataService.getNowSpotTicker("binance", marker);
  await assertOk("getNowSpotTicker", r4);
  if (r4.success) {
    console.log(
      "  last_price:",
      r4.data?.last_price,
      "price_change_pct:",
      r4.data?.price_change_pct,
    );
    if (r4.data?.last_price === null || Number(r4.data?.last_price) !== 12345.67) {
      console.error("  ERROR: last_price mismatch");
      await cleanup();
      process.exit(1);
    }
  }

  // ─── 4. upsertNowFuturesIndicatorPartial (핵심) ─
  // 두 번 나눠 호출 — 각각 자기 컬럼만 포함. 두 번째가 첫 번째 값을
  // NULL로 덮어씌우지 않아야 함.
  console.log("\n[step 5a] upsertNowFuturesIndicatorPartial — OI source first");
  const r5 = await dataService.upsertNowFuturesIndicatorPartial([
    {
      exchange: "binance",
      market_type: "futures_usdm",
      symbol: marker,
      open_interest: 1000,
      oi_chg_5m: 0.5,
    },
  ]);
  await assertOk("upsertNowFuturesIndicatorPartial (OI)", r5);

  console.log("[step 5b] upsertNowFuturesIndicatorPartial — funding source second");
  const r6 = await dataService.upsertNowFuturesIndicatorPartial([
    {
      exchange: "binance",
      market_type: "futures_usdm",
      symbol: marker,
      mark_price: 50000,
      predicted_funding_rate: 0.0001,
    },
  ]);
  await assertOk("upsertNowFuturesIndicatorPartial (funding)", r6);

  // partial 성질 검증 — raw client로 전체 row 조회
  console.log("[step 5c] partial-update verification (raw select)");
  const verify = await supabase
    .from("now_futures_indicator")
    .select("open_interest, oi_chg_5m, mark_price, predicted_funding_rate")
    .eq("exchange", "binance")
    .eq("market_type", "futures_usdm")
    .eq("symbol", marker)
    .maybeSingle();
  console.log("  verified row:", verify.data);
  if (
    verify.data?.open_interest !== 1000 ||
    verify.data?.oi_chg_5m === null ||
    verify.data?.mark_price !== 50000 ||
    verify.data?.predicted_funding_rate === null
  ) {
    console.error(
      "  ERROR: partial update 실패 — 두 번째 호출이 첫 번째 값을 지움",
    );
    await cleanup();
    process.exit(1);
  }
  console.log("  partial update OK — 4개 필드 모두 유지됨");

  // ─── 4b. W2 회귀: "배치 내 컬럼 섞임" → 의도대로 NULL 덮어쓰기 발생 ──
  // 목적: SupabaseDataService.ts의 "invariant 2"(배치 내 row는 같은 key 집합)를
  // 어겼을 때 실제로 데이터 손상이 일어남을 실증. 이게 일어나야 "섞지 말라"는
  // 규율이 의미 있음. Step 3 배치 설계 전에 반드시 지켜야 할 hazard.
  console.log("\n[step 5d] W2 regression: mixed-column batch → DATA LOSS 검증");
  // seed: 두 심볼 모두에 OI+mark_price 동시 세팅
  await dataService.upsertNowFuturesIndicatorPartial([
    { exchange: "binance", market_type: "futures_usdm", symbol: marker,      open_interest: 111, mark_price: 222 },
    { exchange: "binance", market_type: "futures_usdm", symbol: markerMixed, open_interest: 333, mark_price: 444 },
  ]);
  // 잘못된 호출: row마다 서로 다른 컬럼 셋
  await dataService.upsertNowFuturesIndicatorPartial([
    { exchange: "binance", market_type: "futures_usdm", symbol: marker,      open_interest: 2000 },
    { exchange: "binance", market_type: "futures_usdm", symbol: markerMixed, mark_price: 6000 },
  ]);
  const mixedVerify = await supabase
    .from("now_futures_indicator")
    .select("symbol, open_interest, mark_price")
    .in("symbol", [marker, markerMixed])
    .eq("market_type", "futures_usdm");
  console.log("  mixed-batch result:", mixedVerify.data);
  // 기대 결과: marker의 mark_price가 NULL로 날아가고, markerMixed의 open_interest가 NULL로 날아감
  // (이래야 "섞으면 데이터 손상이 실제로 발생한다"는 규율 근거가 증명됨)
  const afterA = mixedVerify.data?.find((r) => r.symbol === marker);
  const afterB = mixedVerify.data?.find((r) => r.symbol === markerMixed);
  const hazardDemonstrated =
    afterA?.open_interest === 2000 &&
    afterA?.mark_price === null &&
    afterB?.open_interest === null &&
    afterB?.mark_price === 6000;
  if (hazardDemonstrated) {
    console.log(
      "  [OK] mixed-batch hazard 실증됨 — Step 3 워커는 도메인별로 배치 분리 필수",
    );
  } else {
    console.warn(
      "  [INFO] mixed-batch 결과가 예상과 다름 — SDK 동작 재검토 필요",
      { afterA, afterB },
    );
  }

  // ─── 5. _history insert 메서드들 ────────────────
  console.log("\n[step 6] insertHistory* x3");
  const r7a = await dataService.insertHistorySpotTicker([
    {
      exchange: "binance",
      market_type: "spot",
      symbol: marker,
      last_price: 12345.67,
    },
  ]);
  await assertOk("insertHistorySpotTicker", r7a);

  const r7b = await dataService.insertHistoryFuturesTicker([
    {
      exchange: "binance",
      market_type: "futures_usdm",
      symbol: marker,
      last_price: 12346,
    },
  ]);
  await assertOk("insertHistoryFuturesTicker", r7b);

  const r7c = await dataService.insertHistoryFuturesIndicator([
    {
      exchange: "binance",
      market_type: "futures_usdm",
      symbol: marker,
      interval: "1d", // M1.8.5 Step 2: interval NOT NULL 신설 — smoke row 보강
      open_interest: 1000,
    },
  ]);
  await assertOk("insertHistoryFuturesIndicator", r7c);

  // ─── 6. kline upsert ───────────────────────────
  console.log("\n[step 7] upsertHistory*Kline x2");
  const now = Date.now();
  const r8a = await dataService.upsertHistorySpotKline([
    {
      exchange: "binance",
      market_type: "spot",
      symbol: marker,
      interval: "1m",
      open_time: now,
      close_time: now + 60000,
      open_price: 12345,
      high_price: 12350,
      low_price: 12340,
      close_price: 12348,
      volume: 100,
      quote_volume: 1234800,
    },
  ]);
  await assertOk("upsertHistorySpotKline", r8a);

  const r8b = await dataService.upsertHistoryFuturesKline([
    {
      exchange: "binance",
      market_type: "futures_usdm",
      symbol: marker,
      interval: "1m",
      open_time: now,
      close_time: now + 60000,
      open_price: 12345,
      high_price: 12350,
      low_price: 12340,
      close_price: 12348,
      volume: 100,
      quote_volume: 1234800,
    },
  ]);
  await assertOk("upsertHistoryFuturesKline", r8b);

  // ─── 7. insertLiquidation + insertValidationFailure ─
  console.log("\n[step 8] insertLiquidation + insertValidationFailure");
  const r9 = await dataService.insertLiquidation([
    {
      exchange: "binance",
      market_type: "futures_usdm",
      symbol: marker,
      side: "SELL",
      price: 12345,
      quantity: 0.1,
      trade_time: new Date().toISOString(),
    },
  ]);
  await assertOk("insertLiquidation", r9);

  const r10 = await dataService.insertValidationFailure({
    query_text: `smoke ${marker}`,
    error_type: "smoke_test",
    error_message: "no-op smoke test entry",
  });
  await assertOk("insertValidationFailure", r10);

  // ─── cleanup ───────────────────────────────────
  await cleanup();
  console.log("\n=== smoke test PASSED ===");
}

/**
 * smoke 데이터 정리. dataService에 delete 메서드가 없으므로 raw client로
 * 예외적 직접 호출. W4(code-reviewer) 반영: 각 delete의 error를 수집해 경고.
 * Promise.all로 병렬 실행하여 실패 독립성 확보.
 */
async function cleanup(): Promise<void> {
  if (!supabase) return;
  console.log("\n[cleanup] deleting smoke rows");
  // 같은 "symbol = marker" 패턴 8개 테이블은 Promise.all로 병렬.
  const markersIn = [marker, markerMixed];
  const deletions = await Promise.all([
    supabase.from("symbols").delete().in("symbol", markersIn),
    supabase.from("now_spot_ticker").delete().in("symbol", markersIn),
    supabase.from("now_futures_indicator").delete().in("symbol", markersIn),
    supabase.from("history_spot_ticker").delete().in("symbol", markersIn),
    supabase.from("history_futures_ticker").delete().in("symbol", markersIn),
    supabase.from("history_futures_indicator").delete().in("symbol", markersIn),
    supabase.from("history_spot_kline").delete().in("symbol", markersIn),
    supabase.from("history_futures_kline").delete().in("symbol", markersIn),
    supabase.from("history_futures_liquidation").delete().in("symbol", markersIn),
  ]);
  const failed = deletions
    .map((d, i) => ({ error: d.error, idx: i }))
    .filter((d) => d.error);
  if (failed.length > 0) {
    console.warn(
      "[cleanup] 일부 삭제 실패:",
      failed.map((f) => f.error?.message),
    );
  }
  const logDel = await supabase
    .from("log_validation_failure")
    .delete()
    .eq("error_type", "smoke_test");
  if (logDel.error) {
    console.warn("[cleanup] log_validation_failure 삭제 실패:", logDel.error.message);
  }
  console.log("[cleanup] done");
}

/**
 * 각 단계 결과 검증. 실패 시 cleanup 완료 후 exit(1).
 * async로 만들어 cleanup 레이스 조건 제거 (W5 반영).
 */
async function assertOk<T>(
  label: string,
  r: { success: true; data: T } | { success: false; error: string },
): Promise<void> {
  if (!r.success) {
    console.error(`  [FAIL ${label}]`, r.error);
    await cleanup();
    process.exit(1);
  }
  console.log(`  [OK ${label}]`);
}

main().catch(async (err) => {
  console.error("[smoke] fatal:", err);
  await cleanup();
  process.exit(1);
});
