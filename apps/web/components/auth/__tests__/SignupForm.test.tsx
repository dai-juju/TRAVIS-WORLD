/**
 * SignupForm RTL 테스트 — M1.6 Step 5 ([3-13] 회수, 2026-05-03).
 *
 * 5 시나리오:
 *   (i)   valid + session 있음 → router.replace("/")
 *   (ii)  Zod 실패 (invalid email / 8자 미만 비밀번호 — 사례 1건)
 *   (iii) Supabase 서버 에러 (이미 가입된 이메일 등) → serverError 노출
 *   (iv)  이중 제출 가드
 *   (v)   data.session === null → "Check your email to confirm" 메시지 노출
 *
 * 구조는 LoginForm 과 평행하지만 (v) email confirmation 분기는 SignupForm 만의 책임.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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
  usePathname: () => "/signup",
  useSearchParams: () => new URLSearchParams(),
}));

const signUpMock = vi.fn();

vi.mock("@/lib/supabase/browserClient", () => ({
  getSupabaseBrowserClient: () => ({
    auth: { signUp: signUpMock },
  }),
}));

import { SignupForm } from "../SignupForm";

beforeEach(() => {
  replaceSpy.mockClear();
  refreshSpy.mockClear();
  signUpMock.mockReset();
});

describe("SignupForm — auth 폼 회귀 가드 ([3-13])", () => {
  // ─── (i) valid + session ──────────────────────────────────────

  it("(i) valid signup + session 있음 → router.replace('/')", async () => {
    signUpMock.mockResolvedValue({
      data: {
        user: { id: "u1", email: "trader@example.com" },
        session: { access_token: "tk_fake" },
      },
      error: null,
    });
    const user = userEvent.setup({ delay: null });
    render(<SignupForm />);

    await user.type(
      screen.getByRole("textbox", { name: /email/i }),
      "trader@example.com",
    );
    await user.type(screen.getByLabelText(/password/i), "12345678");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() =>
      expect(signUpMock).toHaveBeenCalledWith({
        email: "trader@example.com",
        password: "12345678",
      }),
    );
    await waitFor(() => expect(replaceSpy).toHaveBeenCalledWith("/"));
    expect(refreshSpy).toHaveBeenCalled();
  });

  // ─── (ii) Zod 실패 ────────────────────────────────────────────

  it("(ii) password 8자 미만 → 에러 메시지 + signUp 미호출", async () => {
    const user = userEvent.setup({ delay: null });
    render(<SignupForm />);

    await user.type(
      screen.getByRole("textbox", { name: /email/i }),
      "trader@example.com",
    );
    await user.type(screen.getByLabelText(/password/i), "short");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(
      await screen.findByText(/at least 8 characters/i),
    ).toBeInTheDocument();
    expect(signUpMock).not.toHaveBeenCalled();
  });

  // ─── (iii) Supabase 서버 에러 ─────────────────────────────────

  it("(iii) 이미 가입된 이메일 → serverError 노출, router 미호출", async () => {
    signUpMock.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "User already registered" },
    });
    const user = userEvent.setup({ delay: null });
    render(<SignupForm />);

    await user.type(
      screen.getByRole("textbox", { name: /email/i }),
      "trader@example.com",
    );
    await user.type(screen.getByLabelText(/password/i), "12345678");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(
      await screen.findByText(/already registered/i),
    ).toBeInTheDocument();
    expect(replaceSpy).not.toHaveBeenCalled();
  });

  // ─── (iv) 이중 제출 1차 방어선 — disabled attribute 검증 ──────
  //
  // LoginForm 과 동일 — [3-61] deferred (submittingRef 동기 가드 미도입) 참조.
  it("(iv) 첫 클릭 → 버튼 disabled → 두 번째 클릭은 차단됨", async () => {
    let resolveSignUp: (v: { data: unknown; error: null }) => void = () => {};
    const pending = new Promise<{ data: unknown; error: null }>((r) => {
      resolveSignUp = r;
    });
    signUpMock.mockReturnValue(pending);

    const user = userEvent.setup({ delay: null });
    render(<SignupForm />);

    await user.type(
      screen.getByRole("textbox", { name: /email/i }),
      "trader@example.com",
    );
    await user.type(screen.getByLabelText(/password/i), "12345678");

    const btn = screen.getByRole("button", { name: /create account/i });
    await user.click(btn);

    await waitFor(() => expect(btn).toBeDisabled());
    expect(btn).toHaveTextContent(/creating account/i);

    await user.click(btn);
    expect(signUpMock).toHaveBeenCalledTimes(1);

    resolveSignUp({ data: { user: null, session: null }, error: null });
  });

  // ─── (v) email confirmation (session=null) ────────────────────

  it("(v) data.session=null → 'Check your email to confirm' 메시지", async () => {
    signUpMock.mockResolvedValue({
      data: {
        user: { id: "u1", email: "trader@example.com" },
        session: null, // confirmation 정책 ON 경로
      },
      error: null,
    });
    const user = userEvent.setup({ delay: null });
    render(<SignupForm />);

    await user.type(
      screen.getByRole("textbox", { name: /email/i }),
      "trader@example.com",
    );
    await user.type(screen.getByLabelText(/password/i), "12345678");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(
      await screen.findByText(/check your email to confirm/i),
    ).toBeInTheDocument();
    expect(replaceSpy).not.toHaveBeenCalled();
  });
});
