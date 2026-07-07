# M2 사이클 1 — `[10-77]` Realtime throttle (markPrice DB write coalescing) + `[10-82]` favicon — task-record, 단일 진실

> **상태**: 🔄 **Phase A(Step 1~3) ✅ 완료 (2026-07-07)** — favicon(`a62183c`) + `MarkPriceWriteCoalescer`(60초, 사용자 확정) 구현 + code-reviewer **0 Critical**(W1 종료 경합·W2 가드 테스트·S1 status 배선 즉시 반영). worker **257 test**/type-check/lint green. **▶ 남은 것 = Step 4(dry-run — 로컬 실행 대신 테스트 카운터 대체안, 사용자 확인) + Step 5 Phase B(사용자 협업: SSH 재배포 + Supabase MCP 게이트 + Dashboard usage 관측).** 선행 = ff#2 청산 ✅ 완결(`M2-pathA-ff2-liquidation.md`). 다음 사이클 = GenericChart(`M2-composable-expressiveness.md §11` 항목 4).
> **동기**: Supabase Realtime "Message Count Exceeded" 경고 — **grace 7/22** (D-15). 현 주기 830K/5M(17%)이나 추세 상승. 주범 = `now_futures_indicator` 에 markPrice **~1초 주기 upsert** → 이 테이블 Realtime 구독 카드 전부가 markPrice churn 메시지 수신.
> **해법 (option C, 확정)**: 화면 실시간성은 경로 A WS 가 담당 → markPrice **DB 쓰기만** 30~60초 write coalescing. 경로 A publish 무접촉(체감 0).
> **분해**: `@roadmap-milestone-manager` 5-step (2026-07-07). **선결 측정**: `@backend-infra-specialist` 읽기 전용 조사 완료 (§2).

---

## 1. Step 분해 (roadmap-milestone-manager, 2026-07-07)

| Step | 내용 | 검증 기준 | 상태 |
|---|---|---|---|
| 1 | **favicon 1파일** (`apps/web/app/favicon.ico` 또는 `icon.svg`, UI-3 모노크롬) — 독립 commit | 콘솔 `favicon.ico 404` 소멸 + 탭 아이콘 표시 | 📋 |
| 2 | **측정 수용 + 설계 확정** — §2 측정 4항목 본 문서 박제 + 결정 2건 확정: (a) 윈도우 30/45/60초 (b) 구현 위치 | 결정 2건 문서 기록 | 📋 (측정 ✅, 결정 대기) |
| 3 | **`MarkPriceWriteCoalescer` 구현 + 단위 테스트** (Phase A 코드) | 테스트 3불변: ① publish 매 배치 그대로(1초) ② upsert 윈도우당 1회·심볼별 latest-wins ③ 배치 내 동일 key 집합. type-check/lint clean + 전체 테스트 무회귀 | 📋 |
| 4 | **로컬 dry-run** (8GB 저사양 주의 — worker 단독) | 로그 카운터: publish 카운트 ≫ upsert 카운트 ≈ 윈도우 배수. 에러/크래시 0 | 📋 |
| 5 | **Phase B — SSH 배포 + 라이브 게이트** (사용자 협업) | G1 재배포 후 로그 정상 / **G2 Supabase MCP**: `updated_at` 간격 = 확정 윈도우 실측 + `get_advisors` 신규 경고 0 + `get_logs` 에러 0 / **G3 후속 관측**: Dashboard usage 추세 하향(며칠) + 화면 체감 0(경로 A 1초 유지) + site=DB 일치 | 📋 |

**🚫 scope 차단선**: ① 다른 지표 폴링/쓰기 주기 변경 ❌ ② 테이블 분리/스키마 변경 ❌ ③ 경로 A publish 경로 ❌ ④ 프론트 카드/구독 로직 ❌ ⑤ 인접 유혹(`[10-80]`/`[10-84]`/`[10-79]`/`[10-81]`/GenericChart 선행) ❌ — "throttle 하는 김에" 흡수 금지.

## 2. 선결 측정 결과 (backend-infra-specialist 읽기 전용 조사, 2026-07-07)

1. **경로 추적**: chunked `<symbol>@markPrice@1s` → StreamCoalescer(1초 flush, 심볼 dedupe) → `markPriceWsHandler.handle()` → **line 110 `deps.publish?.()`(경로 A, DB 우회) / line 112-115 upsert(경로 B, DB)** 두 줄로 분기. COINM 은 `!markPrice@arr@1s` 직행(코얼레서 미경유)으로 같은 handler 합류. 현 DB 쓰기 = **초당 1 배치 ≈ 719 row-UPDATE**(usdm 689+coinm 30, row 수 기반 추정 — 구현 전 워커 로그 교차검증 권장).
2. **컬럼 소유권**: markPrice 6컬럼(1초) / perSymbolTask OI·LSR·taker·basis(~341초) / premiumIndexTask 펀딩 settled+mark/index 보완 sweep(30분). 전부 `upsertNowFuturesIndicatorPartial`(defaultToNull:false) **독립 배치** → markPrice 만 선별 throttle 시 타 컬럼 영향 **0**. premiumIndex 30분 sweep 이 throttle 의 안전망 역할.
3. **mixed-batch 불변**: normalizeMarkPrice 가 항상 동일 6키 반환(없으면 null, 키 제거 없음) → 자명 보존. 코얼레서 버퍼는 markPrice 전용으로 격리(교차 오염 구조적 불가).
4. **경로 A 안전**: publish 는 upsert **상류**에서 분기 → throttle 영향 구조적 0. ⚠️ **StreamCoalescer flushIntervalMs 올리는 방식은 금물**(publish 까지 늦춰져 경로 A 죽음 + COINM 은 코얼레서 미경유라 throttle 안 됨).
5. **설계 권고**: ➕ `apps/worker/src/ws-relay/markPriceWriteCoalescer.ts`(StreamCoalescer idiom 복제: Map latest-wins + setInterval flush + stop 최종 flush **await**) + handler deps `writeCoalescer?` **optional 가산**(미주입=기존 동작 100% = 회귀 0, `feedback_additive_optional_callback_extension`) + index.ts 배선/shutdown. 마켓별 순차 await(동시 upsert deadlock 규율).
6. **유실 경계**: 정상 종료 = 최종 flush. crash = 최대 1 윈도우분 DB 미반영(경로 A 무손실, premiumIndex 30분 sweep 회복). **updated_at 의미 재정의**: 경로 B DB 사본 신선도 1초 → 30~60초 (경로 A 카드는 1초 유지) — 완료 시 DB_SCHEMA 문서화.
7. **예상 효과**: markPrice UPDATE **30~60배 감소**(719/초 → 12~24/초 상당). 테이블 전체 Realtime 메시지 동일 배수.
8. **부수 발견 (scope 밖)**: `now_spot_ticker`/`now_futures_ticker` 가 초당 ~2,160 row-UPDATE 로 **더 큰 churn 원천 가능성** — 단 ticker 는 경로 A 플립 완료라 realtime 구독자 수 실측 필요 → **`[10-86]` 신규 등재**.

## 3. 결정 확정 (Step 2 ✅ 2026-07-07)

- **(a) 윈도우 = 60초** (사용자 확정): 절감 최대(~60배). 영향 = 경로 B 랭킹 표의 markPrice 배치 6컬럼 + AI 쿼리 DB 사본 신선도뿐(경로 A 카드 1초 유지). 체감 문제 시 상수 1개로 30초 하향 가능(G3 관측 후 판단).
- **(b) 구현 위치 = 별도 모듈** `markPriceWriteCoalescer.ts` (측정 권고안): StreamCoalescer idiom 복제 + handler `writeCoalescer?` optional 가산(미주입=기존 100% 보존).
- **★ 순위 일관성 논증 (사용자 질문, 2026-07-07)**: 랭킹 표는 순위·표시값 모두 경로 B(DB) 단일 출처 → 두 경로가 한 카드 안에서 섞이는 구조 자체가 없어 내부 모순(순위↔값 불일치) 불가. 오히려 60초 배치 flush = 전 심볼 동시 갱신이라 표의 시점 일관성은 개선(현행은 심볼별 나이 제각각). 진짜 트레이드오프 = **카드 간**(경로 A 라이브 카드 vs 표의 MARK 값 최대 60초 차) — freshness 표시가 담당, G3 실측 후 조정.

## 4. 진행 로그

| 날짜 | 내용 |
|---|---|
| 2026-07-07 | 계획 세션: 사용자 착수 확정(grace 7/22 선행) + roadmap-mgr 5-step 분해 + backend-infra 선결 측정 완료 + genagent 점검(신규 에이전트 불필요, 3 에이전트 description 보강 — nextjs 의 lightweight-charts 금지 해제[사이클 2 대비]·backend write-coalescing §4.5·zod shape 교집합 §2.5, `.claude/agents/` 로컬 전용). docs 반영 커밋 `c8cfd80` + 본 파일 신설. |
| 2026-07-07 | **Step 1 ✅** favicon `apps/web/app/icon.svg`(UI-3 모노크롬 T) 독립 커밋 `a62183c` — `[10-82]` 코드 회수(라이브 콘솔 404 소멸 확인은 다음 Vercel 배포 후). |
| 2026-07-07 | **Step 2 ✅** 결정 2건 확정(§3: 60초 / 별도 모듈) + 순위 일관성 논증 박제. |
| 2026-07-07 | **Step 3 ✅** ➕`markPriceWriteCoalescer.ts`(Map latest-wins + 60s flush + stop 최종 flush await + 마켓 순차 + retryOnTransient + 방어 try/catch) + handler `writeCoalescer?` 분기(publish 상류 무접촉) + index.ts 배선(start / shutdown: streamCoalescer.stop() 뒤 `await` stop() / 상태 로그 `MPW buffered`) + 테스트 10종(coalescer 9 + handler 1). **★ 테스트가 잡은 계약 위반**: mock 이 Result(`{success}`) 대신 reject → retryOnTransient 는 "throw 금지" 전제라 전파됨 → mock 정정 + 실코드에 방어 try/catch 1겹(interval 위 void 실행 = unhandledRejection 차단). **code-reviewer 0C/2W/3S 전부 반영**: W1(진행 중 flush × stop 겹침 시 boolean 가드가 최종 flush 삼킴 → `flushPromise` 보관 + stop=진행분 await 후 재flush, 메모리 `feedback_async_coalescer_flush_guard_shutdown` 신설) / W2(겹침 회귀 테스트 — 수동 resolve pending 재현) / S1(getStatus 상태 로그 배선) / S2(도메인 잠금 네이밍 = write-path 최적화라 정당, 2번째 소비자 등장 시 제네릭 `WriteCoalescer<T>` 승격) / S3(flush 증거 로그는 Phase B 검증 후 레벨 정리 검토 — Step 5 게이트에 메모). 검증: worker **257 test**/type-check/lint clean. |

**Step 4 대체안 (사용자 확인 대기)**: 로컬 worker 실 실행은 ① production Supabase 에 Hetzner 워커와 **이중 쓰기**(cross-process 동시 upsert = deadlock 사고 [A]의 원조 조건) ② 8GB 저사양 ③ .env secret 로딩이 필요해 **권장하지 않음**. 대체 = 이미 박제된 테스트 카운터(핸들러: publish 호출+직접 upsert 0 / 코얼레서: 창당 1 flush·latest-wins) + **Phase B 라이브에서 flush 증거 로그(`flush N rows (window 60000ms)` 창당 1줄) + MPW buffered 상태 로그**로 실측 — roadmap-mgr 의 "또는 로그 카운터로 확인" 경로.
