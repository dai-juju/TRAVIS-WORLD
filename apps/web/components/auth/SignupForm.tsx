"use client";

/**
 * SignupForm — 이메일/비밀번호로 Supabase Auth 회원가입 (M1.6 Step 1b).
 *
 * 사전 조건 (사용자 결정 2026-04-24):
 *   - Supabase Dashboard 에서 "Confirm email" OFF.
 *   - OFF 상태에서는 signUp() 가 바로 session 을 반환 → 즉시 로그인 상태.
 *   - ON 이면 session=null 이므로 "Check your email to verify" 안내 필요
 *     (M2+ 에서 재검토).
 *
 * 구조는 LoginForm 과 거의 동일. 재사용 리팩터링은 두 폼이 더 갈라지기 전까진 보류 —
 * 지금은 규칙이 똑같아도 Signup 분기 추가(예: invite code, 약관 동의) 가능성이
 * 높아, 일단 DRY 하지 않고 시각적으로 독립 유지하는 것이 YAGNI 친화적.
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

export function SignupForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // M1.6 Step 1 C2 fix (2026-04-24): LoginForm 과 동일 패턴 — UserMenu/LoginForm 과
  // 대칭 mounted guard.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const form = useForm<EmailPasswordValues>({
    resolver: zodResolver(emailPasswordSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (values: EmailPasswordValues): Promise<void> => {
    // 이중 제출 방어.
    if (submitting) return;
    setServerError(null);
    setSubmitting(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase.auth.signUp(values);
      if (error) {
        if (mountedRef.current) setServerError(error.message);
        return;
      }
      if (!data.session) {
        // Email confirmation ON 경로 — 현 정책상 발생하면 안 되지만 graceful.
        if (mountedRef.current) {
          setServerError(
            "Account created. Check your email to confirm before signing in.",
          );
        }
        return;
      }
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
      if (mountedRef.current) setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Create your TRAVIS account</CardTitle>
        <CardDescription>
          Shape your market — start with an email and password.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                      autoComplete="new-password"
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
              {submitting ? "Creating account..." : "Create account"}
            </Button>
          </form>
        </Form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link
            href="/login"
            className="underline underline-offset-4 hover:text-foreground"
          >
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
