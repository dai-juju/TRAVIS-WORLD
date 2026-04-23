---
name: M1.5 UX baseline
description: M1.5 완성 시점(2026-04-23) 카드 생성 루프 체험 베이스라인. 3페르소나별 수용성 관찰과 제약 요약.
type: project
---

M1.5 완료 시점 기준 UX 체험 요약.

**루프**: ChatInputBar → POST /api/orchestrate → Haiku 4.5 tool_use → Zod 검증(1회 self-correction) → dispatcher → 캔버스 카드 렌더.

**지원 카드 3종**: TickerCard (단일 심볼 실시간), CoinListCard (스크리너), KlineChartCard (TradingView 임베드).

**데이터 소스**: Binance (spot + USDT-M + COIN-M perp) 전용.

**핵심 제약**:
- English only 시스템 프롬프트 / UI / placeholder
- 카드 생성 측정치 3~7초 (Haiku 왕복 + tool_use + Zod + dispatcher)
- 동일 쿼리 2회 → nonce suffix 로 별도 카드 생성 (덮어쓰지 않음)
- 로딩 스피너 없음, 데이터 신선도 표시 없음, 로그인 없음, 저장/불러오기 없음

**페르소나 수용성 관찰**:
- 스캘퍼: 3~7초 지연은 쿼리당 1회성이므로 "카드 배치 단계" 에선 허용 가능. 단 틱 단위 전환 중엔 거의 안 쓸 것.
- 스윙: 가장 스윗스팟. 차트+스크리너 조합 만드는 시간 vs 기존 TV/Coinglass 탭 전환 비교 시 경쟁력.
- 포지션: 현 3카드로는 효용 낮음. M2+ 펀딩/OI/매크로 카드 기다려야 할 가능성.

**Why**: 앞으로 매 Step 회고 시 이 베이스라인과 비교하기 위함.
**How to apply**: 새 카드 타입 / 새 데이터 소스 추가 시 "이 3페르소나 수용성이 어떻게 바뀌는가" 를 첫 질문으로.
