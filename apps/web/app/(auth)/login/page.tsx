/**
 * /login — Sign in page (M1.6 Step 1b).
 *
 * thin server wrapper — 실제 로직은 client component 인 LoginForm 에 위임.
 */

import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata: Metadata = {
  title: "Sign in — TRAVIS",
  description: "Sign in to your TRAVIS account.",
};

export default function LoginPage() {
  return <LoginForm />;
}
