"use client";

/**
 * LoginForm — 이메일/비밀번호로 Supabase Auth 로그인 (M1.6 Step 1b).
 *
 * 설계:
 *   - react-hook-form + zodResolver 패턴 (shadcn form.tsx 의 전제).
 *   - 제출 중 버튼 비활성화 + "Signing in..." 레이블로 이중 제출 방지.
 *   - 실패 시 Supabase error.message 를 폼 하단에 표시 (영어 원문 그대로 —
 *     Supabase 가 반환하는 메시지가 이미 영어이고 사용자 식별 가능한 수준).
 *   - 성공 시 router.replace("/") → router.refresh() 로 Server Component 재실행
 *     (proxy 가 쿠키에서 갱신된 세션을 읽도록).
 *
 * 왜 try/catch 가 최상위에 있는가:
 *   - 네트워크 오프라인 / env 누락 등 예외적 throw 경로를 graceful 처리.
 *   - CLAUDE.md "에러 나면 절대 crash 하면 안 됨" 원칙.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

import { getSupabaseBrowserClient } from "@/lib/supabase/browserClient";
import {
  emailPasswordSchema,
  type EmailPasswordValues,
} from "@/lib/auth/schemas";

export function LoginForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // M1.6 Step 1 C2 fix (2026-04-24): router.replace 직후 컴포넌트가 언마운트되는
  // 동안 finally 의 setState 가 호출되면 React 가 stateless stub 으로 대체하지만
  // CLAUDE.md "crash 금지" 정신상 명시적 가드가 더 안전. UserMenu.tsx 의 mounted
  // 패턴과 대칭.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /**
   * M1.6 Step 5 후속 ([3-61] 회수, 2026-05-03): submittingRef 동기 race guard.
   *
   * 배경: `submitting` React state 만 보면 setSubmitting(true) 가 re-render 까지
   * 도달하기 전 (수 ms) 에 두 번째 onSubmit 이 진입하면 stale closure 로 submitting=
   * false 캡처 → signInWithPassword 2회 호출. ChatInputBar `[2-6]` 와 동일 패턴.
   * ref mutation 은 동기라 즉시 차단. submitting state 검사도 1차 방어선으로 유지
   * → 두 겹 가드.
   */
  const submittingRef = useRef(false);

  const form = useForm<EmailPasswordValues>({
    resolver: zodResolver(emailPasswordSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (values: EmailPasswordValues): Promise<void> => {
    // 이중 제출 방어 — 두 겹 가드 (ref 동기 + state 1차 방어선).
    if (submittingRef.current || submitting) return;
    submittingRef.current = true;
    setServerError(null);
    setSubmitting(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithPassword(values);
      if (error) {
        if (mountedRef.current) setServerError(error.message);
        return;
      }
      // 성공 경로 — 언마운트 직전 submitting 은 true 로 두어 중복 제출 차단 유지.
      // 세션 쿠키 갱신 직후 Server Component(proxy 포함) 재실행 강제.
      router.replace("/");
      router.refresh();
      return;
    } catch (err) {
      if (mountedRef.current) {
        setServerError(
          err instanceof Error
            ? err.message
            : "Unexpected error. Please retry.",
        );
      }
    } finally {
      // ref 는 unmount 후에도 안전하게 mutation 가능 (mountedRef 가드 불필요).
      submittingRef.current = false;
      if (mountedRef.current) setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Sign in to TRAVIS</CardTitle>
        <CardDescription>
          Shape your market — enter your credentials.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          {/* noValidate — 브라우저 HTML5 native validation 을 끄고 Zod 영어 메시지를
           * 유일 검증 경로로 일원화. OS/브라우저 locale 에 의존한 한국어 tooltip 제거
           * (예: Chrome ko-KR "이메일 주소에 '@'를 포함하세요"). 실제 검증은 Zod +
           * Supabase 가 맡으므로 UX 신뢰성 손실 없음.
           */}
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
            noValidate
          >
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      autoComplete="email"
                      placeholder="you@example.com"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      autoComplete="current-password"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {serverError ? (
              <p className="text-sm text-destructive" role="alert">
                {serverError}
              </p>
            ) : null}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        </Form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link
            href="/signup"
            className="underline underline-offset-4 hover:text-foreground"
          >
            Sign up
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
