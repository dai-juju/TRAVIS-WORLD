# M2 경로 A — fast-follow #2: 청산 피드 카드 (task-record, 단일 진실)

> **상태**: 🔄 **진행 중** (2026-06-27 착수). Step 1(자문 게이트) ✅ 완료. 다음 = Step 3(토픽 계약, keystone) → Step 2(워커 publish) → Step 4(피드 훅) → Step 5(카드) → Step 6(라이브 G2).
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
| 2026-06-27 | Step 3a (토픽 프리미티브) | ✅ `optionalSelectorKeys` + `buildLiveTopic` 후행 append + `buildLiveTopics`(복수) + uniqueness refine. shared type-check/worker/web type-check green + shared 58 test(+9). 회귀 0(ticker 1개 배열). 다음 = 3b(liquidation 엔트리+컴포넌트+refine) → Step 2(워커 publish). |

> **부수 발견 (2026-06-27)**: `pnpm -F web lint` 가 `Cannot find module 'eslint-plugin-import'`(eslint-config-next peer 누락)로 **부트스트랩 실패** — 본 작업 무관(web 무수정), 기존 환경 문제. ff#2 Step 4(web 첫 손댐) 직전 회수 필요. deferred `[10-71]`.
