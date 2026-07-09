/**
 * 카드 레지스트리 일괄 등록 — 앱 부트스트랩 전용.
 *
 * 왜 한 파일로 모으는가:
 *   각 카드가 자기 모듈 하단에서 `registerCardComponent` 를 호출하는 side-effect 방식은
 *   "해당 카드를 import 해야 등록된다" 는 조건을 낳는다. 앱 여러 곳에서 카드가
 *   사용되면 어디가 최초 import 인지 추적이 어렵고, tree-shaking 과 실행 순서도
 *   예측 불가능해진다.
 *
 *   대신 이 파일 하나에서 모든 카드를 import → registerCardComponent 를 호출하고,
 *   CanvasStoreProvider(=앱 루트) 가 마운트 시점에 `ensureCardsRegistered()` 1회 호출.
 *
 * HMR / StrictMode 대응:
 *   중복 호출이 들어와도 registerCardComponent 가 이미 있는 id 를 warn 후 덮어쓰므로
 *   crash 없음. `registered` 플래그로 불필요한 반복도 피한다.
 *
 * 등록 이력:
 *   M1.4 Step 2 — 'dummy' 등록 (검증용)
 *   M1.4 Step 3-2 — 'dummy' 제거 + 'ticker' 등록 (TickerCard)
 *   M1.4 Step 3-3 — 'coinList' 등록
 *   M1.4 Step 3-4 — 'klineChart' 등록
 *   M1.5 Step 3c (2026-04-22) — shared/defaults.ts 와 id 네이밍 통일:
 *     "ticker" → "ticker-card", "coinList" → "coin-list-card",
 *     "klineChart" → "kline-chart-card". cardComponentRegistry 문서 계약
 *     ("shared componentRegistry 와 동일 id") 을 실제로 만족시킴. dummyChatParser
 *     가 캐멀케이스로 맞춰 써서 숨어 있던 drift 가 M1.5 Step 3 실호출에서 발현.
 */

import ChartCard from "@/components/cards/ChartCard";
import FeedCard from "@/components/cards/FeedCard";
import IndicatorCard from "@/components/cards/IndicatorCard";
import KlineChartCard from "@/components/cards/KlineChartCard";
import TableCard from "@/components/cards/TableCard";
import TickerCard from "@/components/cards/TickerCard";
import { registerCardComponent } from "@/lib/cardComponentRegistry";

let registered = false;

export function ensureCardsRegistered(): void {
  if (registered) return;
  registered = true;

  // 단일 심볼 실시간 가격 카드 — now_{spot|futures}_ticker Realtime row 구독.
  registerCardComponent("ticker-card", TickerCard);
  // 모양-제네릭 표 — 티커/지표 등 어떤 set datasource 든 받는 다중 심볼 랭킹/스크리너
  //   (updateMode=content). coin-list-card + indicator-list-card 수렴 (Composable Stage 1).
  registerCardComponent("table-card", TableCard);
  // TradingView 임베드 캔들 차트 — 테마 토글 동기화.
  registerCardComponent("kline-chart-card", KlineChartCard);
  // 단일 심볼 선물 지표 카드 — now_futures_indicator datasource 별 적응 렌더 (M2 테마 A Step 2).
  registerCardComponent("indicator-card", IndicatorCard);
  // 모양-제네릭 이벤트 피드(tape) — 어떤 events datasource 든 받는 실시간 흐름
  //   (updateMode=content, 경로 A 전용). 첫 시민 = 청산 (Composable Stage 3, ff#2 Step 5).
  registerCardComponent("feed-card", FeedCard);
  // 모양-제네릭 시계열 차트 — 어떤 series datasource 든 받는 자체 uPlot 차트
  //   (주기 pull, updateMode=value). 첫 시민 = history 지표 6종 (Composable 사이클 2 Step 5).
  registerCardComponent("chart-card", ChartCard);
}
