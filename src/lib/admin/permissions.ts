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

export async function requireAdminUser(): Promise<AdminUser> {
  const allowedEmails = getConfiguredAdminEmails();

  if (allowedEmails.length === 0) {
    redirect("/dashboard?error=admin_not_configured");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/admin/matches");
  }

  const email = user.email?.toLowerCase();
  if (!email || !allowedEmails.includes(email)) {
    redirect("/dashboard?error=admin_required");
  }

  return { id: user.id, email };
}
