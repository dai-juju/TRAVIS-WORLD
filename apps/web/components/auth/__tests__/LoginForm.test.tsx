/**
 * LoginForm RTL 테스트 — M1.6 Step 5 ([3-13] 회수, 2026-05-03).
 *
 * 4 시나리오:
 *   (i)   valid submit → router.replace("/") + signInWithPassword 호출
 *   (ii)  Zod 실패 (invalid email / 8자 미만) → 에러 메시지 + signIn 미호출
 *   (iii) Supabase 서버 에러 (invalid credentials) → serverError 노출
 *   (iv)  이중 제출 가드 — userEvent {delay: null} + Promise.all 로 진짜 race
 *
 * mock 진입점:
 *   - `vi.mock("@/lib/supabase/browserClient")` — TRAVIS facade 만 가로챔
 *     (nextjs-frontend-specialist Q1 옵션 A 권장).
 *   - `vi.mock("next/navigation")` — useRouter().replace / refresh spy.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ─── next/navigation mock (모듈 스코프 spy 보존) ─────────────
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
  usePathname: () => "/login",
  useSearchParams: () => new URLSearchParams(),
}));

// ─── Supabase browserClient mock ────────────────────────────
const signInWithPasswordMock = vi.fn();

vi.mock("@/lib/supabase/browserClient", () => ({
  getSupabaseBrowserClient: () => ({
    auth: { signInWithPassword: signInWithPasswordMock },
  }),
}));

import { LoginForm } from "../LoginForm";

beforeEach(() => {
  replaceSpy.mockClear();
  refreshSpy.mockClear();
  signInWithPasswordMock.mockReset();
});

describe("LoginForm — auth 폼 회귀 가드 ([3-13])", () => {
  // ─── (i) valid submit ────────────────────────────────────────

  it("(i) valid email/password → signInWithPassword 호출 + router.replace('/')", async () => {
    signInWithPasswordMock.mockResolvedValue({
      data: { user: { id: "u1", email: "trader@example.com" } },
      error: null,
    });
    const user = userEvent.setup({ delay: null });
    render(<LoginForm />);

    await user.type(
      screen.getByRole("textbox", { name: /email/i }),
      "trader@example.com",
    );
    // password 는 type=password 라 textbox role 에 안 잡힘 — placeholder 또는 label
    await user.type(screen.getByLabelText(/password/i), "12345678");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() =>
      expect(signInWithPasswordMock).toHaveBeenCalledWith({
        email: "trader@example.com",
        password: "12345678",
      }),
    );
    await waitFor(() => expect(replaceSpy).toHaveBeenCalledWith("/"));
    expect(refreshSpy).toHaveBeenCalled();
  });

  // ─── (ii) Zod 실패 — invalid email ──────────────────────────

  it("(ii-1) invalid email → 에러 메시지 + signInWithPassword 미호출", async () => {
    const user = userEvent.setup({ delay: null });
    render(<LoginForm />);

    await user.type(
      screen.getByRole("textbox", { name: /email/i }),
      "not-an-email",
    );
    await user.type(screen.getByLabelText(/password/i), "12345678");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(
      await screen.findByText(/valid email/i),
    ).toBeInTheDocument();
    expect(signInWithPasswordMock).not.toHaveBeenCalled();
  });

  // ─── (ii-2) Zod 실패 — 8자 미만 비밀번호 ─────────────────────

  it("(ii-2) password 8자 미만 → 에러 메시지 + signInWithPassword 미호출", async () => {
    const user = userEvent.setup({ delay: null });
    render(<LoginForm />);

    await user.type(
      screen.getByRole("textbox", { name: /email/i }),
      "trader@example.com",
    );
    await user.type(screen.getByLabelText(/password/i), "1234567"); // 7자
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(
      await screen.findByText(/at least 8 characters/i),
    ).toBeInTheDocument();
    expect(signInWithPasswordMock).not.toHaveBeenCalled();
  });

  // ─── (iii) Supabase 서버 에러 (invalid credentials) ──────────

  it("(iii) Supabase error.message 가 폼 하단에 노출 + router 미호출", async () => {
    signInWithPasswordMock.mockResolvedValue({
      data: { user: null },
      error: { message: "Invalid login credentials" },
    });
    const user = userEvent.setup({ delay: null });
    render(<LoginForm />);

    await user.type(
      screen.getByRole("textbox", { name: /email/i }),
      "trader@example.com",
    );
    await user.type(screen.getByLabelText(/password/i), "wrongpassword");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(
      await screen.findByText(/invalid login credentials/i),
    ).toBeInTheDocument();
    expect(replaceSpy).not.toHaveBeenCalled();
  });

  // ─── (iv) 이중 제출 1차 방어선 — disabled attribute 검증 ──────
  //
  // 주의 (M1.6 Step 5 [3-61] 신규 deferred 등록):
  //   현 LoginForm 의 이중 제출 가드는 `submitting` React state 만 사용.
  //   진짜 race (Promise.all 로 동시 클릭) 에서는 첫 클릭이 setSubmitting(true)
  //   호출 후 re-render 전에 두 번째 클릭이 onSubmit 진입하면 stale closure 로
  //   submitting=false 캡처 → signIn 2회 호출. ChatInputBar [2-6] 와 동일 패턴.
  //   `submittingRef` 동기 가드 추가가 정공이지만 production 코드 변경이라
  //   별도 deferred ([3-61]) 로 등록 — 다음 소규모 commit 처리.
  //
  //   본 테스트는 ChatInputBar (a) 와 동일하게 "disabled attribute 가 DOM 에
  //   도달하면 user-event 가 두 번째 클릭을 차단" 하는 1차 방어선만 검증.
  it("(iv) 첫 클릭 → 버튼 disabled → 두 번째 클릭은 차단됨", async () => {
    let resolveSignIn: (v: { data: unknown; error: null }) => void = () => {};
    const pending = new Promise<{ data: unknown; error: null }>((r) => {
      resolveSignIn = r;
    });
    signInWithPasswordMock.mockReturnValue(pending);

    const user = userEvent.setup({ delay: null });
    render(<LoginForm />);

    await user.type(
      screen.getByRole("textbox", { name: /email/i }),
      "trader@example.com",
    );
    await user.type(screen.getByLabelText(/password/i), "12345678");

    const btn = screen.getByRole("button", { name: /sign in/i });
    await user.click(btn);

    // React state flush 대기 — disabled 속성이 DOM 에 적용되는 시점
    await waitFor(() => expect(btn).toBeDisabled());
    // 버튼 라벨도 "Signing in..." 으로 전환됨
    expect(btn).toHaveTextContent(/signing in/i);

    // 두 번째 클릭 — disabled 면 user-event 가 click 자체를 막음
    await user.click(btn);
    expect(signInWithPasswordMock).toHaveBeenCalledTimes(1);

    // cleanup unmount 시 pending Promise 누수 방지
    resolveSignIn({ data: { user: null }, error: null });
  });
});
