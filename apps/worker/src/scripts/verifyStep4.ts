// ============================================================
// M1.3 Step 4 검증 스크립트 (2026-04-20).
//
// 워커를 일정 시간(예: 10분) 구동 후 Supabase에 실제로 들어간 데이터를
// 읽어 다음 3가지를 정량 검증한다:
//   1. **갱신 신선도**: updated_at 이 최근 30초 이내인가?
//   2. **사전계산 충실도**: price_chg_5m / oi_chg_5m 등 사전계산 컬럼이
//      어느 비율로 non-null인가? (워커 첫 기동 후 5분이 지나야 값이 채워짐)
//   3. **mixed-batch hazard 재발 여부**: now_futures_indicator의 BTCUSDT 한 행에
//      premium(mark_price/last_funding_rate) + OI + LSR + Taker 4개 도메인이
//      모두 non-null로 공존하는가?
//
// 예외 선언:
//   이 파일은 **smoke-grade verification 스크립트**로, `.from()` 직접 호출을
//   예외적으로 허용한다. 런타임 코드(poller/tasks, index.ts)는 이 예외에서 제외.
// ============================================================

import { supabase } from "../supabase.js";
import { dataService } from "../dataService.js";

/** 한국어 숫자 포맷 — null/undefined → "(null)". */
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
    console.error("[verify:step4] Supabase 미연결 — env 확인");
    process.exit(1);
  }

  console.log("\n==================================================");
  console.log(" M1.3 Step 4 검증 리포트");
  console.log(` 시각: ${new Date().toISOString()}`);
  console.log("==================================================\n");

  // ─── 1. BTCUSDT spot (dataService 경유) ──────────
  console.log("### [1] now_spot_ticker — BTCUSDT (dataService)");
  const spotRes = await dataService.getNowSpotTicker("binance", "BTCUSDT");
  if (!spotRes.success) {
    console.error(`  실패: ${spotRes.error}`);
  } else if (!spotRes.data) {
    console.warn("  데이터 없음 — 워커가 아직 첫 tick을 돌리지 못한 상태일 수 있음");
  } else {
    const r = spotRes.data;
    console.log(`  updated_at:      ${r.updated_at}  (age: ${ageSec(r.updated_at)}초)`);
    console.log(`  last_price:      ${fmt(r.last_price, 2)}`);
    console.log(`  price_chg_5m:    ${fmtPct(r.price_chg_5m)}`);
    console.log(`  price_chg_15m:   ${fmtPct(r.price_chg_15m)}`);
    console.log(`  price_chg_1h:    ${fmtPct(r.price_chg_1h)}`);
    console.log(`  price_chg_4h:    ${fmtPct(r.price_chg_4h)}`);
    console.log(`  volume_chg_5m:   ${fmtPct(r.volume_chg_5m)}`);
    console.log(`  volume_chg_15m:  ${fmtPct(r.volume_chg_15m)}`);
    console.log(`  volume_ratio:    ${fmt(r.volume_ratio, 4)}`);
  }

  // ─── 2. BTCUSDT USDM + COINM ticker (직접) ───────
  console.log("\n### [2] now_futures_ticker — BTCUSDT (USDM, COINM_PERP)");
  const futTickerRes = await supabase
    .from("now_futures_ticker")
    .select("*")
    .eq("symbol", "BTCUSDT")
    .in("market_type", ["futures_usdm"])
    .limit(1);
  if (futTickerRes.error) {
    console.error(`  USDM 조회 실패: ${futTickerRes.error.message}`);
  } else {
    const r = futTickerRes.data?.[0];
    if (!r) {
      console.warn("  USDM 데이터 없음");
    } else {
      console.log(
        `  USDM: last=${fmt(r.last_price, 2)} | 5m=${fmtPct(r.price_chg_5m)} | 1h=${fmtPct(r.price_chg_1h)} | vol_ratio=${fmt(r.volume_ratio, 3)} | age=${ageSec(r.updated_at)}s`,
      );
    }
  }
  const coinmTickerRes = await supabase
    .from("now_futures_ticker")
    .select("*")
    .eq("market_type", "futures_coinm")
    .like("symbol", "BTCUSD%PERP")
    .limit(1);
  if (coinmTickerRes.error) {
    console.error(`  COINM 조회 실패: ${coinmTickerRes.error.message}`);
  } else {
    const r = coinmTickerRes.data?.[0];
    if (!r) {
      console.warn("  COINM PERP 데이터 없음");
    } else {
      console.log(
        `  COINM(${r.symbol}): last=${fmt(r.last_price, 2)} | 5m=${fmtPct(r.price_chg_5m)} | 1h=${fmtPct(r.price_chg_1h)} | age=${ageSec(r.updated_at)}s`,
      );
    }
  }

  // ─── 3. mixed-batch hazard — BTCUSDT indicator 4도메인 공존 ─
  console.log("\n### [3] now_futures_indicator — BTCUSDT USDM (4도메인 공존 체크)");
  const indRes = await supabase
    .from("now_futures_indicator")
    .select("*")
    .eq("symbol", "BTCUSDT")
    .eq("market_type", "futures_usdm")
    .limit(1);
  if (indRes.error) {
    console.error(`  조회 실패: ${indRes.error.message}`);
  } else {
    const r = indRes.data?.[0];
    if (!r) {
      console.warn("  데이터 없음");
    } else {
      const domains = {
        premium:
          r.mark_price !== null &&
          r.last_funding_rate !== null &&
          r.next_funding_time !== null,
        open_interest: r.open_interest !== null,
        lsr: r.top_ls_ratio_accounts !== null,
        taker: r.taker_buy_sell_ratio !== null,
      };
      console.log(`  updated_at: ${r.updated_at}  (age: ${ageSec(r.updated_at)}초)`);
      console.log(`  mark_price:              ${fmt(r.mark_price, 2)}`);
      console.log(`  last_funding_rate:       ${fmt(r.last_funding_rate, 6)}`);
      console.log(`  next_funding_time:       ${r.next_funding_time ?? "(null)"}`);
      console.log(`  open_interest:           ${fmt(r.open_interest, 0)}`);
      console.log(`  top_ls_ratio_accounts:   ${fmt(r.top_ls_ratio_accounts, 3)}`);
      console.log(`  taker_buy_sell_ratio:    ${fmt(r.taker_buy_sell_ratio, 3)}`);
      console.log(`  oi_chg_5m:               ${fmtPct(r.oi_chg_5m)}`);
      console.log(`  oi_chg_1h:               ${fmtPct(r.oi_chg_1h)}`);
      const allFour = domains.premium && domains.open_interest && domains.lsr && domains.taker;
      console.log(
        `  domains present: premium=${domains.premium} OI=${domains.open_interest} LSR=${domains.lsr} Taker=${domains.taker}`,
      );
      console.log(
        `  >> mixed-batch hazard 재발 없음 (4도메인 공존): ${allFour ? "✅ PASS" : "❌ FAIL"}`,
      );
    }
  }

  // ─── 4. 집계 — spot ticker 사전계산 충실도 (count 모드) ──
  console.log("\n### [4] now_spot_ticker 집계 (spot 전체)");
  // PostgREST max-rows=1000 cap 우회: { count: 'exact', head: true } 로 server-side COUNT.
  const tbl = "now_spot_ticker";
  const [totalR, fresh30R, chg5mR, chg1hR, volChgR, volRatioR] = await Promise.all([
    supabase.from(tbl).select("*", { count: "exact", head: true }).eq("exchange", "binance"),
    supabase
      .from(tbl)
      .select("*", { count: "exact", head: true })
      .eq("exchange", "binance")
      .gte("updated_at", new Date(Date.now() - 30_000).toISOString()),
    supabase
      .from(tbl)
      .select("*", { count: "exact", head: true })
      .eq("exchange", "binance")
      .not("price_chg_5m", "is", null),
    supabase
      .from(tbl)
      .select("*", { count: "exact", head: true })
      .eq("exchange", "binance")
      .not("price_chg_1h", "is", null),
    supabase
      .from(tbl)
      .select("*", { count: "exact", head: true })
      .eq("exchange", "binance")
      .not("volume_chg_5m", "is", null),
    supabase
      .from(tbl)
      .select("*", { count: "exact", head: true })
      .eq("exchange", "binance")
      .not("volume_ratio", "is", null),
  ]);
  const total = totalR.count ?? 0;
  const fresh = fresh30R.count ?? 0;
  const c5m = chg5mR.count ?? 0;
  const c1h = chg1hR.count ?? 0;
  const vc = volChgR.count ?? 0;
  const vr = volRatioR.count ?? 0;
  const pct = (n: number): string => (total > 0 ? ((n / total) * 100).toFixed(1) : "0.0");
  console.log(`  총 심볼 수: ${total}`);
  console.log(`  updated_at ≤ 30초: ${fresh} (${pct(fresh)}%)`);
  console.log(`  price_chg_5m non-null:  ${c5m} (${pct(c5m)}%)`);
  console.log(`  price_chg_1h non-null:  ${c1h} (${pct(c1h)}%)`);
  console.log(`  volume_chg_5m non-null: ${vc} (${pct(vc)}%)`);
  console.log(`  volume_ratio non-null:  ${vr} (${pct(vr)}%)`);

  // ─── 5. 집계 — indicator 4도메인 공존 비율 ──────────
  console.log("\n### [5] now_futures_indicator 집계 (USDM 전체)");
  const indAll = await supabase
    .from("now_futures_indicator")
    .select(
      "symbol, mark_price, open_interest, top_ls_ratio_accounts, taker_buy_sell_ratio, oi_chg_5m, updated_at",
    )
    .eq("exchange", "binance")
    .eq("market_type", "futures_usdm");
  if (indAll.error) {
    console.error(`  조회 실패: ${indAll.error.message}`);
  } else {
    const rows = indAll.data ?? [];
    const total = rows.length;
    const premium = rows.filter((r) => r.mark_price !== null).length;
    const oi = rows.filter((r) => r.open_interest !== null).length;
    const lsr = rows.filter((r) => r.top_ls_ratio_accounts !== null).length;
    const taker = rows.filter((r) => r.taker_buy_sell_ratio !== null).length;
    const oiChgFilled = rows.filter((r) => r.oi_chg_5m !== null).length;
    const all4 = rows.filter(
      (r) =>
        r.mark_price !== null &&
        r.open_interest !== null &&
        r.top_ls_ratio_accounts !== null &&
        r.taker_buy_sell_ratio !== null,
    ).length;
    console.log(`  총 USDM 심볼 수: ${total}`);
    console.log(`  mark_price non-null:       ${premium} (${((premium / total) * 100).toFixed(1)}%)`);
    console.log(`  open_interest non-null:    ${oi} (${((oi / total) * 100).toFixed(1)}%)`);
    console.log(`  LSR non-null:              ${lsr} (${((lsr / total) * 100).toFixed(1)}%)`);
    console.log(`  Taker non-null:            ${taker} (${((taker / total) * 100).toFixed(1)}%)`);
    console.log(
      `  oi_chg_5m non-null:        ${oiChgFilled} (${((oiChgFilled / total) * 100).toFixed(1)}%)`,
    );
    console.log(
      `  4도메인 모두 공존:         ${all4} (${((all4 / total) * 100).toFixed(1)}%) ← mixed-batch 무결성 지표`,
    );
  }

  // ─── 6. 집계 — futures_ticker 신선도 ─────────────
  console.log("\n### [6] now_futures_ticker 집계 (USDM+COINM)");
  const futAll = await supabase
    .from("now_futures_ticker")
    .select("symbol, market_type, last_price, price_chg_5m, updated_at")
    .eq("exchange", "binance")
    .limit(10000);
  if (futAll.error) {
    console.error(`  조회 실패: ${futAll.error.message}`);
  } else {
    const rows = futAll.data ?? [];
    const usdm = rows.filter((r) => r.market_type === "futures_usdm");
    const coinm = rows.filter((r) => r.market_type === "futures_coinm");
    const freshUsdm = usdm.filter((r) => {
      const age = ageSec(r.updated_at);
      return age !== null && age <= 30;
    }).length;
    const freshCoinm = coinm.filter((r) => {
      const age = ageSec(r.updated_at);
      return age !== null && age <= 30;
    }).length;
    console.log(
      `  USDM:  총 ${usdm.length}, 30초 이내 갱신 ${freshUsdm} (${((freshUsdm / Math.max(usdm.length, 1)) * 100).toFixed(1)}%)`,
    );
    console.log(
      `  COINM: 총 ${coinm.length}, 30초 이내 갱신 ${freshCoinm} (${((freshCoinm / Math.max(coinm.length, 1)) * 100).toFixed(1)}%)`,
    );
  }

  console.log("\n==================================================");
  console.log(" 검증 완료");
  console.log("==================================================\n");
}

main().catch((e) => {
  console.error("[verify:step4] fatal:", e);
  process.exit(1);
});
