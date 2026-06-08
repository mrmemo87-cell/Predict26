import "server-only";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export type AdminUser = {
  id: string;
  email: string;
};

export function getConfiguredAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isConfiguredAdminEmail(email: string | null | undefined): boolean {
  const normalizedEmail = email?.trim().toLowerCase();
  if (!normalizedEmail) return false;

  return getConfiguredAdminEmails().includes(normalizedEmail);
}

export async function requireAdminUser(redirectTo = "/admin"): Promise<AdminUser> {
  const allowedEmails = getConfiguredAdminEmails();

  if (allowedEmails.length === 0) {
    redirect("/dashboard?error=admin_not_configured");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirectTo=${encodeURIComponent(redirectTo)}`);
  }

  const email = user.email?.trim().toLowerCase();
  if (!email || !allowedEmails.includes(email)) {
    redirect("/dashboard?error=admin_required");
  }

  return { id: user.id, email };
}
