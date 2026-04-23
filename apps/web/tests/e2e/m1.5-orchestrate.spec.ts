/**
 * M1.5 Step 4 — E2E 통합 검증 spec (2026-04-23).
 *
 * 검증 목적 (ROADMAP.md §M1.5 Step 4 완료 기준):
 *   (A) 실데이터 3종 시나리오 — ticker / list / kline
 *   (B) Zod 고의 실패 → 재시도 → fallback UI, 크래시 없음 (Sub-step 4b dev flag 경로)
 *   (E) 동일 쿼리 2회 전송 → 카드 타입 동일성
 *   (F) updateMode 값(value) / 목록(content) 출력 확인 (카드 attribute 로 증명)
 *
 * 주의사항:
 *   1. 실 Haiku 4.5 API 호출 — 매 실행마다 소액 비용 발생 (호출당 $0.003~$0.007)
 *   2. LLM 비결정성 — 카드 "개수"는 보장 불가, "타입/attribute"만 assertion
 *   3. SKIP_LIVE_E2E=1 환경변수로 전체 스킵 가능 (CI / 비용 절감용)
 *   4. 실행 전 `pnpm -F @travis/web dev` 로 dev 서버 띄워두거나, Playwright 가
 *      자동 실행하도록 두기 (config.webServer.reuseExistingServer=true)
 *
 * 실행:
 *   # 1) dev 서버 수동 실행 (저사양 환경 권장)
 *   $ pnpm -F @travis/web dev   # 다른 터미널
 *   $ pnpm -F @travis/web exec playwright test tests/e2e/m1.5-orchestrate.spec.ts
 *
 *   # 2) 특정 테스트만 실행
 *   $ pnpm -F @travis/web exec playwright test -g "ticker"
 *
 *   # 3) UI 모드로 디버깅
 *   $ pnpm -F @travis/web exec playwright test --ui
 */

import { expect, test, type Page } from "@playwright/test";

// ─── Constants ──────────────────────────────────────

const CHAT_INPUT_SELECTOR = 'input[aria-label="카드 생성 프롬프트"]';
const CARD_ROOT_SELECTOR = "[data-card-type]"; // CardContainer 루트 (Step 4a 추가)

const SKIP = process.env.SKIP_LIVE_E2E === "1";

// ─── Helpers ────────────────────────────────────────

/**
 * 채팅 입력바에 쿼리를 입력하고 제출한다.
 * fetch 성공/실패와 무관하게 호출은 항상 return — assertion 은 호출자가.
 */
async function submitQuery(page: Page, query: string): Promise<void> {
  const input = page.locator(CHAT_INPUT_SELECTOR);
  await input.waitFor({ state: "visible" });
  // 기존 텍스트 제거 후 입력 (React state + IME 안전하게)
  await input.fill("");
  await input.fill(query);
  await input.press("Enter");
}

/**
 * 지정한 componentId 의 카드가 최소 `min`개 렌더될 때까지 대기.
 */
async function expectCardOfType(
  page: Page,
  componentId: string,
  min = 1,
): Promise<void> {
  const cards = page.locator(`[data-card-type="${componentId}"]`);
  await expect
    .poll(async () => cards.count(), {
      timeout: 60_000,
      message: `[data-card-type="${componentId}"] 카드가 ${min}개 이상 나타나지 않음`,
    })
    .toBeGreaterThanOrEqual(min);
}

/**
 * 페이지 콘솔 에러 중 critical 만 수집 — React dev warning / Realtime 구독
 * 재시도 경고는 제외 (실 운영에서도 종종 발생하는 transient).
 */
function collectCriticalConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (err) => {
    errors.push(`[pageerror] ${err.message}`);
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text();
      // 알려진 무해 에러 필터 (Next.js HMR / React dev / Supabase Realtime 재연결 /
      //   TradingView 임베드 또는 외부 asset 404 — 카드 동작과 무관한 누락 리소스)
      const harmless = [
        "Download the React DevTools",
        "Hydration",
        "Fast Refresh",
        "CLOSED",
        "CHANNEL_ERROR",
        "Failed to load resource",
        "status of 404",
      ];
      if (!harmless.some((h) => text.includes(h))) {
        errors.push(`[console.error] ${text.slice(0, 200)}`);
      }
    }
  });
  return errors;
}

// ─── (A) 실데이터 3종 시나리오 ─────────────────────

test.describe("M1.5 Step 4 — 완료 기준 (A) 실데이터 3종 시나리오", () => {
  test.skip(SKIP, "SKIP_LIVE_E2E=1 — live Haiku 호출 스킵");

  test("ticker — BTCUSDT price query → TickerCard + updateMode=value", async ({
    page,
  }) => {
    const errors = collectCriticalConsoleErrors(page);

    await page.goto("/");
    await submitQuery(page, "Show BTCUSDT price");

    await expectCardOfType(page, "ticker-card", 1);

    // (F) updateMode="value" — 단일 row 바인딩의 시그니처
    const ticker = page.locator('[data-card-type="ticker-card"]').first();
    await expect(ticker).toHaveAttribute("data-update-mode", "value");

    // 증거 스크린샷 — 성공 시에도 저장 (Step 4e task-record 첨부용)
    await page.screenshot({
      path: "playwright-report/evidence-A-ticker.png",
      fullPage: true,
    });

    expect(errors, `critical console errors:\n${errors.join("\n")}`).toEqual(
      [],
    );
  });

  test("list — top-volume query → CoinListCard + updateMode=content", async ({
    page,
  }) => {
    const errors = collectCriticalConsoleErrors(page);

    await page.goto("/");
    await submitQuery(page, "Top 5 coins by 24h volume");

    await expectCardOfType(page, "coin-list-card", 1);

    // (F+G) updateMode="content" — AI 가 스크리너 의도를 정확히 인식
    const list = page.locator('[data-card-type="coin-list-card"]').first();
    await expect(list).toHaveAttribute("data-update-mode", "content");

    await page.screenshot({
      path: "playwright-report/evidence-A-list.png",
      fullPage: true,
    });

    expect(errors, `critical console errors:\n${errors.join("\n")}`).toEqual(
      [],
    );
  });

  test("kline — BTCUSDT 1-minute candlestick query → KlineChartCard (TradingView iframe)", async ({
    page,
  }) => {
    const errors = collectCriticalConsoleErrors(page);

    await page.goto("/");
    await submitQuery(page, "BTCUSDT 1-minute candlestick chart");

    await expectCardOfType(page, "kline-chart-card", 1);

    // TradingView widget 은 iframe 으로 임베드되므로 그 존재만 확인.
    // 실 차트 픽셀 검증은 비결정성 높아 스코프 밖.
    const iframe = page
      .locator('[data-card-type="kline-chart-card"] iframe')
      .first();
    await expect(iframe).toBeAttached({ timeout: 30_000 });

    await page.screenshot({
      path: "playwright-report/evidence-A-kline.png",
      fullPage: true,
    });

    expect(errors, `critical console errors:\n${errors.join("\n")}`).toEqual(
      [],
    );
  });
});

// ─── (E) 동일 쿼리 2회 → 카드 타입 동일성 ──────────

test.describe("M1.5 Step 4 — 완료 기준 (E) 동일 쿼리 카드 타입 안정성", () => {
  test.skip(SKIP, "SKIP_LIVE_E2E=1 — live Haiku 호출 스킵");

  test("same ticker query twice → both cards are ticker-card (LLM nondeterminism defense)", async ({
    page,
  }) => {
    const errors = collectCriticalConsoleErrors(page);

    await page.goto("/");

    // 1st submission
    await submitQuery(page, "Show BTCUSDT price");
    await expectCardOfType(page, "ticker-card", 1);

    // wait for input to return to idle (disabled while loading)
    const input = page.locator(CHAT_INPUT_SELECTOR);
    await expect(input).toBeEnabled({ timeout: 30_000 });

    // 2nd submission — dispatcher resolves id conflicts via nonce suffix
    await submitQuery(page, "Show BTCUSDT price");
    await expectCardOfType(page, "ticker-card", 2);

    // 모든 카드가 ticker-card 타입인지 — coin-list-card/kline 섞여 나오면 실패
    const allCardTypes = await page
      .locator(CARD_ROOT_SELECTOR)
      .evaluateAll((els) =>
        els.map((el) => el.getAttribute("data-card-type") ?? "?"),
      );
    expect(
      allCardTypes.every((t) => t === "ticker-card"),
      `카드 타입 혼재 발견: ${allCardTypes.join(", ")}`,
    ).toBe(true);

    await page.screenshot({
      path: "playwright-report/evidence-E-same-query-twice.png",
      fullPage: true,
    });

    expect(errors, `critical console errors:\n${errors.join("\n")}`).toEqual(
      [],
    );
  });
});

// ─── (B) Zod 고의 실패 → fallback (Sub-step 4b 의 dev flag 경유) ──

test.describe("M1.5 Step 4 — 완료 기준 (B) 고의 실패 → fallback UI", () => {
  test.skip(SKIP, "SKIP_LIVE_E2E=1 — live Haiku 호출 스킵");

  // FORCE_INVALID_RESPONSE=true 상태에서 dev 서버가 실행 중일 때만 유효.
  // flag 가 꺼져 있으면 정상 경로로 카드가 생성되어 이 테스트는 실패한다.
  test.skip(
    process.env.FORCE_INVALID_RESPONSE !== "true",
    "FORCE_INVALID_RESPONSE=true 필요 — dev 서버를 해당 env 로 재시작 후 실행",
  );

  test("FORCE_INVALID_RESPONSE=true → Zod 2회 실패 → fallback 토스트 + 크래시 없음", async ({
    page,
  }) => {
    const errors = collectCriticalConsoleErrors(page);

    await page.goto("/");
    await submitQuery(page, "Show BTCUSDT price");

    // fallback 토스트 (route.ts 의 messageForReason("validation_exhausted"))
    // "Couldn't build a valid response. Please rephrase and try again."
    //
    // selector 정밀화 — ChatInputBar 의 sr-only aria-live announcer 도 같은
    //   문자열을 노출하므로 strict mode violation 발생. 실제 토스트 엘리먼트만
    //   targeting 하도록 sr-only 클래스 제외.
    const toast = page
      .locator("span:not(.sr-only)")
      .filter({ hasText: /Couldn't build a valid response/i });
    await expect(toast).toBeVisible({ timeout: 30_000 });

    // 카드가 하나도 생성되지 않았어야 함 (기존 카드 보존 원칙)
    const cardCount = await page.locator(CARD_ROOT_SELECTOR).count();
    expect(cardCount).toBe(0);

    await page.screenshot({
      path: "playwright-report/evidence-B-forced-invalid-fallback.png",
      fullPage: true,
    });

    // 크래시 절대 금지 — pageerror / critical console.error 0건
    expect(errors, `critical console errors:\n${errors.join("\n")}`).toEqual(
      [],
    );
  });
});
