/**
 * /signup — Create account page (M1.6 Step 1b).
 *
 * thin server wrapper — 실제 로직은 client component 인 SignupForm 에 위임.
 */

import type { Metadata } from "next";
import { SignupForm } from "@/components/auth/SignupForm";

export const metadata: Metadata = {
  title: "Create account — TRAVIS",
  description: "Create a TRAVIS account to shape your market.",
};

export default function SignupPage() {
  return <SignupForm />;
}
