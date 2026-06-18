/**
 * CustomInstructions RTL 테스트 — M2 테마 C Step 4 Sub-step 4 (2026-06-18).
 *
 * 검증 시나리오 (사용자 확정 UIUX 불변):
 *   (a) 기본 접힘 — 마운트 직후 textarea(편집 영역)는 보이지 않는다.
 *   (b) GET 초기값 반영 — 저장값이 있으면 접힘 상태에서 1줄 프리뷰로 노출.
 *   (c) 펼침 후 타이핑 → dirty → Save 활성 (저장값과 같아지면 다시 비활성).
 *   (d) Save → PUT 응답 에코로 savedValue 갱신 → dirty 해제 + "Saved" 표시.
 *   (e) 카운터 "{n} / 800" 표시.
 *   (f) placeholder 확정 카피 노출.
 *   (g) GET 실패해도 crash 없이 폼은 사용 가능(graceful).
 *
 * 격리:
 *   - `useAuthSession` 을 mock → Provider 체인 없이 로그인 상태 주입.
 *   - `fetch` 를 vi.stubGlobal 로 대체 → 네트워크 없이 GET/PUT 시뮬.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ─── useAuthSession mock (로그인 상태 고정) ──────────────────
const useAuthSessionMock = vi.fn(() => ({
  email: "trader@example.com",
  loading: false,
  signingOut: false,
  signOut: vi.fn(),
}));

vi.mock("@/lib/providers/AuthSessionProvider", () => ({
  useAuthSession: () => useAuthSessionMock(),
}));

import { CustomInstructions } from "../CustomInstructions";

// ─── fetch mock 헬퍼 ──────────────────────────────
type FetchMock = ReturnType<typeof vi.fn>;

/** JSON 200 OK Response 헬퍼 (기존 ChatInputBar 테스트와 동일 패턴). */
function jsonOk(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/** GET /api/preferences 가 주어진 customInstructions 를 반환하도록 설정. */
function stubFetch(
  getValue: string,
  opts?: { getFails?: boolean; putFails?: boolean },
): FetchMock {
  const fetchMock = vi.fn((_url: string, init?: RequestInit): Promise<Response> => {
    const method = init?.method ?? "GET";
    if (method === "GET") {
      if (opts?.getFails) {
        return Promise.resolve(new Response("{}", { status: 500 }));
      }
      return Promise.resolve(jsonOk({ customInstructions: getValue }));
    }
    // PUT — 실패 옵션이면 500, 아니면 받은 body 를 에코.
    if (opts?.putFails) {
      return Promise.resolve(new Response("{}", { status: 500 }));
    }
    const body =
      typeof init?.body === "string"
        ? (JSON.parse(init.body) as { customInstructions?: string })
        : {};
    return Promise.resolve(
      jsonOk({ ok: true, customInstructions: body.customInstructions }),
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  useAuthSessionMock.mockReturnValue({
    email: "trader@example.com",
    loading: false,
    signingOut: false,
    signOut: vi.fn(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("CustomInstructions — 자유텍스트 프리퍼런스 폼", () => {
  // ─── (a) 기본 접힘 ───────────────────────────────────
  it("(a) 마운트 직후 편집 영역(textarea)은 접혀 있다", () => {
    stubFetch("");
    render(<CustomInstructions />);
    expect(
      screen.queryByLabelText("Custom instructions"),
    ).not.toBeInTheDocument();
    // 헤더는 보인다.
    expect(
      screen.getByRole("button", { name: /Custom Instructions/i }),
    ).toBeInTheDocument();
  });

  // ─── (b) GET 초기값 → 1줄 프리뷰 ──────────────────────
  it("(b) 저장값이 있으면 접힘 상태에서 1줄 프리뷰로 노출", async () => {
    stubFetch("Default to BTC and ETH perpetuals on 4h.");
    render(<CustomInstructions />);
    await waitFor(() =>
      expect(
        screen.getByText("Default to BTC and ETH perpetuals on 4h."),
      ).toBeInTheDocument(),
    );
  });

  // ─── (c) 타이핑 → dirty → Save 활성 ───────────────────
  it("(c) 펼친 뒤 타이핑하면 Save 가 활성되고, 저장값과 같아지면 다시 비활성", async () => {
    stubFetch("");
    const user = userEvent.setup();
    render(<CustomInstructions />);

    // 헤더 클릭 → 펼침.
    await user.click(
      screen.getByRole("button", { name: /Custom Instructions/i }),
    );
    const textarea = screen.getByLabelText("Custom instructions");

    // 초기(빈 값) — Save 비활성.
    const saveBtn = screen.getByRole("button", { name: /^Save/i });
    expect(saveBtn).toBeDisabled();

    // 타이핑 → dirty → 활성.
    await user.type(textarea, "Prefer USDT pairs");
    expect(saveBtn).toBeEnabled();

    // 전부 지워 저장값(빈 문자열)과 같아지면 다시 비활성.
    await user.clear(textarea);
    expect(saveBtn).toBeDisabled();
  });

  // ─── (d) Save → 에코로 savedValue 갱신 → dirty 해제 + "Saved" ──
  it("(d) Save 후 PUT 응답 에코로 dirty 해제 + Saved 표시", async () => {
    const fetchMock = stubFetch("");
    const user = userEvent.setup();
    render(<CustomInstructions />);

    await user.click(
      screen.getByRole("button", { name: /Custom Instructions/i }),
    );
    const textarea = screen.getByLabelText("Custom instructions");
    await user.type(textarea, "Always show funding next to price.");

    const saveBtn = screen.getByRole("button", { name: /^Save/i });
    await user.click(saveBtn);

    // PUT 호출됐는지.
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/preferences",
        expect.objectContaining({ method: "PUT" }),
      ),
    );
    // 에코 후 dirty 해제 → Save 비활성 + "Saved" 표시.
    await waitFor(() => expect(saveBtn).toBeDisabled());
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });

  // ─── (e) 카운터 ──────────────────────────────────────
  it("(e) 카운터 '{n} / 800' 을 표시한다", async () => {
    stubFetch("BTC");
    const user = userEvent.setup();
    render(<CustomInstructions />);
    // GET 초기값 도착 대기.
    await waitFor(() =>
      expect(screen.getByText("BTC")).toBeInTheDocument(),
    );
    await user.click(
      screen.getByRole("button", { name: /Custom Instructions/i }),
    );
    expect(screen.getByText("3 / 800")).toBeInTheDocument();
  });

  // ─── (f) placeholder ─────────────────────────────────
  it("(f) 확정 placeholder 카피를 노출한다", async () => {
    stubFetch("");
    const user = userEvent.setup();
    render(<CustomInstructions />);
    await user.click(
      screen.getByRole("button", { name: /Custom Instructions/i }),
    );
    const textarea = screen.getByLabelText("Custom instructions");
    expect(textarea).toHaveAttribute(
      "placeholder",
      expect.stringContaining("Default to BTC and ETH perpetuals on 4h."),
    );
  });

  // ─── (g) GET 실패 graceful ───────────────────────────
  it("(g) GET 실패해도 crash 없이 폼은 편집 가능", async () => {
    stubFetch("", { getFails: true });
    const user = userEvent.setup();
    render(<CustomInstructions />);

    // 헤더는 여전히 동작.
    await user.click(
      screen.getByRole("button", { name: /Custom Instructions/i }),
    );
    const textarea = screen.getByLabelText("Custom instructions");
    await user.type(textarea, "Skip low-volume coins");
    expect(screen.getByRole("button", { name: /^Save/i })).toBeEnabled();
  });

  // ─── (h) 비로그인 안내 ───────────────────────────────
  it("(h) 비로그인이면 Sign in 안내만 노출", () => {
    useAuthSessionMock.mockReturnValue({
      email: null as unknown as string,
      loading: false,
      signingOut: false,
      signOut: vi.fn(),
    });
    stubFetch("");
    render(<CustomInstructions />);
    expect(
      screen.getByText(/Sign in to set custom instructions/i),
    ).toBeInTheDocument();
  });

  // ─── (i) PUT 실패 graceful — 에러 안내 + Save 재활성(재시도) ──
  it("(i) Save 실패 시 에러 안내 노출 + dirty 유지로 Save 재활성", async () => {
    stubFetch("", { putFails: true });
    const user = userEvent.setup();
    render(<CustomInstructions />);

    await user.click(
      screen.getByRole("button", { name: /Custom Instructions/i }),
    );
    const textarea = screen.getByLabelText("Custom instructions");
    await user.type(textarea, "Prefer USDT pairs");

    const saveBtn = screen.getByRole("button", { name: /^Save/i });
    await user.click(saveBtn);

    // 에러 notice 노출 + 저장 안 됐으니 dirty 유지 → Save 여전히 활성(재시도 가능).
    await waitFor(() =>
      expect(screen.getByText(/Couldn.t save/i)).toBeInTheDocument(),
    );
    expect(saveBtn).toBeEnabled();
  });
});
