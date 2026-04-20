// ============================================================
// M1.3 Step 5 검증 스크립트 (2026-04-20).
//
// 워커를 일정 시간(예: 10분~1시간) 구동 후 Supabase 에 들어간 데이터로
// Step 5 WS 전환의 정량 검증:
//   1. **WS ticker freshness**: updated_at ≤ 10초 (1초 push 기반)
//   2. **WS markPrice freshness**: now_futures_indicator mark_price ≤ 10초
//   3. **WS forceOrder 수집**: 지난 1시간 liquidation 행 수 (>0 기대)
//   4. **volume_chg_5m 해석 B 증거** (10분+ 구동 시): BTCUSDT 계산 결과 확인
//   5. **4도메인 공존** (mixed-batch 불변): 기존 84.6% 유지 여부
//
// 예외 선언:
//   smoke-grade verification 스크립트로 `.from()` 직접 호출 예외 허용.
// ============================================================

import { supabase } from "../supabase.js";
import { dataService } from "../dataService.js";

function fmt(v: number | null | undefined, digits = 4): string {
  if (v === null || v === undefined) return "(null)";
  if (!Number.isFinite(v)) return `(${v})`;
  return v.toFixed(digits);
}

function fmtPct(v: number | null | undefined): string {
  if (v === null || v === undefined) return "(null)";
  if (!Number.isFinite(v)) return `(${v})`;
  return `${v.toFixed(3)}%`;
}

function ageSec(ts: string | null | undefined): number | null {
  if (!ts) return null;
  const t = Date.parse(ts);
  if (!Number.isFinite(t)) return null;
  return Math.round((Date.now() - t) / 1000);
}

async function main(): Promise<void> {
  if (!supabase || !dataService) {
    console.error("[verify:step5] Supabase 미연결 — env 확인");
    process.exit(1);
  }

  console.log("\n==================================================");
  console.log(" M1.3 Step 5 WS 릴레이 검증 리포트");
  console.log(` 시각: ${new Date().toISOString()}`);
  console.log("==================================================\n");

  // ─── [1] BTCUSDT ticker (WS !miniTicker@arr) ─────────
  console.log("### [1] BTCUSDT ticker (WS !miniTicker@arr)");
  const spotRes = await dataService.getNowSpotTicker("binance", "BTCUSDT");
  if (spotRes.success && spotRes.data) {
    const r = spotRes.data;
    console.log(`  SPOT: last=${fmt(r.last_price, 2)} vol=${fmt(r.volume, 2)} ` +
      `vol_chg_5m=${fmtPct(r.volume_chg_5m)} vol_chg_15m=${fmtPct(r.volume_chg_15m)} age=${ageSec(r.updated_at)}s`);
  } else {
    console.error(`  SPOT 조회 실패: ${spotRes.success ? "데이터 없음" : spotRes.error}`);
  }

  const { data: futCore } = await supabase
    .from("now_futures_ticker")
    .select("market_type,last_price,volume,volume_chg_5m,updated_at")
    .in("symbol", ["BTCUSDT", "BTCUSD_PERP"])
    .eq("exchange", "binance");
  for (const r of futCore ?? []) {
    console.log(
      `  ${r.market_type}: last=${fmt(r.last_price, 2)} vol=${fmt(r.volume, 2)} ` +
        `vol_chg_5m=${fmtPct(r.volume_chg_5m)} age=${ageSec(r.updated_at)}s`,
    );
  }

  // ─── [2] BTCUSDT USDM indicator (WS !markPrice@arr@1s + REST perSymbolTask) ─
  console.log("\n### [2] BTCUSDT USDM indicator — 4도메인 공존");
  const { data: ind } = await supabase
    .from("now_futures_indicator")
    .select("*")
    .eq("exchange", "binance")
    .eq("market_type", "futures_usdm")
    .eq("symbol", "BTCUSDT")
    .maybeSingle();
  if (ind) {
    console.log(`  updated_at: ${ind.updated_at} (age: ${ageSec(ind.updated_at)}s)`);
    console.log(`  mark_price:            ${fmt(ind.mark_price, 2)}   [WS markPrice]`);
    console.log(`  last_funding_rate:     ${fmt(ind.last_funding_rate, 8)} [WS markPrice]`);
    console.log(`  index_price:           ${fmt(ind.index_price, 2)}   [WS markPrice]`);
    console.log(`  open_interest:         ${fmt(ind.open_interest, 0)}     [REST perSymbol]`);
    console.log(`  top_ls_ratio_accounts: ${fmt(ind.top_ls_ratio_accounts, 4)}   [REST perSymbol]`);
    console.log(`  taker_buy_sell_ratio:  ${fmt(ind.taker_buy_sell_ratio, 4)}   [REST perSymbol]`);
    const all4 =
      ind.mark_price !== null &&
      ind.open_interest !== null &&
      ind.top_ls_ratio_accounts !== null &&
      ind.taker_buy_sell_ratio !== null;
    console.log(`  >> 4도메인 공존: ${all4 ? "✅ PASS" : "❌ FAIL"}`);
  } else {
    console.warn("  데이터 없음");
  }

  // ─── [3] ticker freshness 집계 ─────────────────────
  console.log("\n### [3] ticker freshness (WS 전환 후 10초 이내 기대)");
  const freshQueries = await Promise.all([
    supabase
      .from("now_spot_ticker")
      .select("*", { count: "exact", head: true })
      .eq("exchange", "binance"),
    supabase
      .from("now_spot_ticker")
      .select("*", { count: "exact", head: true })
      .eq("exchange", "binance")
      .gt("updated_at", new Date(Date.now() - 10_000).toISOString()),
    supabase
      .from("now_futures_ticker")
      .select("*", { count: "exact", head: true })
      .eq("exchange", "binance")
      .eq("market_type", "futures_usdm"),
    supabase
      .from("now_futures_ticker")
      .select("*", { count: "exact", head: true })
      .eq("exchange", "binance")
      .eq("market_type", "futures_usdm")
      .gt("updated_at", new Date(Date.now() - 10_000).toISOString()),
    supabase
      .from("now_futures_ticker")
      .select("*", { count: "exact", head: true })
      .eq("exchange", "binance")
      .eq("market_type", "futures_coinm"),
    supabase
      .from("now_futures_ticker")
      .select("*", { count: "exact", head: true })
      .eq("exchange", "binance")
      .eq("market_type", "futures_coinm")
      .gt("updated_at", new Date(Date.now() - 10_000).toISOString()),
  ]);
  const counts = freshQueries.map((q) => q.count ?? 0);
  const spotTot = counts[0] ?? 0;
  const spotFresh = counts[1] ?? 0;
  const usdmTot = counts[2] ?? 0;
  const usdmFresh = counts[3] ?? 0;
  const coinmTot = counts[4] ?? 0;
  const coinmFresh = counts[5] ?? 0;
  console.log(
    `  SPOT:  총 ${spotTot}, 10초 이내 갱신 ${spotFresh} (${((spotFresh / Math.max(spotTot, 1)) * 100).toFixed(1)}%)`,
  );
  console.log(
    `  USDM:  총 ${usdmTot}, 10초 이내 갱신 ${usdmFresh} (${((usdmFresh / Math.max(usdmTot, 1)) * 100).toFixed(1)}%)`,
  );
  console.log(
    `  COINM: 총 ${coinmTot}, 10초 이내 갱신 ${coinmFresh} (${((coinmFresh / Math.max(coinmTot, 1)) * 100).toFixed(1)}%)`,
  );

  // ─── [4] volume_chg_5m 채움률 (해석 A fallback + 해석 B 전환) ─
  console.log("\n### [4] volume_chg_5m 채움률 (해석 A→B 전환 구조)");
  const volChgQueries = await Promise.all([
    supabase
      .from("now_spot_ticker")
      .select("*", { count: "exact", head: true })
      .eq("exchange", "binance")
      .not("volume_chg_5m", "is", null),
    supabase
      .from("now_futures_ticker")
      .select("*", { count: "exact", head: true })
      .eq("exchange", "binance")
      .not("volume_chg_5m", "is", null),
  ]);
  const volChgCounts = volChgQueries.map((q) => q.count ?? 0);
  const spotVolChg = volChgCounts[0] ?? 0;
  const futVolChg = volChgCounts[1] ?? 0;
  console.log(
    `  SPOT:    volume_chg_5m non-null ${spotVolChg}/${spotTot} (${((spotVolChg / Math.max(spotTot, 1)) * 100).toFixed(1)}%)`,
  );
  console.log(
    `  FUTURES: volume_chg_5m non-null ${futVolChg}/${usdmTot + coinmTot} (${((futVolChg / Math.max(usdmTot + coinmTot, 1)) * 100).toFixed(1)}%)`,
  );

  // ─── [5] 4도메인 공존 집계 (USDM) ─────────────────
  console.log("\n### [5] now_futures_indicator 4도메인 공존 (USDM)");
  const { data: indStats, count: indCount } = await supabase
    .from("now_futures_indicator")
    .select("*", { count: "exact" })
    .eq("exchange", "binance")
    .eq("market_type", "futures_usdm")
    .not("mark_price", "is", null)
    .not("open_interest", "is", null)
    .not("top_ls_ratio_accounts", "is", null)
    .not("taker_buy_sell_ratio", "is", null);
  void indStats;
  console.log(`  USDM 총 심볼: 719 (예상), 4도메인 공존: ${indCount ?? 0}`);
  const ratio = ((indCount ?? 0) / 719) * 100;
  console.log(`  ${ratio >= 80 ? "✅" : "⚠️"} 공존 비율 ${ratio.toFixed(1)}% (Step 4 기준 84.6%)`);

  // ─── [6] 지난 1시간 liquidation 수집 (WS !forceOrder@arr) ──
  console.log("\n### [6] liquidation 수집 (WS !forceOrder@arr)");
  const { count: liqCount } = await supabase
    .from("history_futures_liquidation")
    .select("*", { count: "exact", head: true })
    .eq("exchange", "binance")
    .gt("recorded_at", new Date(Date.now() - 3_600_000).toISOString());
  console.log(`  지난 1시간 USDM/COINM 청산 총 ${liqCount ?? 0}건`);
  if ((liqCount ?? 0) === 0) {
    console.log("  (트래픽 조용한 시간대면 0건 가능 — 장기 구동 권장)");
  }

  console.log("\n==================================================");
  console.log(" 검증 완료");
  console.log("==================================================\n");
}

main().catch((e) => {
  console.error("[verify:step5] fatal:", e);
  process.exit(1);
});
