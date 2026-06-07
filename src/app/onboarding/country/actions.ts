"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const buildFallbackUsername = (userId: string, email?: string) => {
  const emailPrefix = email?.split("@")[0] ?? "player";
  const safePrefix = emailPrefix.toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  const prefix = (safePrefix || "player").slice(0, 15);
  return `${prefix}_${userId.slice(0, 8)}`.slice(0, 24);
};

const getDisplayName = (metadata: Record<string, unknown>, email?: string) => {
  const candidate = metadata.full_name ?? metadata.name ?? metadata.display_name;
  if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  return email?.split("@")[0] ?? "Predict26 Player";
};

const getAvatarUrl = (metadata: Record<string, unknown>) => {
  const candidate = metadata.avatar_url ?? metadata.picture;
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : null;
};

export async function saveCountry(formData: FormData) {
  const selectedCode = formData.get("country_code")?.toString().trim().toUpperCase();

  if (!selectedCode) {
    redirect("/onboarding/country?error=missing_country");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/onboarding/country");
  }

  const { data: country, error: countryError } = await supabase
    .from("countries")
    .select("code")
    .eq("code", selectedCode)
    .eq("is_active", true)
    .maybeSingle();

  if (countryError) {
    console.error("country save failed", { userId: user.id, selectedCode, message: countryError.message });
    redirect("/onboarding/country?error=save_failed");
  }

  if (!country) {
    redirect("/onboarding/country?error=invalid_country");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url, referral_code")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    console.error("country save failed", { userId: user.id, selectedCode, message: profileError.message });
    redirect("/onboarding/country?error=save_failed");
  }

  const metadata = user.user_metadata ?? {};
  const payload = {
    id: user.id,
    username: profile?.username ?? buildFallbackUsername(user.id, user.email),
    display_name: profile?.display_name ?? getDisplayName(metadata, user.email),
    avatar_url: profile?.avatar_url ?? getAvatarUrl(metadata),
    referral_code: profile?.referral_code ?? user.id.replace(/-/g, "").slice(0, 12).toUpperCase(),
    country_code: country.code,
  };

  const { error } = await supabase
    .from("profiles")
    .upsert(payload, { onConflict: "id" });

  if (error) {
    console.error("country save failed", { userId: user.id, selectedCode, message: error.message });
    redirect("/onboarding/country?error=save_failed");
  }

  redirect("/dashboard");
}
