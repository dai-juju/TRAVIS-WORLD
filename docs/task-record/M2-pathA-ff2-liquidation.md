# M2 경로 A — fast-follow #2: 청산 피드 카드 (task-record, 단일 진실)

> **🎯 상태 변경 (2026-06-28): ⏸️ 일시 정지 → 테마 "Composable Expressiveness" 로 승격.** Step 5 착수 직전, 사용자가 "컴포넌트가 데이터 종류로 하드코딩 = 내 방향 아님" 지적 → **Form↔Data 직교(모든 데이터 × 모든 형태)** 를 M2+ 중심축으로 확정(`CLAUDE.md §최상위 개발 축`). `LiquidationFeedCard` 를 일회성 데이터-잠금 카드로 만드는 것이 바로 거부된 방향이라 **Step 5/6 보류**. **이미 완료한 Step 1~4(토픽 keystone·liquidation 플립·워커 publish·`useDataServiceFeed` 훅)는 events shape 토대로 전부 재사용** — 청산은 새 테마 Architecture §8 Stage 3 의 `events` 첫 시민으로 합류. 잔여 `[10-72]`/`[10-73]` = 테마 흡수. 단일 진실(중심축) = `M2-step2-usage-feedback.md §H "Composable Expressiveness"` + `Architecture.md §8 Form↔Data 직교`. 실 step 분해 = 다음 세션 `@roadmap-milestone-manager`.
>
> **★ 재개 계획 확정 (2026-06-30, 사용자)**: composable Stage 1(Step 3+4 ✅ 커밋 `2a964bd`) 마무리(Step 5 G2) 후 본 ff#2 **재개** = `M2-composable §11` 의 "Feed form + 청산" 단계. ★ **Step 5 재정의**: 옛 `LiquidationFeedCard`(데이터-잠금 안티패턴) → **모양-제네릭 `Feed` form + 청산 descriptor 팩**(table-card 가 7 set 받듯 Feed 가 청산·뉴스·체결 등 events 받음). Step 1~4 완료분 전부 재사용, Step 6 라이브 플립 동일(경로 A WS = Realtime 부하 0). 순서: Step 5(Feed form) → Realtime throttle `[10-77]` → GenericChart/Stage 4.
>
> **(이력) 상태**: 🔄 **진행 중** (2026-06-28). **Phase A non-web 전부 ✅ + Step 4(web 피드 훅) ✅** — Step 1(자문 게이트) + 3a(토픽 keystone) + 3b(liquidation 플립) + 2(워커 publish) + **4(`useDataServiceFeed` 훅)** ✅. 전부 transport 휴면 = 화면 변화 0.
> **▶▶ /clear 후 다음 세션 첫 작업 = Step 5 (`LiquidationFeedCard` + 컴포넌트 등록 + aiCardConfig refine 일반화).** `useDataServiceFeed` 소비 + Step 1 ④ 표현(롱/숏 색·USD 정렬). `componentRegistry` + `registerCards` 양쪽 등록(파생 가드). zod 설계 = §2. 자문 nextjs-frontend(가상화)+zod(config)+security(청산 행 표시 필드 escape). **★ `[10-73]` 동반 판단**: filter forward-application(임계값 강화 시 옛 항목 잔류) — 카드가 임계값을 라이브 컨트롤로 쓰면 `filterKey?` opt-in 추가, 안정값이면 YAGNI(crypto-trader). → Step 6(Phase B 라이브: 워커 재배포+transport 플립+G2, `[10-72]` notional/COINM crypto-domain 라이브 검증 동반).
> **★ `[10-71]` ✅ 회수 (2026-06-28, Step 4 선결)**: `pnpm add -D eslint-plugin-import --filter @travis/web`(+3 deps). **web lint 첫 부팅** → 기존 잠복 `react-hooks/refs` **22건**(IndicatorCard/TickerCard 옵션 C 재연결 — ff#1 코드, lint 미부팅이라 한 번도 안 잡힘) 드러남 → **근본 수정**(렌더 중 ref.current 읽기 → "렌더 중 setState"(과거정보 보관 공식 패턴)로 전환, 타임스탬프=순수 렌더값 now). ★ 두 규칙 딜레마: ref-during-render(refs) ↔ effect-setState(set-state-in-effect) 둘 다 위반 → 제3패턴(render-phase setState)이 유일 해. 사용자 결정 "지금 같이 고침".
> **선행**: 경로 A ✅ 완료 + fast-follow #1(마크가격/펀딩) ✅ + `[10-68]` makeTopicPublisher ✅.
> **분해**: ROADMAP §경로 A fast-follow #2 (6-step, Phase A 1~5 휴면 / Phase B 6 라이브). `@roadmap-milestone-manager`.
> **단일 진실**: 본 파일. 상위 = `docs/task-record/M2-pathA-ws-direct.md`(경로 A 전체).

---

## 1. Step 1 자문 게이트 — 확정 (2026-06-27)

### 1.1 확정 사실 (crypto-domain-expert 자문, 공식 docs 근거)

| 항목 | 확정 내용 |
|---|---|
| 스트림 | `<symbol>@forceOrder`(심볼별) + `!forceOrder@arr`(전체) 둘 다 존재. **USDM·COINM 지원, spot 미지원.** 워커가 이미 둘 다 한 `forceOrderWsHandler` 로 수렴 수신 중(USDM per-symbol chunked→coalescer / COINM @arr) → 경로 A화는 한 곳만 손대면 됨. |
| side | **`SELL`=롱 청산 / `BUY`=숏 청산** (거래소가 그 포지션을 닫으려 던지는 주문 방향). 카드는 LONG/SHORT 라벨로 변환. |
| 표시 가격 | **`ap`(평균 체결가=실제 청산가)**. `p`(주문/파산가)를 청산가로 쓰면 오류. |
| 수량 | `q`(원수량) vs `z`(누적 체결수량). 실제 청산물량=`z`, 명목가 USDM=`z×ap`. |
| notional | USDM `z×ap` / COINM `q×contractSize`(dapi exchangeInfo, **하드코딩 금지·커밋 전 라이브 1콜 실측**). |
| ⚠️ under-report | `@forceOrder` 는 심볼당 **1초 최대 1건** throttle → 실제 청산의 **일부만**. allForceOrders REST 2021 폐지. **"총 청산액" 표방 금지, "sampled" 고지 필수**(안 하면 "거래소보다 왜 적지?" 오진). 버그 아닌 **구조적 한계**. |
| 위생 갭 | `forceOrderWsHandler` 가 **TRADING allowlist 미체크**(위생 #1/#2) → 경로 A 로 카드 직결 전 필터 삽입 필요(Step 2). |

> canonical-metrics.md §Liquidation 추가 초안은 crypto-domain-expert 가 제공(Step 3 에서 backend-infra 적용).

### 1.2 사용자 결정 4건 (2026-06-27)

1. **스코프 = 둘 다 (AI 자율 분기)** — 전체 tape + 심볼별. "비트 청산"→심볼별 / "청산 흐름"→전체 tape 를 AI 가 의도로 선택. TRAVIS 하드코딩 금지 원칙 부합.
   - **★ keystone 영향**: selectorKeys 가 `[market_type]`(전체)·`[market_type,symbol]`(심볼별) 둘 다 필요. 현재 buildLiveTopic 은 단일 spec·전 selectorKey 필수 → "둘 다" 표현 위해 **레지스트리 계약 확장 설계 선결**(Step 3 을 keystone 으로 앞당김).
2. **임계값 = AI 쿼리 조절** — 하드코딩 기본값 X. "$100k+ 청산만" → AI 가 notional queryableField 필터 생성. 소프트 하드코딩 기각(테마 B Q1 정합).
3. **방향 색 = 시장 영향 방향 + 텍스트 라벨** — 롱 청산=vermilion(하락 압력) / 숏 청산=teal(상승 압력) + LONG/SHORT 텍스트 병기(funding 오독 `[3-48]` 재발 방지).
4. **(scope 차단, crypto-trader 권고)** — 포지션 페르소나용 "총청산 요약 숫자 / 청산 히트맵"은 같은 forceOrder 데이터의 **별도 카드 scope** → 이번 청산 tape 에 욱여넣지 않음(M2+ 별도, roadmap-mgr 위임).

---

## 2. Step 3 토픽 계약 설계 (keystone, zod-schema-architect 2026-06-27)

"둘 다(전체 tape + 심볼별)" 를 회귀 0 으로 표현하는 계약. **채택(CTO)** — 엔지니어링 선택, 제품 결정 아님.

1. **`optionalSelectorKeys`** (후행 선택 selector 칸) 신설 — `selectorKeys`(필수, 의미 불변) 뒤에 붙음. 미선언 시 `[]` → 기존 datasource 토픽 출력 **byte-identical = 회귀 0**.
   - `buildLiveTopic`(단수, 프론트 구독): 필수 누락 → null / 선택은 첫 누락에서 break → 유효 누적 prefix. symbol 있으면 심볼 토픽 / 없으면 tape 토픽.
   - **`buildLiveTopics`**(복수, 워커 발행): required-only ~ +all-optional 누적 prefix **전부** fan-out. optionalSelectorKeys 없는 기존 datasource = 정확히 1개 배열 = 발행 거동 동일.
   - ★ 프론트 단수 토픽은 **항상** 워커 복수 fan-out 집합의 원소 → drift 구조적 불가.
2. **`subscribesByTopic`** 컴포넌트 플래그 + `[10-62]` refine 일반화 — "symbol 유무" → "단일 토픽 카드는 ds 의 모든 *필수* selectorKey 를 카드 필드로 채워야". ticker(market_type+symbol)·liquidation(market_type만, symbol optional)·리스트(면제) 한 규칙. (Step 3b 예정)
3. **신규 스키마 필드 0** — `data.symbol`(optional)/`marketType`/`filters`(notional·side)/`limit`(링버퍼 cap) 기존 칸 재사용. (Step 5)
4. **notional** queryableField(워커 enrich, 클라 `evaluateFilters` 재사용) — AI 쿼리 임계값. COINM contractSize site=DB 검증 = crypto-domain (Step 2/3b).

상세 설계 = zod 자문 원문(에이전트). 손댈 파일: `datasourceRegistry.ts`(토픽 빌더 2종)·`defaults.ts`(liquidation 엔트리+컴포넌트)·`aiCardConfig.ts`(refine 일반화)·`hooks.ts`(useDataServiceFeed).

## 3. 진행 로그

| 날짜 | Step | 결과 |
|---|---|---|
| 2026-06-27 | Step 1 | ✅ 자문 게이트 + 사용자 결정 4건 확정. |
| 2026-06-27 | Step 3 설계 | ✅ zod keystone 계약 확정(optionalSelectorKeys + buildLiveTopics + refine 일반화). |
| 2026-06-27 | Step 3a (토픽 프리미티브) | ✅ `optionalSelectorKeys` + `buildLiveTopic` 후행 append + `buildLiveTopics`(복수) + uniqueness refine. shared/worker/web type-check green + shared 60 test(+11). 회귀 0(ticker 1개 배열). |
| 2026-06-27 | Step 3b (liquidation liveTopicSpec) | ✅ **★ 중요 발견(테스트가 잡음)**: `liquidation` datasource 가 **이미 존재**(defaults.ts, table `history_futures_liquidation`, `!forceOrder@arr` WS 로 이미 수집, category `_history`). → ff#2 는 "신설"이 아니라 **ff#1 premium_index 와 동일한 "경로 A 플립"**. 기존 엔트리에 `liveTopicSpec`(prefix `binance:liquidation` + selectorKeys`[market_type]` + optionalSelectorKeys`[symbol]`) 추가, **transport 는 realtime 유지(휴면)** — Phase B(Step 6)에서 ws_direct 플립(ff#1 배포 순서 불변식). 처음 잘못 추가한 중복 엔트리는 resolveDatasourceTable 테스트가 즉시 적발 → 제거. shared 60 + web 298 test green. console.warn "realtime+liveTopicSpec" = 의도된 과도기(Phase B 소멸). 다음 = Step 2(워커 forceOrder publish + allowlist + notional enrich). |

| 2026-06-27 | Step 2 (워커 publish) | ✅ ①`makeTopicPublisher` `buildLiveTopic`→`buildLiveTopics`(fan-out, ticker/markPrice 1토픽 무회귀) ②`forceOrderWsHandler` publish 가산(insert await **전** 저지연 + TRADING allowlist 필터 = 방송만, insert 무회귀) ③worker index.ts 배선(`makeTopicPublisher(liveBus, ()=>LIQUIDATION_DATASOURCE)`). worker type-check/lint + 231 test(+11: forceOrder 10/makeTopicPublisher fan-out 1). code-reviewer 0C/1W(저지연 순서 테스트 보강)/S2(헤더 doc). **★ deferred `[10-72]`**: notional(USD) enrich + COINM 심볼 포맷 allowlist 매칭 = crypto-domain 라이브 검증(Phase B 전, S1). transport 휴면이라 화면 변화 0. |
| 2026-06-28 | `[10-71]` 선결 | ✅ `eslint-plugin-import` 설치 → web lint 첫 부팅. 잠복 `react-hooks/refs` 22건(IndicatorCard/TickerCard 옵션 C 재연결) **근본 수정**(render-phase setState + now 타임스탬프). lint 0 / type-check clean / 카드 테스트 무회귀. |
| 2026-06-28 | **Step 4 (`useDataServiceFeed` 훅)** | ✅ **신규 코어** — append-only ring buffer 이벤트 스트림 훅(`content` updateMode 첫 실사용). ➕`useDataServiceFeed.ts` + `FeedEvent{seq,arrivedAt,row}`/Options/Result 타입 + `toServiceStatus` export + 배럴. **불변식 A~F**: getSnapshot verbatim/ingestion cap O(limit, ★사용자+nextjs-frontend 결정: **개수 상한만·시간 노화 제외**=maxAgeMs 미도입)/훅 로컬 seq/재구독 clear/ws_direct 전용 휴면(경로 B 폴백 없음)/**(F) selector 값기준 메모이즈+filter ref 라이브 = 불안정 참조 무한루프 차단(Row 훅보다 강한 방어)**. ★ 라이브 발견: 인라인 selector → 무한루프 크래시 → (F) 로 해소. nextjs-frontend 자문(저사양 throttle 250ms·rAF coalescer 금지·wrapper seq·ingestion cap). 검증: web type-check/lint clean + **310 test(+12)** + code-reviewer **0C**/3W(W1 forward filter doc·W2 limit 재구독·W3 테스트 → 전부 반영)/S1~S3. transport 휴면 = 화면 변화 0. 커밋 `2870e63`(push main). 다음 = Step 5(카드). |

> **★ 설계 정정 (Step 3b 발견)**: §2 의 "신규 datasource" 가정은 틀림 — liquidation 은 기존 자산. queryableFields(side enum BUY/SELL·price·avg_price·quantity·trade_time 등) 이미 풍부. **notional(USD)·symbol queryableField 는 미보유** → Step 2 에서 워커 payload enrich + crypto-domain site=DB 검증 후 추가. 컴포넌트(LiquidationFeedCard)·refine 일반화는 Step 5(React 카드와 한 몸). 기존 엔트리가 이미 AI 노출 중이었으나 컴포넌트 부재로 refine(1) graceful 거부 = "조기 노출" 무이슈(현 상태).

> **부수 발견 (2026-06-27) → ✅ 회수 (2026-06-28)**: `pnpm -F web lint` 가 `Cannot find module 'eslint-plugin-import'`(eslint-config-next peer 누락)로 **부트스트랩 실패**였음. Step 4 선결로 `eslint-plugin-import` 설치 → 첫 부팅. **★ 부팅 직후 잠복 `react-hooks/refs` 22건(IndicatorCard/TickerCard 옵션 C, ff#1 코드)이 드러나 함께 근본 수정**(render-phase setState). 상세 = 헤더 `[10-71]` 줄 + 진행 로그 2026-06-28 행. deferred `[10-71]` 묘비.
