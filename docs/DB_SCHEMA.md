# TRAVIS — DB Schema

구체적 테이블 정의, 컬럼 타입, 인덱스, 관계, 그리고 각 소스에서 수집하는 데이터의 정확한 필드/조건은 **실제 개발 시점에 하나씩 결정**합니다. 이 문서는 개발 진행에 따라 점진적으로 작성되며, M1 시작 전에는 카테고리 원칙만 명시합니다.

## 원칙

- **테이블명/카테고리/RLS 정책/관계는 계획 가능** — 이 문서에 선언적으로 기술
- **컬럼/타입/인덱스/수집 필드는 구현 시점 결정** — 실제 사용 패턴과 거래소 API 응답을 보고 결정
- **모든 `user_*`, `log_*` 테이블에 RLS 필수** (`auth.uid() = user_id`) — CI 스크립트가 검증
- **변경 시 이 문서 업데이트** — 새 테이블/컬럼 추가 시 해당 섹션 채우기

## 잠정 카테고리 (이름/구조는 개발 중 확정)

### `_now_*` — 최신 스냅샷 테이블
- Hetzner 워커의 폴링으로 upsert되는 테이블
- Supabase Realtime 구독 대상 → 프론트엔드가 구독하여 카드 실시간 갱신
- 각 테이블은 특정 데이터 타입의 최신 값만 유지 (예: ticker의 latest price)
- 예시 (M1): `_now_ticker`, `_now_kline`, `_now_symbol` 등 — 정확한 이름과 컬럼은 개발 중 결정

### `_history_*` — 과거 데이터 축적 테이블
- 시계열 아카이브용 — 테이블별 retention 및 다운샘플링 정책 적용
- 대량 데이터가 축적되는 핵심 테이블 (스토리지 확장 전략의 주 대상)
- M2에서 kline 30일 backfill부터 시작 (구체 기간은 개발 중 결정)
- **M3~M5 시점에 TimescaleDB/ClickHouse 하이브리드 전환 유력 대상**

### `user_*` — 사용자 데이터 테이블
- 사용자별 설정, 저장된 뷰, 암호화된 API 키 등
- **모든 테이블에 RLS 필수** (`auth.uid() = user_id`)
- 예시: `user_views` (M2), `user_settings` (M3), `user_exchange_keys` (M3)

### `log_*` — 로그 테이블 (M1부터)
- 사용자별 채팅 로그, 행동 로그, AI 검증 실패 로그
- **모든 테이블에 RLS 필수**
- Launch 이후 M3 Sonnet 라우팅 판정 기준의 입력 데이터 역할
- 예시: `log_chat`, `log_behavior`, `log_validation_failure`

### `exchange_*` — 거래소 메타데이터 테이블
- 거래소별 상장 심볼 목록, 심볼 메타데이터 (base/quote, tick size, listing date, delist status, dated/quarterly expiry 등)
- Hetzner 워커의 symbol list 폴링으로 업데이트
- 스키마 관리에 큰 영향 (심볼 lifecycle은 이 테이블에서 관리)
- 예시: `exchange_symbols` — 정확한 이름과 컬럼은 개발 중 결정

## 데이터 플로우 요약

1. **쓰기**: Hetzner 워커가 소스 API를 폴링 → 정규화 → Supabase `_now_*` upsert + `_history_*` append
2. **읽기 (AI)**: AI 오케스트레이터가 `dataService` abstraction layer 경유 → Supabase SQL 쿼리 → 사용자 응답 JSON 생성
3. **읽기 (프론트엔드)**: 카드가 Supabase Realtime 구독 → `_now_*` 변경 시 자동 갱신 (Path B 경유 실시간)
4. **AI는 거래소 API / CoinMarketCap / 뉴스 API를 직접 호출하지 않음** — 오직 Supabase (또는 Tavily fallback)

## 스토리지 확장성 참조

Supabase PostgreSQL의 시계열 한계로 인해 M5 시점에 TimescaleDB 또는 ClickHouse 하이브리드 도입 가능성이 있습니다. 자세한 전략은 `docs/ARCHITECTURE.md §10` 참조.

**마이그레이션 시 분할 원칙** (개발 중 최종 결정):
- **Supabase 유지**: `user_*`, `log_*`, `exchange_*`, 최신 `_now_*` 일부 (hot snapshots)
- **하이브리드 DB 이전 대상**: 대량 `_history_*` 테이블 (대규모 시계열)
- **`_now_*`의 split 여부**: 고빈도 갱신 테이블을 하이브리드로 이전할지 개발 중 결정
- **AI orchestrator 변경 없음**: `dataService` abstraction layer가 존재하므로, 엔진 교체 시 layer 내부 구현만 변경

## 개발 시 이 문서 업데이트 가이드

테이블을 새로 만들거나 기존 테이블 스키마를 변경할 때:
1. 해당 카테고리 섹션에 테이블 이름 + 간단한 목적 추가
2. 컬럼 구조는 마이그레이션 파일에서 확인 가능하므로 여기에는 중복하지 않음
3. 특이사항 (RLS 정책, 인덱스, retention 정책)만 간략히 명시
