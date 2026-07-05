---
name: binance-usdm-ticker-fields
description: Binance USDM <symbol>@ticker(full)/24hr REST 필드 의미 + 경로 A 전환 G2 실측 대조 로그
metadata:
  type: reference
---

# Binance USDM ticker 필드 의미 (공식 + 라이브 실측)

## 출처
- REST: `https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=BTCUSDT` (24h rolling window)
- mark/index: `https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT`
- docs: `https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/24hr-Ticker-Price-Change-Statistics`
- 조회: 2026-06-24

## 필드 정의 (실측 확정)
- `lastPrice` = **마지막 체결가(last traded price)**. mark/index 와 다른 별개 값. 2026-06-24 동시 실측: lastPrice 62738.50 / markPrice 62737.42 / indexPrice 62752.51 → 세 값이 모두 다름 = 카드 last_price 가 mark 가 아님 입증.
- `priceChangePercent` = **24h rolling window** 변화율 (open→last). funding(8h) 단위와 무관. 실측 0.566%.
- `lowPrice`/`highPrice` = 24h rolling 최저/최고. 2026-06-24 카드값과 **소수점까지 완전 일치**(61916.90 / 63090.90) = 정의 동일성의 결정적 증거.
- `weightedAvgPrice` = 24h VWAP (62514.12). last_price 와 혼동 금지 — 카드에 24h 평균을 현재가로 쓰면 안 됨.

## 경로 A(WS 직결) 전환 G2 대조 (2026-06-24)
ticker 카드 B→A 전환 (워커 `<symbol>@ticker` full → StreamCoalescer 1s → normalize → 프론트 직방송, DB 우회).
- 카드 last $62,747.10 / +0.64% / Low 61916.90 / High 63090.90
- API last 62738.50 / +0.566% / Low 61916.90 / High 63090.90
- → 가격·부호·자릿수 일치, low/high 소수점 일치. **운반 경로만 바뀌고 normalize/정의 불변 확인.**

## 함정
- mark vs index vs last 혼용 금지. funding/liquidation=mark, 현물 바스켓=index, 체결=last.
- WS **full(`@ticker`, 17필드)** vs **mini(`!miniTicker@arr`, 6필드)**: mini 는 priceChangePercent/weightedAvgPrice/lowPrice/highPrice 누락 → 24h change/low/high 카드 표현 불가. 경로 A 는 full per-symbol 이라 누락 없음(프로젝트 메모리 M1.6 Step 4 hotfix 의 mini stale 사고 반대 케이스).
