# TRAVIS — 아키텍처 문서

본 문서는 TRAVIS의 시스템 설계 원칙과 데이터 플로우를 정의합니다.
구체적인 폴더 구조와 파일 구성은 코드베이스를 직접 참조하세요.
제품 요구사항은 `docs/PRD.md`, DB 스키마는 `docs/DB_SCHEMA.md` 참조.

---

## 1. 시스템 구성

TRAVIS는 3개의 독립적인 배포 단위로 구성됩니다:

**Vercel** — Next.js 16 프론트엔드 + API Route (AI 오케스트레이터)
**Hetzner VPS** — 데이터 수집 워커 + WS 릴레이 서버
**Supabase** — DB + Auth + Realtime + Edge Functions

이 세 서비스는 각각 독립적으로 배포되며, Supabase를 중심으로 연결됩니다.

---

## 2. 데이터 플로우

프론트엔드는 동시에 3개의 데이터 스트림을 수신합니다:

### 경로 A — WS 스트리밍 (진정한 실시간)

```
거래소 WS → Hetzner 어댑터 → Hetzner WS 릴레이 서버 → 프론트엔드 직접
```

거래소별 WebSocket API에서 지원하는 모든 데이터를 지원. Supabase를 거치지 않음 — 실시간 스트리밍 데이터에 대해 DB write + Realtime broadcast 지연은 용납할 수 없음.
Hetzner가 4개 거래소 × 현물/선물 = 8개 WS 연결을 유지하고, 거래소별 데이터를 정규화된 공통 포맷으로 변환하여 프론트엔드에 릴레이.

**중요**: Path A는 **프론트엔드 실시간 갱신 전용**이며, **AI 의사결정에는 사용되지 않음**. 카드가 Supabase 기반 AI 응답으로 렌더된 이후, 그 카드의 값(가격 틱, orderbook 변화, trades)을 실시간 갱신하는 용도 전용.

### 경로 B — 나머지 전부 (준실시간)

```
데이터 소스 → Hetzner 폴링 → Supabase DB (upsert) → Supabase Realtime → 프론트엔드
```

가격, 거래량, 펀딩레이트, OI, 뉴스, 코인 메타데이터, 온체인, 상장 목록 등 모든 폴링 기반 데이터.
데이터 특성별 차별화된 주기로 폴링 (고/중/저 변동성 tier 원칙, **구체 수치는 개발 중 결정**, **배치 API 의무 사용**). Supabase가 단일 진실 공급원 — **AI 오케스트레이터는 Supabase DB만 조회**하며, 거래소 REST API, CoinMarketCap, 뉴스 API 등 외부 API를 직접 호출하지 않음. Supabase miss 시 **Tavily 웹 검색 폴백** (~5% 수준).

### 경로 C — AI 명령

```
사용자 쿼리 → Vercel API Route → AI 오케스트레이터 → (Supabase 쿼리) → JSON 뷰 설정 → 프론트엔드
```

AI가 레지스트리를 참조하여 컴포넌트 + 데이터 소스 + 인터랙션 조합을 결정.

**AI의 데이터 소스 제약 (non-negotiable)**:
- AI는 **Supabase DB만 조회** — 거래소 REST API, CoinMarketCap, 뉴스 API 등을 직접 호출하지 않음
- Supabase miss 또는 웹 검색 필요 시 → **Tavily 웹 검색 폴백** (~5% 수준)
- AI는 `dataService` **abstraction layer**를 경유하여 데이터 접근 (미래 스토리지 마이그레이션 safety net, §10 참조)

출력 JSON을 Zod로 검증 후 프론트엔드에 전달. 프론트엔드는 JSON을 파싱하여 카드 생성 + 데이터 구독(경로 A 또는 B) 바인딩.

**프론트엔드 실시간 갱신 경로 두 가지**:
- **경로 A (거래소 WS 직접)**: 고빈도 거래소 스트림 — Hetzner WS 릴레이 → 프론트엔드 직접
- **경로 B 경유 (Supabase Realtime)**: WebSocket으로 직접 지원되지 않는 폴링 기반 데이터 — Hetzner 폴링 → Supabase upsert → Supabase Realtime → 프론트엔드. 이를 통해 AI가 Supabase 기반으로 렌더한 카드가 폴링 데이터 업데이트 시 자동 갱신됨.

---

## 3. AI 오케스트레이터 설계

### 처리 흐름

1. 사용자 자연어 입력 수신
2. Haiku 호출 — 시스템 프롬프트에 레지스트리 내용이 구조화된 텍스트로 주입됨
3. Haiku가 의도 분류 + 복잡도 판단: 단순이면 바로 JSON 출력, 복잡이면 Sonnet에 위임
4. 출력 JSON을 Zod 스키마로 검증. 실패 시 1회 재시도
5. 프론트엔드로 반환

### 핵심 원칙

- **하드코딩 없음**: AI는 레지스트리 목록만 보고 런타임에 조합을 결정. 새 레지스트리 항목 추가 시 AI가 자동 사용.
- **AI 출력 JSON**: 카드별로 컴포넌트 타입, 데이터 소스 + 파라미터, **갱신 모드(updateMode)**, **필터 조건(filters)**, 인터랙션 정의를 포함. 구체적 JSON 구조는 Zod 스키마 파일 참조.
- **갱신 모드(updateMode)**: AI가 사용자 의도를 파악하여 카드별 갱신 전략을 결정. `value`(숫자만 갱신), `content`(필터 재평가로 항목 동적 추가/제거), `reactive`(카드 구성 자체 변경, MVP 이후). 상세 설명은 `docs/PRD.md §3` 참조.
- **복합 조건 필터**: AI가 자연어 조건("거래량 증가하고 OI 급증하는 코인")을 데이터 소스 레지스트리의 필터 가능 필드(queryable fields)를 참조하여 구조화된 `filters` 배열로 변환. Haiku가 단순 필터, Sonnet이 복잡한 다중 조건 필터를 처리.
- **레지스트리 → 프롬프트 주입**: 4개 레지스트리의 각 항목(key, description, 파라미터, 지원 인터랙션, **필터 가능 필드**)이 AI 시스템 프롬프트에 자동으로 포함됨. 항목 등록만으로 AI가 인식.

---

## 4. 4개 레지스트리 패턴

TRAVIS의 확장성은 4개 레지스트리에 의존합니다. 모든 레지스트리는 동일한 패턴을 따릅니다: **항목 등록 → AI가 즉시 사용 가능, 오케스트레이터 코드 변경 불필요.**

### 거래소 어댑터 레지스트리

거래소 연결을 위한 공통 인터페이스. 각 어댑터는 REST(폴링) + WebSocket(스트리밍)을 구현.
마켓 타입(spot, futures, options, alpha 등)은 어댑터별 배열로 선언 — 새 자산군 추가는 타입 추가만으로 확장.
모든 어댑터는 거래소별 API 차이를 내부에서 흡수하고, 정규화된 공통 포맷으로 데이터를 출력.

### 데이터 소스 레지스트리

사용 가능한 데이터 소스와 그 스키마, 갱신 주기, 쿼리 파라미터, **필터 가능 필드(queryable fields)**를 기술.
AI가 이를 읽고 어떤 데이터에 접근 가능한지, **어떤 필드를 기준으로 필터링할 수 있는지** 파악하여 사용자 쿼리에 맞는 소스를 선택.

필터 가능 필드 선언 예시:
- `volume_change_1h`: 숫자 타입, 비교 연산자(`>`, `<`, `=`) 지원
- `oi_change_1h`: 숫자 타입, 비교 연산자 지원
- `price_vs_ma5`: 위치 타입, `above`/`below` 연산자 지원

이 선언이 AI 시스템 프롬프트에 자동 주입되므로, AI는 존재하지 않는 필드를 참조하는 실수 없이 정확한 필터 JSON을 생성할 수 있음.

### 컴포넌트 레지스트리

사용 가능한 UI 컴포넌트와 필요한 데이터 형태, 지원 크기, 지원 인터랙션을 기술.
AI가 이를 읽고 사용자 의도에 맞는 컴포넌트를 선택.

### 인터랙션 레지스트리

사용 가능한 인터랙션 유형(spawn, drill-down 등)을 기술.
컴포넌트가 어떤 인터랙션을 지원하는지 선언하고, AI가 맥락에 따라 선택.
새 인터랙션 유형은 핸들러 구현 + 등록으로 추가.

---

## 5. 프론트엔드 설계 원칙

### 캔버스

React Flow 기반 무한 2D 캔버스. 모든 카드는 React Flow의 커스텀 노드로 렌더링.
카드 노드는 공통 컨테이너(드래그, 리사이즈, 삭제, 헤더)이며, 내부에 레지스트리의 컴포넌트를 동적 렌더링.
각 카드는 자체적으로 데이터 구독을 관리 (WS 스트리밍 데이터는 Hetzner WS, 폴링 데이터는 Supabase Realtime).

### 갱신 모드 처리

카드는 AI가 지정한 `updateMode`에 따라 실시간 갱신 전략을 분기:
- **`value` 모드**: 구독된 데이터의 값이 변경되면 카드 내 숫자/차트만 갱신. 카드 구조는 고정.
- **`content` 모드**: 구독된 데이터 변경 시 AI가 정의한 `filters` 조건을 **재평가**. 조건을 새로 충족하는 항목은 카드에 추가, 벗어나는 항목은 제거. 프론트엔드가 Supabase Realtime으로 `_now_*` 테이블 변경을 수신할 때마다 필터 로직을 클라이언트에서 실행.
- **`reactive` 모드**: MVP 이후 — 상황 변화에 따라 카드 구성 자체가 변경될 수 있음.

### 상태 관리

Zustand로 글로벌 상태 관리. 주요 상태: 캔버스(노드/뷰포트), 채팅(메시지/입력), 뷰(저장된 뷰 목록).
캔버스 상태 변경 시 뷰 저장에 직렬화, 채팅 메시지 추가 시 Supabase에 로그 비동기 저장.

### 액션 디스패처

카드 내 요소 클릭 → AI가 정의한 action을 읽고 실행.
spawn: 캔버스에 새 카드 노드 추가 + 데이터 구독 시작.
drill-down: 같은 카드 내부 뷰 전환 + 뒤로가기 스택 관리.

---

## 6. Hetzner 데이터 워커 설계 원칙

워커는 두 가지 역할을 수행합니다:

### 데이터 수집기

스케줄러가 데이터 소스별 주기에 따라 어댑터를 호출.
어댑터가 거래소/외부 API에서 데이터를 수집하고 정규화.

**사전 계산 레이어**: 원시 데이터 수집 직후, upsert 직전에 트레이더가 자주 사용하는 가공 값을 계산. 기술적 지표(MA, RSI, MACD, 볼린저밴드 등), 변화율(거래량, OI, 펀딩레이트의 시간대별 변화율), 파생 위치(가격 vs MA, ATH 대비 % 등). 사전 계산 대상은 데이터 소스 레지스트리에 등록되는 방식이므로, 새 지표 추가 시 레지스트리 등록 + 계산 로직 추가로 확장. 오케스트레이터 코드 변경 불필요.

Supabase에 upsert — `_now` 테이블은 **원시 데이터 + 가공 값을 같은 행에** 최신 값 덮어쓰기, `_history`에 append.

### WS 릴레이 서버

4개 거래소의 WebSocket에 8개 연결 유지 (현물 + 선물).
프론트엔드가 Hetzner WS에 연결하여 필요한 심볼만 구독.
거래소 WS 끊김 시 자동 재연결. 프론트엔드에는 정규화된 공통 포맷으로 릴레이.

---

## 7. Supabase 설계 원칙

### 4가지 역할

- **DB**: 모든 폴링 기반 마켓 데이터, 사용자 데이터, 로그 저장
- **Auth**: 사용자 인증 (이메일, 소셜)
- **Realtime**: `_now` 테이블 변경 시 프론트엔드에 자동 푸시
- **Edge Functions**: 사용자 거래소 API 키 복호화 등 민감한 서버사이드 로직

### 테이블 카테고리

- `_now`: 최신 스냅샷 (Realtime 구독 대상)
- `_history`: 과거 데이터 축적 (보존/다운샘플링 정책)
- `user_*`: 사용자별 설정, 뷰, 암호화된 API 키
- `log_*`: 채팅 로그, 행동 로그
- `exchange_*`: 거래소별 상장 목록, 메타데이터

### RLS 정책

- `user_*`, `log_*`: 본인 데이터만 접근 (`auth.uid() = user_id`)
- 마켓 데이터: 인증된 사용자 전체 읽기
- 어드민 테이블: 어드민 role만 접근

---

## 8. 확장 패턴

모든 확장은 동일한 패턴을 따릅니다:

| 확장 대상 | 필요한 작업 |
| --- | --- |
| 새 거래소 | 어댑터 구현 + 레지스트리 등록 |
| 새 자산군 (options 등) | 기존 어댑터의 마켓 타입 추가 + 관련 메서드 구현 |
| 새 컴포넌트 | React 컴포넌트 구현 + 레지스트리 등록 |
| 새 데이터 소스 | 수집 로직 + Supabase 테이블 + 레지스트리 등록 |
| 새 인터랙션 | 핸들러 구현 + 레지스트리 등록 |

어떤 확장이든 오케스트레이터 코드 변경은 불필요합니다.

---

## 9. 인프라

| 서비스 | 역할 |
| --- | --- |
| Vercel | Next.js 프론트엔드 + API Route 호스팅 |
| Supabase | DB + Auth + Realtime + Edge Functions |
| Hetzner VPS | 데이터 수집 워커 + WS 릴레이 서버 |
| Claude API | AI 오케스트레이터 (Haiku + Sonnet) |
| Tavily | 웹 검색 폴백 (~5%) |

---

## 10. 데이터 스토리지 확장 전략

TRAVIS는 CoinGlass/CoinMarketCap 수준의 데이터 커버리지를 목표로 합니다. 이 스케일에서는 Supabase(PostgreSQL) 단독 운영이 시계열 데이터 처리에 한계가 있으므로, **단계적 하이브리드 전환 전략**을 채택합니다. 이 전략은 "deferred migration" 원칙을 따라 — 실데이터 증가 패턴을 관찰한 후 올바른 대안을 선택합니다.

### 기본 원칙

| Phase | 시점 | 스토리지 구성 |
|---|---|---|
| **Phase 1** | 초기 단계 | **Supabase only** (단순성 우선) |
| **Phase 2** | 임계점 도달 시 | **하이브리드** — TimescaleDB 또는 ClickHouse (시계열) + Supabase (user data) |
| **Phase 3** | 장기 (선택적) | **장기 archive 레이어** — S3/R2 Parquet + DuckDB/ClickHouse cold query |

### Supabase의 초대형 시계열 한계

- PostgreSQL은 **OLTP 최적화**이며 대량 시계열 insert/aggregation에 취약
- **Native 압축 없음** (TOAST 외에는 페이지 수준 압축 부재)
- **자동 파티셔닝/retention policy 없음** (수동 관리 필요)
- **Supabase는 TimescaleDB extension 공식 지원을 중단** — Supabase 내부에서 시계열 확장 불가, 별도 인프라 필수

### 대안 비교

| DB | 압축률 | Aggregation | SQL 호환 | 적합 상황 |
|---|---|---|---|---|
| **TimescaleDB** | 3~10x | 중간 | 높음 (PostgreSQL) | SQL 호환성 우선, 점진 마이그레이션 용이 |
| **ClickHouse** | 50~100x | 매우 빠름 | 중간 (SQL dialect 다름) | Aggregation-heavy, 초대형 데이터 |
| **InfluxDB** | ~10x | 중간 | 낮음 (Flux) | 시계열 전용 (crypto 생태계 작음) |
| **S3 + DuckDB/ClickHouse** | 20x+ | 중간 (cold) | 변동 | 장기 archive (hot storage 축소) |

### `dataService` Abstraction Layer — 핵심 Safety Net

**프로젝트 초기부터** AI 오케스트레이터와 Hetzner 워커는 Supabase 클라이언트를 직접 호출하지 않고 `dataService` abstraction layer를 경유합니다:

```
AI Orchestrator ─┐
                 ├─→ dataService.query*() ─┬→ Supabase (Phase 1)
Frontend cards ─┘                          └→ TimescaleDB/ClickHouse (Phase 2 이후)
```

- **Phase 1**: `dataService` 내부 구현은 Supabase만 호출
- **Phase 2 전환**: `dataService` 내부 구현만 변경 → AI 쿼리 코드 변경 0건
- **이것이 "deferred migration" 전략의 핵심** — 미래 변경 가능성을 구조적으로 프로젝트 초기부터 열어둠

### Phase 2 마이그레이션 경로 (임계점 도달 시)

1. **Hetzner 자체 호스팅 TimescaleDB 또는 ClickHouse 구축** (비용 효율, 기존 Hetzner 인프라 활용)
2. **`_history_*` 테이블부터 점진 이전** — 대량 시계열이 하이브리드 DB로
3. **Supabase 유지 대상**: `user_*`, `log_*`, `exchange_*`, 최신 `_now_*` 일부
4. **Dual-write 일정 기간** — zero-downtime 보장
5. **검증 후 구 테이블 drop**

### 트리거 조건 (Phase 2 진입 판정)

모니터링 기반으로 판정:
- Supabase DB 크기 임계점 도달 (구체 수치는 개발 중 결정)
- 쿼리 성능 저하 감지 (aggregation 쿼리 latency 증가)
- 스토리지 비용이 TimescaleDB/ClickHouse 자체 호스팅 비용을 초과하는 시점

### Phase 3 — 장기 archive (선택적)

- 오래된 `_history_*` 데이터 (예: 6개월 이상)를 S3 또는 Cloudflare R2 Parquet 파일로 archive
- DuckDB 또는 ClickHouse S3 engine으로 cold query
- Hot storage를 1/10 수준으로 축소 → 극한 비용 효율

### 개발 중 결정할 사항

- 구체 임계점 수치 (DB 크기, 쿼리 latency 등)
- TimescaleDB vs ClickHouse 선택 (실데이터 쿼리 패턴 분석 후)
- `dataService` abstraction layer interface 상세 형태
- Dual-write 기간
- Archive 보존 기간 정책
- `_now_*` 테이블의 하이브리드 전환 여부 (고빈도만 이전 or 전체 유지)