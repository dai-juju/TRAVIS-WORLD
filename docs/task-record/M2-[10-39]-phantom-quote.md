# M2 [10-39] phantom 'U' 심볼 — 결함 아님 종결 (task-record)

> **상태**: ✅ **종결 (2026-06-15, "데이터 결함 아님" 판명 + 사용자 결정으로 'U' 유지)**. **코드 수정 0건.**
> **단일 진실**: 본 파일.
> **발견 맥락**: `[10-33]` "모든 코인 보기" baseline 조사(`M2-[10-33]-all-coins.md` Step 0)에서 `now_spot_ticker.quote_asset='U'` 43건 발견 → phantom 의심.
> **세션 위치**: 본 작업 = 다음 개발 계획(`~/.claude/plans/steady-petting-hellman.md`)의 **Phase 0** (테마 C 착수 전 clean-slate 선행). Phase 0 종료 → `/clear` → 다음 세션 Phase 1(테마 C).

---

## 0. 한 줄 요약 (비전공자용)

> **"`BTCU` 같은 결제통화 'U' 페어 43건이 전체보기에 떠서 '존재하지 않는 심볼 = 파이프라인 버그' 로 의심했으나, 조사 결과 'U'는 Binance 가 실제 운영하는 **달러 스테이블코인 결제통화**. 버그도 stale 도 아닌 정상 데이터였다. 사용자(트레이더)가 직접 거래소 사이트에서 확인 후 '유지' 결정 → 수정 없이 종결."**

---

## 1. 조사 (Step 0-A)

### 1.1 사전 de-risk (코드 경로 실측, 2026-06-15)
'U'는 **문자열 파싱 버그가 아님**을 코드로 먼저 제거:
- `apps/worker/src/adapters/binance/normalize.ts:90` — symbols 마스터 `quote_asset = raw.quoteAsset` (Binance exchangeInfo 권위 필드 직접 사용, 파싱 X).
- `apps/worker/src/ws-relay/streams/tickerWsHandler.ts:263,301` — now_*_ticker `quote_asset = quoteAssetBySymbol` lookup 맵 (symbols 마스터에서 생성, 파싱 X).
→ TRAVIS 가 심볼 문자열을 split 해서 'U' 를 만든 게 아님(예: AAVEU→'U' 같은 절단 불가).

### 1.2 DB 실측 (Supabase MCP read-only, 2026-06-15)
`now_spot_ticker WHERE quote_asset='U'` + symbols 마스터 LEFT JOIN:
- **43건 전부 fresh** — `updated_at` age 전부 30초 미만(BTCU 0.9초). 실시간 갱신 중 → **stale 아님(ⓑ 기각)**.
- **43건 전부 symbols 마스터에 존재** + `quote_asset='U'`, `status='TRADING'`, `market_type='spot'`, `exchange='binance'`.
- 패턴 `{BASE}U`: BTCU/ETHU/SOLU/BNBU/XRPU/DOGEU/ADAU/AVAXU/LINKU/.../**币安人生U**(중국어 base) 등.

### 1.3 crypto-domain-expert 규명 (라이브 exchangeInfo, 2026-06-15)
- `GET /api/v3/exchangeInfo` 라이브 — `BTCU`/`ETHU`/`币安人生U` 등 `quoteAsset="U"` **실재 확인**. TRAVIS 버그 아님 재확인.
- ⚠️ 단 **"분리 세그먼트 → 제외" 로 over-conservative 권고** — 근거: `币安人生U` 24h 거래 41건(thin) + 비크립토 base 혼재. **본인도 "U 정체 공지 못 찾음 = 미확정" 단서를 달았음에도 제외를 권고**(판정 결함).

---

## 2. 🛑 체크포인트 → 사용자 결정 (Step 0-A→0-B)

계획서 규율대로 처리 방법을 자동 결정하지 않고 보고 + 질문:
- crypto-domain/crypto-trader "제외" 권고를 보고하며 처리 범위(U만 / 비표준 quote 전반 / 표시 필터) 질문.
- **★ 사용자 실거래소 확인 (도메인 전문가 판단)**: *"U 페어는 달러 스테이블코인. 직접 바이낸스 거래소 가보니 실제로 있다. 없애면 안 된다."*
- **데이터 정합이 사용자 판단을 뒷받침**: `BTCU`=65,554 ≈ BTCUSDT가 / `ETHU`=1,721 ≈ ETHUSDT가 / `USD1U`=1.0·`RLUSDU`=1.0001(스테이블/스테이블 ≈1.0) → U ≈ 1달러 스테이블 quote.
- **결정**: 'U' **유지**, `[10-39]` = **1번 "결함 아님으로 종결"** (수정 0).

---

## 3. 판정 + 종결 (Step 0-B)

- **`[10-39]` 재분류**: "데이터 결함" 아님 → **정상 스테이블 quote 를 전체보기가 드러낸 것**.
- 메모리 `feedback_new_card_surfaces_latent_data_defect` 의 **반례** — 새 표시가 드러낸 게 항상 버그는 아니며, 이번엔 정상 데이터였음.
- **코드 수정 0건**: 'U' 는 이미 `quote_asset='U'` 로 정상 저장·필터(테마 B pushdown 경로)되고 있어, 제외하지 않는 한 손댈 것이 없음. CLAUDE.md 데이터 위생 #1(in-place allowlist, 하드 삭제 지양)에도 부합.

---

## 4. 부수 산출 — 서브에이전트 원칙 강화 (사용자 지시 2026-06-15)

사용자가 본 사건을 계기로 도메인/데이터 검증 에이전트에 **두 원칙 영구 명문화**를 지시 → `@genagent` 위임:
1. **사이트 = 데이터 일치** (위생 #9 의 행동 규율화): 유저가 실제 보는 거래소 **웹사이트 화면** 과 DB/카드/판정이 일치. "글로벌 API 반환 ≠ 유저가 사이트에서 봄"(분리/regional 페어가 글로벌 API 에만 섞여 옴).
2. **답변 전 실사이트 직접 확인**: 공식문서·API·announcement **추정에 그치지 말고** 실제 거래소 사이트(WebFetch/라이브) 직접 확인 후 답변. **미확정이면 제외/삭제 단정 금지 → 사용자 실측 요청.**

변경 파일(genagent):
- `.claude/agents/crypto-domain-expert.md` (강): description + §2 Citation Contract 4번 + §2.2(두 원칙)/§2.3(⛔ over-conservative 제외 가드)/§2.4([10-39] 사례 박제) 신설 + §11 Never Do.
- `.claude/agents/backend-infra-specialist.md` (경량): §3.2 "Global API ≠ 사이트" 한 단락.
- `.claude/agents/crypto-trader.md` (경량): §4.2 playwright 불일치 포착 항목.
- `.claude/agent-memory/genagent/DECISIONS.md` 로그 1건.
- ⚠️ 적용 = 세션 재시작/`/agents` 리로드 후.

---

## 5. 교훈

- **AI 도메인 자문이 잘못된 표면(글로벌 API + announcement)을 보고 over-conservative 하게 틀림 → 사용자 실거래소 확인이 정정.** CLAUDE.md `feedback_ask_before_assume` + "크립토 도메인은 사용자가 더 잘 안다" 원칙의 실증.
- **"글로벌 API 가 반환한다" ≠ "유저가 사이트에서 본다"** — 분리 마켓/regional 페어 비대칭(`feedback_quote_volume_unit_trap` 과 같은 뿌리).
- **미확정인데 제외 단정 = 위험** — 데이터를 지우는 권고는 실사이트 확인 + (불확실 시) 사용자 질문이 선행돼야.

---

## 6. 잔여 (선택, deferred 후보 — 지금 안 함)

- **'U' 의 정확한 스테이블 정체**(어떤 프로젝트/상품의 1달러 토큰인지) 미규명 — 필요 시 후속(`@crypto-domain-expert` Binance capital config). 사용자 1번 선택(최소 종결)이라 보류.
- **글로벌 사용자 'U' 라벨 명확화**(카드 kicker 에 quote 명시 등) — 테마 C UI 작업 또는 별도. crypto-trader 가 짚은 "BTCU? U가 뭐지?" 인지 부하 대비. 지금은 미실행.

---

## 7. 검증

- `now_spot_ticker WHERE quote_asset='U'` → **유지(정상 데이터)**, 라이브 카운트 회귀 0(449 USDT / 1,447 spot 불변).
- 코드 수정 0 → 빌드/테스트 영향 없음.
- 회수 deferred: `[10-39]` 묘비("결함 아님 종결").
