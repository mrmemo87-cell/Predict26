"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function saveCountry(formData: FormData) {
  const countryCode = formData.get("country_code")?.toString();

  if (!countryCode) {
    redirect("/onboarding/country?error=missing_country");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/onboarding/country");
  }

  const { data: country } = await supabase
    .from("countries")
    .select("code")
    .eq("code", countryCode)
    .maybeSingle();

  if (!country) {
    redirect("/onboarding/country?error=invalid_country");
  }

  const { error } = await supabase
    .from("profiles")
    .update({ country_code: country.code })
    .eq("id", user.id);

  if (error) {
    redirect("/onboarding/country?error=save_failed");
  }

  redirect("/dashboard");
}
