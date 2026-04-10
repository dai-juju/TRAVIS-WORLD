# TRAVIS — 로드맵

> **이 문서는 WHAT(무엇을 만들지)을 정의하고, HOW(어떻게 만들지)는 개발 중에 결정합니다.**
> 테이블 스키마, 컴포넌트 비주얼, 프롬프트 문구 같은 세부 구현은 실제 개발 시점에 확정됩니다.
> 각 마일스톤의 "개발 중 결정할 사항" 섹션이 이러한 deferred decisions를 명시합니다.

## 참조 문서

- `docs/PRD.md` — 제품 요구사항, 타겟 사용자, 경쟁 포지셔닝
- `docs/ARCHITECTURE.md` — 시스템 설계, 데이터 플로우, 4개 레지스트리, 확장 패턴
- `docs/DB_SCHEMA.md` — Supabase 테이블 스키마 (개발 중 점진적으로 작성)
- `.claude/CLAUDE.md` — 프로젝트 불변 규칙 (코드 스타일, 보안, Gotchas)

## 마일스톤 개요

| 마일스톤 | 핵심 목표 | 주요 결과물 |
|---------|----------|------------|
| **M1** — Foundation + Core Loop | 자연어 → AI → 카드 렌더 E2E | Binance 단일 연결, 폴링 기반, spawn만 |
| **M2** — Realtime + Canvas + Exchange | 실시간 스트리밍 + 캔버스 자유 조작 + 4거래소 | Path A WS 인프라, 8 WS 커넥션, 저장 뷰, drill-down |
| **M3** — Complex queries + Personalization | Sonnet 복잡 쿼리 + 개인 데이터 통합 | Sonnet 라우팅, API 키, 개인 카드, 세션 복원, 뉴스 |
| **M4** — Sharing + On-chain | 외부 공유 + 온체인 데이터 | Live Signal Links, 온체인 파이프라인 |
| **M5** — Production readiness | 프로덕션 준비 | 소셜 로그인, 어드민, 모바일, 폴리시 |

---

## M1 — Foundation + Core Loop

**목표:** "자연어 입력 → AI가 의도 판단 → 캔버스에 카드 렌더" 엔드투엔드 동작.

**의존성:** 없음 (프로젝트 시작점).

### 세부 단계

#### 1.1 프로젝트 스캐폴딩
- Next.js 16 (App Router) + TypeScript strict mode 초기화
- shadcn/UI (Tailwind v4) 설치 및 초기 컴포넌트 추가
- React Flow (`@xyflow/react` 12) 설치
- Zustand 설치 (클라이언트 전용 사용 규칙 준수)
- ESLint + Prettier 설정 (`.claude/CLAUDE.md` 코드 스타일 반영)
- 기본 폴더 구조: `app/`, `components/`, `lib/`, `stores/`, `schemas/`, `registries/`
- `package.json` 스크립트: `dev`, `build`, `lint`, `type-check`
- `.gitignore`에 Next.js 특수 파일 보강
- _개발 중 결정:_ 폴더 구조 세부는 첫 컴포넌트 작성 시 자연스럽게 확정.

#### 1.2 Supabase 초기 설정
- Supabase 프로젝트 생성 (개발 + 프로덕션 인스턴스 분리)
- Auth 이메일 프로바이더 활성화
- 초기 테이블: `log_chat` (채팅 로그), `log_behavior` (행동 로그)
- **모든 사용자 테이블에 RLS 정책** (`auth.uid() = user_id`)
- Next.js용 Supabase 클라이언트 (SSR + client 변형)
- **RLS 누락 감지 CI 스크립트** — `user_*`, `log_*` 테이블에 RLS 정책이 없으면 마이그레이션 reject
- _개발 중 결정:_ `log_chat`, `log_behavior`의 정확한 컬럼 구성 (최소 `user_id`, `timestamp`, `payload` JSONB로 시작 예상).

#### 1.3 Hetzner 워커 스캐폴딩
- Hetzner VPS 프로비저닝
- Node.js/TypeScript 워커 프로젝트 설정
- **거래소 어댑터 공통 인터페이스 정의** (REST + WS 메서드 signature — WS는 스켈레톤만)
- **Binance 어댑터만 M1 구현** — spot + futures REST 폴링
  - ticker (5초 간격)
  - kline 1m/5m/1h/1d (10초 간격)
  - symbol list (1시간 간격)
- 거래소별 응답을 정규화된 공통 포맷으로 변환
- Supabase 클라이언트 (service role key) 연결
- 폴링 스케줄러 (소스별 interval 선언적 설정)
- 프로세스 매니저 (PM2 또는 systemd)
- `/health` 엔드포인트
- _개발 중 결정:_ 워커 저장소 구조 (monorepo vs 별도 repo), VPS 사양, WS 스켈레톤 구현 범위.

#### 1.4 4개 레지스트리 (TRAVIS 확장성의 뼈대)
각 레지스트리는 "항목 등록 → AI 자동 탐색" 패턴을 따릅니다. 레지스트리에 등록되면 오케스트레이터 코드 변경 없이 AI 프롬프트에 자동 주입됩니다.

- **Exchange adapter registry**: Binance 엔트리 (market types: `spot`, `futures`)
- **Datasource registry**: ticker, kline, symbol list 초기 엔트리 (스키마 + 갱신 주기 + 쿼리 파라미터)
- **Component registry**: 초기 2~3개 컴포넌트 (예: 가격 카드, kline 차트, 코인 목록 — 정확한 세트는 개발 중 결정)
- **Interaction registry**: **`spawn`만** 등록 (drill-down은 M2)
- _개발 중 결정:_ 초기 컴포넌트 세트 (M1 demo 쿼리 패턴 기반).

#### 1.5 AI 오케스트레이터 (Path C)
- Vercel API Route (예: `app/api/query/route.ts`)
- Claude API 클라이언트 (Haiku 4.5 primary)
- **시스템 프롬프트에 4개 레지스트리 내용 구조화된 텍스트로 주입**
- Zod 스키마로 AI 출력 JSON 검증
- **검증 실패 시 Zod 에러를 AI에게 feedback → 1회 재시도 → 여전히 실패하면 graceful fallback UI**
- **절대 크래시 금지** (CLAUDE.md 규칙)
- **모든 검증 실패를 Supabase에 로깅** (향후 프롬프트 개선용)
- **Sonnet 에스컬레이션 플래그만 구현** — Haiku 출력에 `complexity` 필드를 포함시켜 로그에 쌓아두되, 실제 Sonnet 호출 경로는 M3에서 추가. M3 라우팅 기준을 실증 데이터로 튜닝하기 위한 사전 준비.
- _개발 중 결정:_ 시스템 프롬프트 문구, Zod 출력 스키마 필드 구성, fallback UI 디자인.

#### 1.6 프론트엔드 코어
- React Flow 무한 2D 캔버스 (줌/팬 기본 동작)
- **커스텀 카드 노드**: 공통 컨테이너(헤더, 바디 슬롯) + 레지스트리 컴포넌트 동적 렌더
- 하단 채팅 입력 바 (placeholder 예: `"ETH 청산 카드 추가해줘"`)
- **Zustand 스토어**: `canvasStore` (nodes, viewport), `chatStore` (messages, input)
- **액션 디스패처**: `spawn` 핸들러 (캔버스에 새 카드 추가 + 데이터 구독 시작)
- Supabase Auth UI (이메일 로그인/회원가입 + 세션 관리)
- `react-error-boundary`로 Error Boundary 적용 (크래시 방지)
- 각 카드는 자체적으로 Supabase Realtime 구독 관리 (구독 중앙집중 금지)
- _개발 중 결정:_ 카드 비주얼 디자인, 캔버스 배경, 로딩/에러 상태 UI.

#### 1.7 엔드투엔드 와이어링
- 사용자 채팅 입력 → API Route → Haiku → JSON → Zod 검증 → 프론트엔드 반환
- 액션 디스패처가 JSON 파싱 → 카드 spawn → Supabase Realtime 구독 시작
- 데이터 변경 → 카드 자동 업데이트
- 채팅 로그 (`log_chat`) + 행동 로그 (`log_behavior`) 비동기 저장
- 에러 상태 (API 실패, Zod 실패, 구독 실패) 모두 fallback UI로 처리

#### 1.8 배포 + CI
- GitHub 리포지토리 생성
- GitHub Actions 워크플로우:
  - `lint` (ESLint)
  - `type-check` (`tsc --noEmit`)
  - `build` (Next.js)
  - **`rls-check`** (Supabase 스키마에서 `user_*`, `log_*` 테이블의 RLS 정책 존재 검증)
- Vercel 프로젝트 연결 → `main` 브랜치 자동 배포
- Hetzner 배포 스크립트 (수동 트리거 GitHub Action 또는 로컬 스크립트)
- 환경 변수 관리 (Vercel + Hetzner 분리, 프론트엔드에 비밀 노출 금지)

### 완료 기준

- [ ] 이메일로 회원가입 및 로그인 동작
- [ ] 최소 3가지 간단한 쿼리 패턴이 E2E로 동작 (예: "BTC 가격 보여줘", "ETH 1시간 차트", "거래량 상위 10개 코인")
- [ ] 카드가 Binance 폴링 데이터로 라이브 업데이트 (5~10초 주기)
- [ ] 채팅 기록이 Supabase에 영속화되고 재로그인 후에도 유지
- [ ] GitHub Actions CI 모두 통과 (lint, type-check, build, rls-check)
- [ ] Vercel + Hetzner 배포 성공
- [ ] Zod 검증 실패 시 재시도 후 fallback UI 표시 (크래시 없음)
- [ ] `spawn` 액션 확인 — 예: 코인 목록 카드에서 항목 클릭 → 새 가격 카드 생성

### 개발 중 결정할 사항

- `log_chat`, `log_behavior` 테이블의 정확한 컬럼 구성 (결정 시점: 1.2)
- Zod 출력 스키마 필드 및 옵셔널 처리 (결정 시점: 1.5)
- Haiku 시스템 프롬프트 전체 문구 (결정 시점: 1.5, 첫 쿼리 테스트 후 튜닝)
- 초기 컴포넌트 세트 (결정 시점: 1.4, M1 demo 쿼리 기반)
- 폴링 간격 구체값 (결정 시점: 1.3, 거래소 rate limit 확인 후)
- Fallback UI 시각적 디자인 (결정 시점: 1.6)
- Hetzner 워커 저장소 구조 (결정 시점: 1.3)

---

## M2 — Realtime + Canvas interactions + Exchange expansion

**목표:** 카드가 WebSocket 실시간 데이터로 업데이트되고, 사용자가 캔버스를 자유롭게 조작하며, 4개 거래소 모두 연결됩니다.

**의존성:** M1 완료 (4 레지스트리, 어댑터 패턴, Path B 폴링 파이프라인 동작 중).

### 세부 단계

#### 2.1 Path A — WebSocket 스트리밍 인프라
- **Hetzner WS 릴레이 서버** (프로덕션급) 구축
- 프론트엔드 WS 클라이언트 라이브러리
- Symbol 기반 sub/unsub 프로토콜 설계
- 지수 백오프 자동 재연결 (네트워크 끊김 대응)
- 거래소 WS 끊김 시 릴레이 측 자동 재연결
- 거래소별 메시지를 공통 포맷으로 정규화
- Binance WS 첫 통합 (spot + futures): ticker, orderbook, trades, kline, funding rate, liquidation
- **Path A는 Supabase를 절대 거치지 않음** — 아키텍처 rule (`.claude/CLAUDE.md`)
- _개발 중 결정:_ WS 메시지 포맷, 구독 단위 granularity.

#### 2.2 거래소 확장 (OKX, Bybit, Bitget)
- OKX 어댑터: REST + WS, spot + futures
- Bybit 어댑터: REST + WS, spot + futures
- Bitget 어댑터: REST + WS, spot + futures
- **총 4거래소 × 2마켓 = 8개 WS 커넥션**
- 모두 공통 포맷으로 정규화 (거래소별 API 차이는 어댑터가 흡수)
- 각 어댑터를 exchange adapter registry에 등록 → **AI가 오케스트레이터 코드 변경 없이 자동 탐색**
- 거래소별 rate limit 처리
- _개발 중 결정:_ 거래소별 API 특이사항 (OKX instrument 타입, Bybit unified account 등).

#### 2.3 Path B 폴링 데이터 확장
- M1 최소 세트(ticker, kline, symbol list) 외 추가 데이터 타입
  - funding rate (선물)
  - open interest (선물)
  - 24h 통계 (volume, price change, high/low)
  - taker buy/sell volume
- 각 데이터 타입에 해당하는 `_now` 테이블
- Supabase Realtime 구독 및 datasource registry 엔트리
- _개발 중 결정:_ 정확한 데이터 타입 리스트 (M1 사용 로그에서 자주 쿼리되는 것 우선).

#### 2.4 캔버스 인터랙션
- 카드 드래그 (마우스)
- 카드 리사이즈 핸들
- 카드 삭제 (헤더 X 버튼 + 단축키)
- 캔버스 팬 (빈 공간 드래그)
- 캔버스 줌 (스크롤)
- 카드 헤더 UI (제목, 닫기, 옵션 메뉴)
- 카드 포커스 상태 시각화
- _개발 중 결정:_ 멀티 셀렉트 포함 여부, 단축키 매핑.

#### 2.5 저장된 뷰 ("My views")
- `user_views` Supabase 테이블 (RLS, JSONB 레이아웃 컬럼)
- 좌측 패널 UI: 저장된 뷰 목록 (Claude/ChatGPT 사이드바 방식)
- "현재 뷰 저장" 액션 (이름 지정)
- "뷰 불러오기" 액션 — **레이아웃 복원 + 모든 카드의 라이브 데이터 재구독**
- "새 뷰" 액션 (빈 캔버스)
- 뷰 이름 변경 / 삭제
- _개발 중 결정:_ 뷰 썸네일 생성 여부.

#### 2.6 컴포넌트 & 데이터 소스 추가
- M1에서 부족했던 컴포넌트/데이터 소스를 registry 패턴으로 추가
- 추가 후보: 히트맵, 펀딩레이트 테이블, OI 차트, 청산 지도 등
- **모든 추가는 오케스트레이터 코드 변경 없이 registry 등록만으로 완료** (아키텍처 rule)
- _개발 중 결정:_ 컴포넌트 우선순위 (M1 로그에서 "이런 카드 있으면 좋겠다" 패턴 추출).

#### 2.7 Drill-down 인터랙션
- 액션 디스패처에 `drill-down` 핸들러 추가
- 카드별 back-navigation 스택 상태 관리
- 컴포넌트 registry에 `supportsDrillDown: true` 옵트인
- AI가 맥락에 따라 `spawn` vs `drill-down` 자동 선택
- 뒤로 가기 UI (카드 헤더 ← 버튼)
- _개발 중 결정:_ drill-down 지원 컴포넌트 우선순위 (예: 히트맵 → 코인 상세).

### 완료 기준

- [ ] 4개 거래소 WS 스트리밍 안정 (8 커넥션, 자동 재연결 검증)
- [ ] **Path A 데이터가 Supabase를 거치지 않음** (코드 리뷰 + 네트워크 트레이스 검증)
- [ ] 카드 드래그/리사이즈/삭제 + 캔버스 팬/줌 부드럽게 동작
- [ ] 뷰 저장 → 로그아웃 → 재로그인 → 뷰 불러오기 시 라이브 데이터 복원
- [ ] 최소 1개 컴포넌트에서 drill-down 인터랙션 동작
- [ ] M1 E2E 플로우 regression 없음
- [ ] Supabase `_now` 테이블들이 registry에 선언된 주기대로 업데이트

### 개발 중 결정할 사항

- WS sub/unsub 프로토콜 메시지 포맷 (결정 시점: 2.1)
- 2.3의 정확한 데이터 타입 리스트 (결정 시점: M1 로그 분석 후)
- 2.6의 추가 컴포넌트 세트 (결정 시점: M1 demo 피드백 후)
- 멀티 셀렉트 포함 여부 (결정 시점: 2.4)
- 뷰 썸네일 생성 여부 (결정 시점: 2.5)

---

## M3 — Complex queries + Personalization

**목표:** 크로스 거래소 비교, 다중 조건 쿼리, 개인 데이터 통합. TRAVIS가 본격적으로 "트레이더별 맞춤 워크플로우 도구"로 진화합니다.

**의존성:** M2 완료 (4거래소 어댑터, Path A/B 안정, 캔버스 인터랙션, 저장 뷰).

### 세부 단계

#### 3.1 Sonnet 라우팅 실제 구현
- Haiku 1차 패스에서 복잡도 판정 로직 (M1에서 쌓인 `complexity` 로그 분석 기반)
- 복잡 쿼리 조건 예시:
  - 다중 소스 조합 (거래소 + CoinGecko + 온체인)
  - 크로스 거래소 비교 (예: "바이낸스 선물과 Bitget 현물 둘 다 상장, Bitget 거래량 높은 코인")
  - 모호한 의도 (예: "지금 사기 좋은 코인")
- Sonnet 호출 경로 (full registries + 추가 컨텍스트)
- Sonnet 출력도 동일한 Zod 검증 + 1회 재시도 + fallback
- Sonnet 호출 빈도/비용 모니터링 로깅
- _개발 중 결정:_ 복잡도 판정 기준 (M1/M2 로그 분석 후), Sonnet 프롬프트 튜닝.

#### 3.2 사용자 거래소 API 키 통합
- `user_exchange_keys` Supabase 테이블 (암호화 컬럼 + RLS)
- **복호화는 Supabase Edge Function 단일 지점에서만** — 보안 rule
- **읽기 전용 권한 Edge Function 레벨에서 강제** — 거래소 API 호출 시 read-only 스코프 플래그
- 키 추가 UI (거래소 선택 → API key + secret 입력 → 암호화 저장)
- 키 수정 / 삭제 UI
- 키 유효성 검증 (저장 시 read-only endpoint 호출로 확인)
- **보안 감사 문서** — 키가 다루어지는 모든 경로를 명시
- _개발 중 결정:_ 암호화 방식 (Supabase Vault vs libsodium), 키 회전 전략.

#### 3.3 개인 데이터 카드
- 포지션 카드 (열린 포지션, PnL, 청산가, 레버리지)
- 잔고 카드 (계좌별 자산 분포)
- PnL 카드 (기간별 손익)
- 주문 내역 카드 (미체결 주문 + 최근 체결)
- 모든 쿼리는 Edge Function 경유 (복호화 → 거래소 API 호출 → 결과 반환)
- datasource registry에 "개인 데이터" 카테고리 추가
- component registry에 개인 데이터 컴포넌트 등록
- **거래 실행 코드 경로 0건** (grep 체크 + 코드 리뷰 + CI 스크립트 검증)
- _개발 중 결정:_ 개인 데이터 캐싱 전략 (거래소 API 호출 빈도 관리).

#### 3.4 사용자 설정
- `user_settings` 테이블 (RLS)
- 설정 항목 후보: 테마, 기본 거래소, 기본 마켓(spot/futures), 알림 설정 등
- 설정 UI 페이지
- 세션 시작 시 설정 로드하여 Zustand 초기화
- _개발 중 결정:_ 정확한 설정 항목 리스트.

#### 3.5 세션 & 채팅 기록 패널
- **우측 패널**: 현재 세션 채팅 기록 + AI 로그 (투명성/디버깅: 어떤 쿼리가 Haiku/Sonnet으로 갔는지, Zod 검증 결과)
- **좌측 패널**: 과거 세션 목록 (`log_chat` 기반, 날짜별 그룹핑)
- 과거 세션 클릭 → **캔버스 레이아웃 복원 + 라이브 데이터 재구독**
- 세션 검색 (쿼리 텍스트 기반)
- _개발 중 결정:_ AI 로그 표시 범위 (개발자 모드 토글로 숨길지).

#### 3.6 뉴스 & 외부 데이터
- 뉴스 피드 폴링 파이프라인 (소스 후보: CoinDesk, CryptoPanic, 거래소 공지)
- `_now` 테이블 + datasource registry 엔트리
- 뉴스 카드 컴포넌트 (타이틀, 요약, 원문 링크, 관련 코인 태그)
- **Tavily 웹 검색 폴백** — 희귀 쿼리(~5%)에서 레지스트리 데이터로 답할 수 없을 때 AI가 Tavily 호출 결정
- 외부 임베드 컴포넌트 (TradingView 차트 위젯, YouTube 임베드 등 — 범위 TBD)
- _개발 중 결정:_ 뉴스 피드 소스 선택 (라이선스/품질 기준), 외부 임베드 범위.

### 완료 기준

- [ ] 복잡 쿼리에서 Sonnet 라우팅 트리거 (로그로 검증)
- [ ] 크로스 거래소 쿼리가 올바른 다중 소스 카드 조합 생성
- [ ] 사용자가 API 키 추가 후 포지션/잔고/PnL 정상 표시
- [ ] **거래 실행 API 호출 코드 경로 0건** — 자동화 검증 스크립트 pass
- [ ] 과거 세션 클릭 → 캔버스 레이아웃 복원 + 라이브 데이터 재구독 성공
- [ ] 뉴스 카드 렌더 및 업데이트
- [ ] Tavily 폴백이 레지스트리 miss 시 트리거 (로그 검증)
- [ ] 사용자 설정이 세션 간 영속

### 개발 중 결정할 사항

- 복잡도 판정 기준 (결정 시점: 3.1, M1/M2 로그 분석 후)
- API 키 암호화 방식 (결정 시점: 3.2 초기)
- 개인 데이터 캐싱 전략 (결정 시점: 3.3)
- 뉴스 피드 소스 (결정 시점: 3.6)
- 외부 임베드 범위 (결정 시점: 3.6)
- AI 로그 패널 표시 범위 (결정 시점: 3.5)

---

## M4 — Sharing + On-chain + Data expansion

**목표:** 외부 공유(Live Signal Links)와 온체인 데이터 통합으로 TRAVIS의 사용 맥락 확장.

**의존성:** M3 완료 (뷰 저장/불러오기 동작, registry 확장 패턴 안정, 개인 데이터 파이프라인).

### 세부 단계

#### 4.1 Live Signal Links
- 공유 가능한 URL 생성 (뷰 ID 기반 + 서명 토큰)
- **비인증 공개 뷰 렌더링** — 로그인 없이 브라우저에서 열람 가능
- **공유 뷰에서도 실시간 데이터 계속 스트리밍** — 공개 데이터만 (Path A/B 모두 허용)
- 권한 모델:
  - 기본: read-only 공개
  - 옵션: 비밀번호 보호
  - 옵션: 만료 시간 설정
- Rate limiting (abuse 방지) — IP 기반 또는 토큰 기반
- 공유 링크 관리 UI (내가 만든 공유 링크 목록)
- _개발 중 결정:_ **PRD가 M4 진입 시 전체 UX 확정이라고 명시**. M1~M3 사용자 행동 로그를 기반으로 M4 시작 시점에 별도 디자인 스프린트를 수행한 후 세부 UX 확정.

#### 4.2 온체인 데이터
- 온체인 데이터 소스 선택 (유력 후보: Ethereum 메인넷 + L2 하나 + Bitcoin)
- 데이터 타입 후보:
  - 대형 지갑 이동 (whale alerts)
  - DEX 거래량
  - 스테이블코인 발행/소각
  - 거래소 입출금 플로우
  - 온체인 펀딩 레이트 (perpetual DEX)
- 폴링 파이프라인 → Supabase `_now` 테이블 → Realtime (Path B)
- datasource registry 엔트리
- 온체인 시각화 컴포넌트 (그래프, 지도, 타임라인)
- _개발 중 결정:_ 온체인 데이터 소스 (비용 + 신뢰성 + API 품질), 구체 체인 목록.

#### 4.3 데이터 소스 확장
- M1~M3 사용 패턴 분석 후 부족한 데이터 소스 추가
- 후보: CoinGlass (파생상품), Glassnode (온체인 지표), Fear & Greed Index, 거래소 공지 피드 등
- 모두 datasource registry를 통해 추가
- **오케스트레이터 코드 변경 0건** (registry-only 증명)
- _개발 중 결정:_ 추가 데이터 소스 우선순위 (사용 로그 기반).

### 완료 기준

- [ ] 시그널 링크 URL이 비인증 브라우저에서 열리고 라이브 데이터 표시
- [ ] 원본 사용자 로그아웃 후에도 공유 뷰 정상 동작
- [ ] 공유 링크 권한 옵션 (비밀번호/만료) 동작
- [ ] 최소 1개 온체인 데이터 소스 통합 및 컴포넌트로 렌더
- [ ] 신규 데이터 소스 추가 시 오케스트레이터 코드 변경 0건 (diff 검증)
- [ ] Rate limiting이 abuse 시도 차단 (부하 테스트 pass)

### 개발 중 결정할 사항

- Live Signal Links 전체 UX (결정 시점: M4 진입 초기 디자인 스프린트)
- 온체인 데이터 소스 선택 (결정 시점: 4.2)
- Rate limiting 알고리즘 (결정 시점: 4.1)
- 4.3의 추가 데이터 소스 우선순위 (결정 시점: 4.3)

---

## M5 — Auth hardening + Admin + Mobile + Polish

**목표:** 프로덕션 준비 완료. 보안 강화, 운영 도구, 모바일 지원, UI 완성도.

**의존성:** M4 완료 (모든 핵심 기능 동작, 사용자 로그 데이터 축적).

### 세부 단계

#### 5.1 인증 강화
- 소셜 로그인: Google (필수), GitHub, 가능하면 Apple
- Supabase Auth 프로바이더 연결
- 옵션 2FA (TOTP)
- 세션 만료 및 자동 갱신
- 계정 복구 플로우 (이메일 재설정)
- 로그아웃 시 모든 기기 세션 무효화 옵션
- _개발 중 결정:_ 2FA 강제 여부 (API 키 등록 사용자만? 전체?), 소셜 프로바이더 우선순위.

#### 5.2 어드민 페이지
- Supabase에 어드민 role 추가 + role-based RLS
- 어드민 인증 게이트 (일반 사용자 접근 차단)
- **사용자 관리**: 목록, 비활성화, 로그 조회
- **데이터 파이프라인 모니터링**: 소스별 데이터 신선도, 마지막 업데이트 시간, 에러율
- **시스템 상태**: Hetzner 워커 health, Supabase 연결, Claude API 쿼터
- **로그 분석 대시보드**: 쿼리 트렌드, 에러율, Sonnet vs Haiku 비율, Zod 실패율
- _개발 중 결정:_ 어드민 메트릭 구체 선택.

#### 5.3 모바일 반응형
- Tailwind 반응형 breakpoint 적용
- 카드 터치 드래그 (pointer events)
- 캔버스 핀치 줌 (multi-touch)
- 모바일 채팅 입력 최적화 (가상 키보드 대응 레이아웃 조정)
- 모바일 친화적 액션 디스패처 (터치 target 크기)
- 좌/우 패널을 모바일에서 bottom sheet로 전환
- _개발 중 결정:_ 모바일 UX 단순화 범위 (어떤 인터랙션을 모바일에서 숨길지).

#### 5.4 맥락 인식
- **"이거" → 포커스된 카드 resolve**: 현재 포커스 상태를 Zustand에서 추적
- **"아까 그거" → 세션 기록 기반 resolve**: `log_chat`에서 최근 카드 조회
- 세션 컨텍스트를 AI 프롬프트에 추가 주입 (현재 캔버스 카드 목록 + 최근 쿼리)
- _개발 중 결정:_ 맥락 참조 문구 확장 (영어: "this", "that one earlier" 등).

#### 5.5 성능 최적화
- 카드 virtualization (오프스크린 카드 렌더 스킵, React Flow 기능 활용)
- WS 커넥션 풀링 / 지연 구독 (보이는 카드만 구독)
- Supabase 쿼리 결과 캐싱 (stale-while-revalidate 패턴)
- Bundle 분석 + 코드 스플리팅 (동적 import for heavy components)
- 이미지/폰트 최적화 (Next.js Image, font-display)
- Lighthouse 감사 → 데스크탑 성능 score ≥ 90
- _개발 중 결정:_ 캐싱 TTL, 가상화 threshold.

#### 5.6 UI 폴리시
- 애니메이션 / 트랜지션 (Framer Motion 또는 CSS)
- Empty 상태 (첫 로그인, 빈 캔버스, 검색 결과 없음)
- Loading 상태 (skeleton, spinner)
- Error 상태 (AI 실패, 네트워크 오류, WS 끊김)
- 접근성 pass: 키보드 네비게이션, ARIA 레이블, 명도 대비 (WCAG AA)
- 최종 디자인 리뷰
- _개발 중 결정:_ 애니메이션 라이브러리 선택 (성능 vs 편의성 트레이드오프).

### 완료 기준

- [ ] 모든 소셜 프로바이더 로그인 동작
- [ ] 어드민 페이지 접근이 어드민 role로 제한 (비인가 접근 차단)
- [ ] 모바일 iOS Safari + Android Chrome 수동 테스트 pass
- [ ] "이거", "아까 그거" 맥락 참조가 올바른 카드로 resolve
- [ ] Lighthouse 데스크탑 성능 score ≥ 90
- [ ] 접근성 검사 pass (WCAG AA)
- [ ] 100개 카드 캔버스에서도 부드러운 인터랙션 (가상화 검증)
- [ ] 모든 error 상태에 적절한 fallback UI

### 개발 중 결정할 사항

- 2FA 강제 정책 (결정 시점: 5.1)
- 어드민 대시보드 메트릭 선택 (결정 시점: 5.2)
- 모바일 인터랙션 단순화 범위 (결정 시점: 5.3)
- 캐싱 TTL 값 (결정 시점: 5.5)
- 애니메이션 라이브러리 (결정 시점: 5.6)

---

## 마일스톤 간 non-negotiable 규칙

모든 마일스톤에서 다음 규칙은 절대 위반하지 않습니다 (`.claude/CLAUDE.md` 참조):

- **Path A WebSocket 스트리밍 데이터는 Supabase를 절대 거치지 않습니다** — Hetzner WS 릴레이 → 프론트엔드 직접.
- **모든 폴링 기반 데이터는 Supabase를 단일 진실 공급원으로 사용합니다** — Path B.
- **datasource / component / interaction 매핑을 오케스트레이터에 하드코딩하지 않습니다** — 반드시 registry를 통해 추가.
- **`user_*`, `log_*` 테이블은 반드시 RLS 정책을 가집니다** — CI 스크립트가 검증.
- **Zustand hook은 Server Components에서 사용하지 않습니다** (클라이언트 전용).
- **TRAVIS는 거래를 실행하지 않습니다** — 읽기 전용만 허용. M3 이후에도 유지되는 compliance boundary.
- **AI 출력은 Zod 검증 + 1회 재시도 + graceful fallback** — 크래시 금지, 모든 실패 로깅.

이 규칙 중 어느 것이라도 위반되면 해당 마일스톤은 완료로 간주하지 않습니다.
