import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";

export const metadata: Metadata = { title: "Update password" };

export default function UpdatePasswordPage() {
  return <AuthForm mode="update-password" />;
}
