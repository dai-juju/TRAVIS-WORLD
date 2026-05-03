/**
 * ChatInputBar RTL 테스트 — M1.5 Step 4d (2026-04-23) 신설.
 *
 * 회수 대상 `deferred-task.md [2-7]`:
 *   수동 Playwright 로는 회귀 재현이 비쌌던 3가지 UX 불변을 vitest + RTL 로 자동화.
 *
 * 검증 시나리오:
 *   (a) loading 중 Enter 두 번 → fetch 1회만 발생 (중복 제출 방지)
 *   (b) HTTP 500 후 error 상태 → 버튼 다시 활성 + 재제출 시 fetch 가 다시 호출
 *   (c) IME `isComposing` 중 Enter → 제출 안 됨 (한글 변환 중 submit 방어)
 *
 * 격리 전략:
 *   - `dispatchOrchestrateResponse` 는 mock 으로 교체 — CanvasStore 의존성 우회.
 *   - `fetch` 는 `vi.stubGlobal` 로 대체 — 네트워크 없이 HTTP 성공/실패 시뮬.
 *   - Provider 3종 (Chat / Canvas / Toast) 으로 실 컨텍스트 주입.
 *
 * 설계 노트:
 *   ChatInputBar 의 `handleSubmit` 은 useCallback deps 에 `isLoading` 을 포함하지만
 *   deferred [2-6] 의 stale closure race 는 실측 재현이 어려워 본 테스트 범위 밖.
 *   본 테스트는 "사용자가 인지 가능한 UX 불변"만 커버 (시나리오 a 는 race 대신
 *   `disabled` attribute 기반 1차 방어선 검증).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";

import { ChatInputBar } from "../ChatInputBar";
import { ChatStoreProvider } from "@/lib/providers/ChatStoreProvider";
import { CanvasStoreProvider } from "@/lib/providers/CanvasStoreProvider";
import { ToastStoreProvider } from "@/lib/providers/ToastStoreProvider";
import { dispatchOrchestrateResponse } from "@/lib/actionDispatcher";
import { OrchestrateApiResponseSchema } from "@travis/shared";

// ─── dispatcher mock ──────────────────────────────
// 실제 dispatcher 는 canvasStore 에 addNode 연쇄 호출 — 테스트에서는 단순히
// "호출됨 + 성공 반환" 만 흉내내면 된다. CanvasStore 가 마운트되어 있어 provider
// 체인은 유지하지만 dispatcher 를 통한 상태 변이는 격리.
vi.mock("@/lib/actionDispatcher", () => ({
  dispatchOrchestrateResponse: vi.fn(() => ({
    success: true,
    addedCount: 1,
    response: { cards: [] },
  })),
}));

/**
 * M1.6 Step 5 ([3-11] 회수, 2026-05-03):
 *   기존 dispatcher mock 은 호출 횟수만 검증 — 어떤 raw 인자가 들어가는지 0건.
 *   nextjs-frontend-specialist 자문 Q6 옵션 B 채택: 호출 인자를 캡처해 별도
 *   expect 블록에서 `OrchestrateApiResponseSchema.safeParse` 로 schema 만족
 *   여부 단언. 향후 submitOrchestrate / dispatcher 시그니처가 raw 를 wrap 하거나
 *   pre-parse 형태로 변경되면 즉시 깨져 회귀 차단.
 */
const dispatcherMock = vi.mocked(dispatchOrchestrateResponse);

// ─── 공통 render 래퍼 ─────────────────────────────
function renderWithProviders(ui: ReactNode) {
  return render(
    <CanvasStoreProvider>
      <ToastStoreProvider>
        <ChatStoreProvider>{ui}</ChatStoreProvider>
      </ToastStoreProvider>
    </CanvasStoreProvider>,
  );
}

// ─── fetch mock 헬퍼 ──────────────────────────────
type FetchMock = ReturnType<typeof vi.fn>;

/**
 * /api/log-behavior 응답 (M1.6 Step 3 Substep 3d 신설). chat_submit 인스트루멘트가
 * fetch 로 호출하므로 모든 fetch mock 이 이 URL 에 대해 200 OK 반환해야 한다.
 * 본 헬퍼 호출자는 ENDPOINT 별 분기에서 활용.
 */
function logBehaviorOkResponse(): Response {
  return new Response(JSON.stringify({ ok: true, accepted: 1, total: 1 }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * `/api/orchestrate` 호출만 카운트하는 헬퍼.
 * chat_submit 의 `/api/log-behavior` fetch 가 spy 카운트를 오염시키지 않도록 분리.
 */
function orchestrateCallCount(fetchMock: FetchMock): number {
  return fetchMock.mock.calls.filter(([url]) => {
    return typeof url === "string" && url.includes("/api/orchestrate");
  }).length;
}

/** 성공 응답을 지정한 delay 후 반환. delay 동안 loading 상태가 관찰 가능. */
function mockFetchSuccessDelayed(delayMs: number): FetchMock {
  const fn = vi.fn((url: string): Promise<Response> => {
    // M1.6 Step 3 Substep 3d (2026-04-26): chat_submit 인스트루멘트가 호출.
    if (url.includes("/api/log-behavior")) {
      return Promise.resolve(logBehaviorOkResponse());
    }
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(
          new Response(
            JSON.stringify({ kind: "success", payload: { cards: [] } }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }, delayMs);
    });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

/** HTTP 500 즉시 반환 (orchestrate). log-behavior 는 200. */
function mockFetch500(): FetchMock {
  const fn = vi.fn((url: string): Promise<Response> => {
    if (url.includes("/api/log-behavior")) {
      return Promise.resolve(logBehaviorOkResponse());
    }
    return Promise.resolve(new Response("Internal Server Error", { status: 500 }));
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// ─── (a) 중복 제출 방지 ───────────────────────────

describe("ChatInputBar (a) 중복 제출 1차 방어선 — disabled attribute 검증", () => {
  // 주의: 이 테스트는 `handleSubmit` 의 `if (isLoading) return` 가드를 커버하지 않음.
  //   user-event 가 disabled input 에 key 를 주입 안 하므로 "disabled attribute
  //   가 DOM 에 도달했다" 가 실제 검증 대상. stale closure race 는 [2-6] 이월.
  it("첫 Enter 로 disabled → 두 번째 Enter 는 fetch 재호출 없음", async () => {
    const fetchMock = mockFetchSuccessDelayed(500);
    renderWithProviders(<ChatInputBar />);

    const input = screen.getByLabelText<HTMLInputElement>("AI prompt");
    const user = userEvent.setup({
      advanceTimers: vi.advanceTimersByTime,
    });

    // 1) 쿼리 입력
    await user.type(input, "Show BTCUSDT price");
    expect(input.value).toBe("Show BTCUSDT price");

    // 2) 첫 Enter — orchestrate fetch 1회 발사, input disabled 로 전환
    //    (chat_submit 의 /api/log-behavior fetch 는 별도 카운트)
    await user.keyboard("{Enter}");
    expect(orchestrateCallCount(fetchMock)).toBe(1);

    // React state flush 대기 — disabled 속성이 DOM 에 적용되는 시점
    await waitFor(() => expect(input).toBeDisabled());

    // 3) 두 번째 Enter — disabled 상태에서는 keyboard 이벤트 자체가 안 먹힘.
    //   (user-event 가 disabled input 에 key 를 주입 안 함.)
    //   이 시나리오에서는 disabled 가 1차 방어선. orchestrate fetch 재호출 0 보장.
    await user.keyboard("{Enter}");
    expect(orchestrateCallCount(fetchMock)).toBe(1);

    // 4) 500ms 경과 시뮬 — fetch resolve → input 다시 활성
    vi.advanceTimersByTime(600);
    await waitFor(() => expect(input).not.toBeDisabled());
  });
});

// ─── (b) HTTP 500 후 재활성 + 재제출 ───────────────

describe("ChatInputBar (b) HTTP 500 후 재제출 가능", () => {
  it("500 응답 → error 토스트 + 버튼 재활성 → 두 번째 제출이 fetch 를 다시 호출", async () => {
    const fetchMock = mockFetch500();
    renderWithProviders(<ChatInputBar />);

    const input = screen.getByLabelText<HTMLInputElement>("AI prompt");
    const user = userEvent.setup({
      advanceTimers: vi.advanceTimersByTime,
    });

    // 1회차 제출 → 500 → orchestrate fetch 1회
    await user.type(input, "Show BTCUSDT price");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(orchestrateCallCount(fetchMock)).toBe(1));

    // error 처리 후 input 이 다시 활성화 되어야 함
    await waitFor(() => expect(input).not.toBeDisabled());

    // chatStore.recordSubmission 이 제출 직후 input 을 "" 로 clear 하는 계약.
    //   따라서 2회차 제출 전에 재타이핑 필요. "error 후에도 재제출 가능" 을
    //   증명하는 게 목적이므로 입력 자체는 달라도 OK.
    expect(input.value).toBe("");
    await user.type(input, "Retry after 500");
    await user.keyboard("{Enter}");

    await waitFor(() => expect(orchestrateCallCount(fetchMock)).toBe(2));
  });
});

// ─── (d) dispatcher 인자 schema 회귀 가드 — [3-11] ──

describe("ChatInputBar (d) dispatcher mock shape — OrchestrateApiResponseSchema 만족 ([3-11])", () => {
  // 가치: 향후 ChatInputBar / submitOrchestrate / dispatcher 가 raw 를 wrap 하거나
  //   pre-parse 형태로 시그니처 변경하면 즉시 깨짐 — registry-derived schema
  //   refinement (M1.6 Step 4) 회귀 가드. success 와 fallback 두 variant 모두 점검.

  it("(d-1) success body → dispatcher 호출 인자가 schema PASS, kind=success", async () => {
    const fetchMock = mockFetchSuccessDelayed(0);
    renderWithProviders(<ChatInputBar />);

    const input = screen.getByLabelText<HTMLInputElement>("AI prompt");
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    await user.type(input, "Show BTCUSDT");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(orchestrateCallCount(fetchMock)).toBe(1));
    await waitFor(() => expect(dispatcherMock).toHaveBeenCalledTimes(1));

    const arg = dispatcherMock.mock.calls[0]?.[0];
    expect(arg).toBeDefined();

    const parsed = OrchestrateApiResponseSchema.safeParse(arg);
    if (!parsed.success) {
      // 디버그: 어떤 필드가 어긋났는지 즉시 보임
      console.error(
        "[(d-1)] schema fail — actual:",
        arg,
        "errors:",
        parsed.error.format(),
      );
    }
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.kind).toBe("success");
    }
  });

  it("(d-2) fallback body → dispatcher 호출 인자가 schema PASS, kind=fallback", async () => {
    const fetchMock = vi.fn((url: string): Promise<Response> => {
      if (url.includes("/api/log-behavior")) {
        return Promise.resolve(logBehaviorOkResponse());
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            kind: "fallback",
            reason: "schema_drift",
            message: "Please rephrase your question.",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(<ChatInputBar />);
    const input = screen.getByLabelText<HTMLInputElement>("AI prompt");
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    await user.type(input, "Make a bomb");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(orchestrateCallCount(fetchMock)).toBe(1));
    await waitFor(() => expect(dispatcherMock).toHaveBeenCalledTimes(1));

    const arg = dispatcherMock.mock.calls[0]?.[0];
    expect(arg).toBeDefined();

    const parsed = OrchestrateApiResponseSchema.safeParse(arg);
    if (!parsed.success) {
      console.error(
        "[(d-2)] schema fail — actual:",
        arg,
        "errors:",
        parsed.error.format(),
      );
    }
    expect(parsed.success).toBe(true);
    if (parsed.success && parsed.data.kind === "fallback") {
      expect(parsed.data.reason).toBe("schema_drift");
      expect(parsed.data.message).toMatch(/rephrase/i);
    }
  });
});

// ─── (c) IME isComposing 방어 ──────────────────────

describe("ChatInputBar (c) IME isComposing 중 Enter 무시", () => {
  it("nativeEvent.isComposing=true 인 Enter → fetch 미호출", async () => {
    const fetchMock = mockFetchSuccessDelayed(100);
    renderWithProviders(<ChatInputBar />);

    const input = screen.getByLabelText<HTMLInputElement>("AI prompt");

    // 값은 미리 채워둠 — handleSubmit 이 trim().length > 0 gate 를 통과해야
    //   isComposing 체크가 진짜 방어선임을 증명할 수 있다.
    fireEvent.change(input, { target: { value: "Show BTCUSDT price" } });
    expect(input.value).toBe("Show BTCUSDT price");

    // isComposing 상태에서 Enter — Korean/Japanese IME 조합 중 상황 시뮬.
    //   React 의 SyntheticEvent 는 nativeEvent.isComposing 을 읽는다.
    fireEvent.keyDown(input, {
      key: "Enter",
      code: "Enter",
      charCode: 13,
      keyCode: 13,
      // fireEvent 가 nativeEvent 를 래핑하며 isComposing 속성을 그대로 전달.
      isComposing: true,
    });

    // 아주 잠깐 대기 — 동기적으로 막혔는지 추가 확인 (orchestrate 호출 0).
    expect(orchestrateCallCount(fetchMock)).toBe(0);

    // sanity: 조합이 끝난 후 Enter 는 정상 제출
    fireEvent.keyDown(input, {
      key: "Enter",
      code: "Enter",
      charCode: 13,
      keyCode: 13,
      isComposing: false,
    });

    await waitFor(() => expect(orchestrateCallCount(fetchMock)).toBe(1));
  });
});
