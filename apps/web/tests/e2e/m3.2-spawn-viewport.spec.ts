/**
 * M3-step2 인터랙션 배선 회귀 테스트 (2026-07-17 정규 승격 — 사용자 결정).
 *
 * __TRAVIS_INJECT__(dev 전용)로 AI 호출 없이 actions 선언 카드를 주입해
 * 클릭 배선만 **결정적으로**(LLM 비결정성 0) 검증한다. 로컬 수동 실행 전용
 * (`pnpm -F @travis/web exec playwright test tests/e2e/m3.2-spawn-viewport.spec.ts`
 * — dev 서버 자동 기동, Supabase 실데이터 필요):
 *   A. 12연속 spawn 전부 뷰포트 안 착지 (DOM 존재 = onlyRenderVisibleElements
 *      아래에서 뷰포트 교차 증명) + "outside" 토스트 0
 *   B. 만차 → 화면 밖 배치 + "Show" 토스트 → 클릭 시 팬(줌 불변 = maxZoom 함정 회귀 감시)
 *   C. 체인: 표 행 → detail(mid) → 헤더 클릭 → chart(leaf)
 *
 * AI 자율 선언(다양성·체인 emit)은 별도 검증: Anthropic 라이브 1콜 smoke(완료) +
 * 사용자 프로덕션 체크리스트.
 */
import { test, expect, type Page } from "@playwright/test";

/** 소스 표 카드 + 체인 선언 (표 행→detail, detail 헤더→OI 차트). */
function tableWithChain(id: string, position: { x: number; y: number }) {
  return {
    id,
    componentId: "table-card",
    size: "lg",
    updateMode: "content",
    position,
    title: "G2 Top Gainers",
    data: {
      datasource: "now_futures_ticker",
      exchange: "binance",
      marketType: "futures_usdm",
      sort: { field: "price_change_pct", direction: "desc" },
      limit: 10,
    },
    actions: [
      {
        trigger: "row-click",
        type: "spawn",
        target: {
          componentId: "detail-card",
          updateMode: "value",
          data: {
            datasource: "now_futures_ticker",
            exchange: "binance",
            marketType: "futures_usdm",
          },
          actions: [
            {
              trigger: "header-click",
              type: "spawn",
              target: {
                componentId: "chart-card",
                updateMode: "value",
                data: {
                  datasource: "open_interest_history",
                  exchange: "binance",
                  marketType: "futures_usdm",
                  interval: "1h",
                },
              },
              parameterMapping: { symbol: "symbol" },
            },
          ],
        },
        parameterMapping: { symbol: "symbol" },
      },
    ],
  };
}

async function injectCard(page: Page, config: unknown): Promise<void> {
  await page.waitForFunction(
    () => typeof window.__TRAVIS_INJECT__ === "function",
    undefined,
    { timeout: 60_000 },
  );
  const ok = await page.evaluate(
    (cfg) => window.__TRAVIS_INJECT__!(cfg),
    config,
  );
  expect(ok, "__TRAVIS_INJECT__ 스키마 통과").toBe(true);
}

/** 콘솔 에러 수집 — 인증 없는 dev 세션의 무해한 401(log-behavior 등)은 제외. */
function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  const benign = /log-behavior|401|Failed to load resource|net::ERR/i;
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !benign.test(m.text())) {
      errors.push(`console: ${m.text()}`);
    }
  });
  return errors;
}

/** RF 뷰포트 transform 의 scale(zoom) 파싱. */
async function readZoom(page: Page): Promise<number> {
  return page.evaluate(() => {
    const vp = document.querySelector<HTMLElement>(".react-flow__viewport");
    const m = vp?.style.transform.match(/scale\(([\d.]+)\)/);
    return m ? Number(m[1]) : NaN;
  });
}

const firstRow = (page: Page) =>
  page.locator('[data-card-type="table-card"] tbody tr').first();
const detailCards = (page: Page) =>
  page.locator('[data-card-type="detail-card"]');
const outsideToast = (page: Page) =>
  page.getByText("outside the current view");

test.describe("A. 뷰포트 착지 (1920x1080)", () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test("12연속 spawn 전부 뷰포트 안 + outside 토스트 0 + 콘솔 에러 0", async ({
    page,
  }) => {
    const errors = trackErrors(page);
    await page.goto("/");
    await injectCard(page, tableWithChain("g2-viewport-src", { x: 40, y: 80 }));
    await expect(firstRow(page)).toBeVisible({ timeout: 30_000 });

    for (let i = 1; i <= 12; i++) {
      await firstRow(page).click();
      // DOM 존재 = onlyRenderVisibleElements 아래에서 뷰포트 교차의 증명.
      await expect(detailCards(page)).toHaveCount(i, { timeout: 5_000 });
      // 화면 밖 배치였다면 이 토스트가 5초간 떠 있다 — 클릭 직후 즉시 검사.
      expect(await outsideToast(page).count(), `click #${i} outside toast`).toBe(0);
    }
    expect(errors, errors.join("\n")).toHaveLength(0);
  });
});

test.describe("B. 만차 → Show 토스트 팬 (900x650)", () => {
  test.use({ viewport: { width: 900, height: 650 } });

  test("빈 칸 소진 시 화면 밖 배치 + Show 클릭 → 팬(줌 불변)", async ({
    page,
  }) => {
    const errors = trackErrors(page);
    await page.goto("/");
    await injectCard(page, tableWithChain("g2-full-src", { x: 12, y: 12 }));
    await expect(firstRow(page)).toBeVisible({ timeout: 30_000 });

    const zoomBefore = await readZoom(page);

    // 빈 칸이 소진될 때까지 클릭 (작은 뷰포트라 수 회 내 만차 도달).
    let sawOutside = false;
    for (let i = 0; i < 8 && !sawOutside; i++) {
      await firstRow(page).click();
      sawOutside = await outsideToast(page)
        .waitFor({ state: "visible", timeout: 2_500 })
        .then(() => true)
        .catch(() => false);
    }
    expect(sawOutside, "만차 시 outside 토스트 발생").toBe(true);

    const panBefore = await page.evaluate(
      () =>
        document.querySelector<HTMLElement>(".react-flow__viewport")?.style
          .transform ?? "",
    );
    await page.getByRole("button", { name: "Show" }).click();
    await page.waitForTimeout(800); // 300ms 팬 애니메이션 + 여유

    const zoomAfter = await readZoom(page);
    expect(zoomAfter, "Show 후 줌 불변 (maxZoom 점프 함정 회귀 감시)").toBeCloseTo(
      zoomBefore,
      5,
    );
    const panAfter = await page.evaluate(
      () =>
        document.querySelector<HTMLElement>(".react-flow__viewport")?.style
          .transform ?? "",
    );
    expect(panAfter, "Show 후 뷰포트 이동").not.toBe(panBefore);
    // 팬 도착 후 대상 카드가 뷰포트에 들어와 DOM 마운트 (컬링 해제).
    await expect(detailCards(page).last()).toBeVisible({ timeout: 5_000 });
    expect(errors, errors.join("\n")).toHaveLength(0);
  });
});

test.describe("C. 재클릭 체인 (1600x900)", () => {
  test.use({ viewport: { width: 1600, height: 900 } });

  test("표 행 → detail(mid) → 헤더 클릭 → chart(leaf) 2-hop 체인", async ({
    page,
  }) => {
    const errors = trackErrors(page);
    await page.goto("/");
    await injectCard(page, tableWithChain("g2-chain-src", { x: 40, y: 80 }));
    await expect(firstRow(page)).toBeVisible({ timeout: 30_000 });

    await firstRow(page).click();
    await expect(detailCards(page)).toHaveCount(1, { timeout: 5_000 });

    // mid 카드 헤더 = 체인 클릭 표면 — actions 관통 시 cursor-pointer 어포던스.
    const midHeader = detailCards(page).first().locator("header");
    await expect(midHeader).toHaveClass(/cursor-pointer/, { timeout: 20_000 });

    // 헤더 클릭 → leaf chart spawn (detail 데이터 로드 후 활성 — 재시도 여유).
    await midHeader.click();
    await expect(
      page.locator('[data-card-type="chart-card"]'),
    ).toHaveCount(1, { timeout: 10_000 });

    // leaf 는 말단 — spawn 클릭 표면(클릭 가능한 header/행)이 없어야 한다.
    //   주의: ChartCard 자체 UI 컨트롤(주기 선택 등)의 cursor-pointer 는 spawn
    //   표면이 아니므로 제외 — header/행 한정 판정.
    const chartSpawnSurface = await page
      .locator(
        '[data-card-type="chart-card"] header.cursor-pointer, ' +
          '[data-card-type="chart-card"] tr.cursor-pointer',
      )
      .count();
    expect(chartSpawnSurface, "leaf 카드는 spawn 클릭 표면 0 (말단)").toBe(0);
    expect(errors, errors.join("\n")).toHaveLength(0);
  });
});
