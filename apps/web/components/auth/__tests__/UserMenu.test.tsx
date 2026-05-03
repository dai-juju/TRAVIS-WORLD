/**
 * UserMenu RTL 테스트 — M1.6 Step 5 ([3-13] + [3-12] 회수, 2026-05-03).
 *
 * 4 시나리오:
 *   (i)   getUser 가 user.email 반환 → 화면에 이메일 + Log out 버튼 표시
 *   (ii)  Log out 클릭 → signOut 호출 + router.replace("/login")
 *   (iii) [3-12] loading flicker fix — onAuthStateChange sync emit 직후 즉시
 *         loading 해제 (setLoading(false) 가 callback 안에서 호출되는지)
 *   (iv)  unmount 시 subscription.unsubscribe() 호출 (메모리 누수 차단)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ─── next/navigation mock ───────────────────────────────────
const replaceSpy = vi.fn();
const refreshSpy = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: replaceSpy,
    refresh: refreshSpy,
    push: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

// ─── Supabase browserClient mock ────────────────────────────
const getUserMock = vi.fn();
const signOutMock = vi.fn();
const onAuthStateChangeMock = vi.fn();
const unsubscribeMock = vi.fn();

vi.mock("@/lib/supabase/browserClient", () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      getUser: getUserMock,
      signOut: signOutMock,
      onAuthStateChange: onAuthStateChangeMock,
    },
  }),
}));

import { UserMenu } from "../UserMenu";

beforeEach(() => {
  replaceSpy.mockClear();
  refreshSpy.mockClear();
  getUserMock.mockReset();
  signOutMock.mockReset();
  onAuthStateChangeMock.mockReset();
  unsubscribeMock.mockClear();

  // default: subscription 객체 — 모든 시나리오에서 onAuthStateChange 가 호출됨.
  onAuthStateChangeMock.mockReturnValue({
    data: { subscription: { unsubscribe: unsubscribeMock } },
  });
});

describe("UserMenu — auth 메뉴 회귀 가드 ([3-13] + [3-12])", () => {
  // ─── (i) email 표시 ──────────────────────────────────────────

  it("(i) getUser 가 user.email 반환 → 이메일 + Log out 버튼 표시", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: "u1", email: "trader@example.com" } },
      error: null,
    });

    render(<UserMenu />);

    expect(
      await screen.findByText("trader@example.com"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /log out/i }),
    ).toBeInTheDocument();
  });

  // ─── (ii) Log out 클릭 → router.replace ───────────────────────

  it("(ii) Log out 클릭 → signOut 호출 + router.replace('/login')", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: "u1", email: "trader@example.com" } },
      error: null,
    });
    signOutMock.mockResolvedValue({ error: null });

    const user = userEvent.setup({ delay: null });
    render(<UserMenu />);

    await screen.findByText("trader@example.com");
    await user.click(screen.getByRole("button", { name: /log out/i }));

    await waitFor(() => expect(signOutMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(replaceSpy).toHaveBeenCalledWith("/login"));
    expect(refreshSpy).toHaveBeenCalled();
  });

  // ─── (iii) [3-12] loading flicker fix ─────────────────────────

  it("(iii) onAuthStateChange callback 이 setLoading(false) 호출 → loading flicker 해제", async () => {
    // getUser 는 영원히 pending — getUser 경로로는 loading 절대 풀리지 않음.
    // 그럼에도 onAuthStateChange callback 이 sync emit 시 loading 해제하면
    // 컴포넌트가 빈 화면(null) 대신 적절한 UI 를 렌더한다.
    getUserMock.mockReturnValue(new Promise(() => {})); // never resolves

    // listener 캡처용 — onAuthStateChange 가 호출될 때 callback 을 보관.
    let capturedCallback:
      | ((event: string, session: unknown) => void)
      | null = null;
    onAuthStateChangeMock.mockImplementation(
      (cb: (event: string, session: unknown) => void) => {
        capturedCallback = cb;
        return { data: { subscription: { unsubscribe: unsubscribeMock } } };
      },
    );

    render(<UserMenu />);

    // 마운트 직후엔 loading=true → null 렌더 (Sign in / 이메일 둘 다 없음)
    expect(screen.queryByText(/sign in/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /log out/i })).not.toBeInTheDocument();

    // listener 가 등록됐는지 확인 후 sync emit 시뮬
    await waitFor(() => expect(capturedCallback).not.toBeNull());

    // INITIAL_SESSION (session=null) 을 sync emit — getUser 가 영원히 pending
    // 이지만 [3-12] fix 로 loading 즉시 해제 → "Sign in" 링크 노출.
    act(() => {
      capturedCallback?.("INITIAL_SESSION", null);
    });

    expect(
      await screen.findByRole("link", { name: /sign in/i }),
    ).toBeInTheDocument();
  });

  // ─── (iv) unmount → unsubscribe ───────────────────────────────

  it("(iv) unmount 시 subscription.unsubscribe() 호출", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: "u1", email: "trader@example.com" } },
      error: null,
    });

    const { unmount } = render(<UserMenu />);
    await screen.findByText("trader@example.com");

    unmount();

    expect(unsubscribeMock).toHaveBeenCalledTimes(1);
  });
});
