# M2 — `[10-99]` 절대 시각 표기 UTC 통일 (소사이클) — task-record, 단일 진실

> **상태**: ✅ **완결 (2026-07-13 당일)** — `[10-100]` 대청소에 이어 같은 세션에서 실행 (사용자 지시 "이어서 다음 개발 진행").
> **결정**: 사용자 확정 (2026-07-13) — "글로벌 타겟이므로 **모든 데이터에 대해 UTC 로 표기**. 모두 꼼꼼히 검토할 것." 영구 정책 = `canonical-metrics.md §4.4`.
> **배경**: 사이클 2 Phase B reviewer S2 (2026-07-10) — 차트 절대 시각이 전부 로컬(KST) 표기, Binance Funding History 는 UTC 관례라 사이트 대조 시차 혼동 여지. 플롯 **값**은 site=DB 일치(표기 층위만의 문제).

---

## 0. 한 줄 요약 (비전공자용)

> **"화면에 찍히는 '몇 시 몇 분'이 지금까지는 보는 사람 컴퓨터의 시간대(한국=KST)였다. 거래소 공식 페이지는 세계 표준시(UTC)로 표시하므로 대조할 때 9시간이 어긋나 보였다. 이제 앱의 모든 절대 시각을 UTC 로 통일하고, 오해가 없도록 'UTC' 라벨을 붙였다. '3분 전' 같은 상대 시간은 시간대와 무관해서 그대로다."**

---

## 1. 전수 감사 (표시 지점 6곳 — grep `toLocale*` 전수 + `Intl/getHours` 0건 + uPlot 축)

| # | 지점 | 소비처 | 조치 |
|---|---|---|---|
| 1 | `formatEventTime` (marketUnits.ts) | 피드 라인 · 청산 표 TIME · 스크리너 SETTLED AT · 차트 freshness <24h | `timeZone:"UTC"` |
| 2 | `formatChartTime` (chartFormat.ts) | 차트 툴팁 · freshness 24h+ | `timeZone:"UTC"` |
| 3 | uPlot x축 눈금 | chart-card | `tzDate: uPlot.tzDate(·,"Etc/UTC")` — **1.6.32 dist d.ts L148 실재 확인**(2026-07-13, `feedback_external_api_live_smoke`) |
| 4 | 라벨 | 툴팁 " UTC" 접미 / ChartCard freshness `last point {t} UTC` (24h± 두 포매터 경로 공통 1곳) | 신설 |
| 5 | 표 헤더 | 청산 `TIME (UTC)` / 스크리너 `SETTLED (UTC)`(width 5→6rem) — 밀도 높은 셀 대신 헤더 1회 소유 | 신설 |
| 6 | FeedCard 캡션 / ViewSaveIndicator | subtitle 별도 `<span> · times UTC</span>`(AI 원문 무수정, [10-92]① 뱃지 선례) / `Last saved at {t} UTC` | 신설 |

**무변경**: 상대 시간(`formatRelativeTime`/`formatCountdown`/"N ago") — TZ 무관.

## 2. 설계 원칙 (라벨 소유권)

- **값 포매터 = 순수 UTC 값 / "UTC" 라벨 = 표시 지점이 1회 소유** — 밀도 높은 셀(피드 tape, 표 셀)마다 접미를 붙이면 노이즈, 1회성 표시(툴팁·freshness·tooltip)엔 접미. 새 카드가 절대 시각을 표시하면 이 배치를 따를 것 (canonical §4.4).
- uPlot `tzDate` 는 축 눈금·자정 경계만 UTC 정렬 — 툴팁/freshness 는 자체 UTC 포매터라 독립(이중 적용 없음).

## 3. 검증

- **테스트**: web 465 전체 green (신규 +7: `formatEventTime` 4핀 — **종전 로컬 표기는 머신 TZ 의존이라 핀 테스트 자체가 불가능했음, UTC 고정의 부수 이득** / chartFormat "[10-99]" describe 3건 — formatChartTime 결정 핀·tzDate 계약(반환 Date 로컬 getter=UTC 벽시계)·툴팁 UTC 라벨) + ChartCard freshness 정규식 2곳 갱신. type-check/lint exit 0.
- ICU 실측: `hour12:false`(h23)에선 `hour:"numeric"` 도 2자리 패딩("08:00") — 핀에 반영.
- 자문: code-reviewer + crypto-trader (결과는 §4).

## 4. 자문 결과 (2026-07-13)

- **code-reviewer 0C / 0W / 3S**: ① 놓친 표기 지점 **0** 독립 재감사(전수 grep + 래퍼 추적 `formatFeedTime→formatEventTime` + MyViews 내부값=비표시 확인) ② tzDate 충돌 없음(uPlot 이 옵션에 넘기는 값 = epoch **초** → `×1000` 정확 / 다운샘플·RF 줌 커서 보정과 직교 / 툴팁은 자체 UTC 포매터라 독립 — 변경 전 로컬/로컬 → UTC/UTC 정합 이동) ③ ★ **TradingView 임베드는 기존부터 `timezone:"Etc/UTC"`**(KlineChartCard.tsx:65) = 자체 차트+표+피드+서드파티 임베드 **전 시각 경로 UTC 완전 정합 확인**. S1(청산 TIME 5rem 헤더 폭)=라이브 육안 확인 항목 / S2(JSDoc 오독 여지)=즉시 반영 / S3=본 기록.
- **crypto-trader (advisory)**: 라벨 밀도 전략(헤더/캡션 1회) 일관 + 페르소나 3종 정합(툴팁 절대시각 고정=스캘퍼 / SETTLED (UTC)=스윙 펀딩 사이클 / 24h+ 날짜 병기=포지션). ⚠️ Q1(피드 고지가 AI subtitle 경유라 흔들림)은 **오독** — `· times UTC` 는 AI 문구와 무관한 form 고정 span(승격안 (B)가 이미 구현 상태). Q2(x축 상시 "UTC" 표식)·Q3(Last saved 로컬 예외)·타임존 토글 = **`[10-109]` 등재** (실사용 관찰 후 사용자 결정).

## 5. 다음 / 라이브 확인 항목

**▶ 사이클 5 (Stage 1b — BigValue/Detail 일반화)** — 착수 가이드 `M2-composable-expressiveness.md §11 항목 7`. *(→ ✅ 완결 2026-07-14 = 격자 완성, `M2-cycle5-stage1b.md`. 아래 라이브 확인 4항목은 그 세션에서 동반 확인 — `[10-109]` 관찰은 계속.)*
**라이브 확인 (Vercel 배포 후, 다음 실사용 세션 겸)**: ① 차트 x축 눈금 UTC + 툴팁 " UTC" ② 피드 캡션 "· times UTC" ③ 청산 표 "TIME (UTC)" 헤더 폭 5rem 잘림 여부(reviewer S1) ④ Binance 공식 사이트 청산/펀딩 시각과 UTC 기준 일치 대조(위생 #9, reviewer 권장).
