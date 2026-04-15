/**
 * IDataService — TRAVIS 데이터 접근 추상화 계약.
 *
 * M1.1에서는 "타입 자리"만 잡는다. 실제 메서드 시그니처는
 * 호출 지점이 생기는 M1.3 (첫 SQL 마이그레이션 + 최초 소비자)에서
 * 추가된다. CLAUDE.md의 deferred decision 원칙에 따라
 * 추측으로 메서드를 선언하지 않는다.
 *
 * 이 인터페이스의 목적은 "Supabase → TimescaleDB/ClickHouse"로 DB를
 * 교체할 때 배관 전체를 뜯지 않기 위한 어댑터 레이어다.
 *
 * M1.3 진입 시 첫 메서드 결정 트리거:
 *   - 첫 SQL 마이그레이션(ticker_now 또는 funding_now 등)이 확정되고,
 *   - 그 테이블을 읽는 최초 소비자(apps/web hook 또는 AI 오케스트레이터)가 생기면,
 *   - 그 호출 형태에 맞춰 query* 메서드를 1개만 먼저 추가 (추측 금지).
 *
 * @see docs/Architecture.md §10 — DB 스토리지 확장 전략
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface IDataService {}
