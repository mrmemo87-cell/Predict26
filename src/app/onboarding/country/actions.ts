"use server";

import { redirect } from "next/navigation";
import { getProfilePayload } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";

const COUNTRY_ONBOARDING_PATH = "/onboarding/country";
const LOGIN_SESSION_REQUIRED_PATH = "/login?error=session_required";
const DASHBOARD_PATH = "/dashboard";

type CountrySaveStep =
  | "read_form"
  | "get_user"
  | "validate_country"
  | "update_profile"
  | "insert_profile";

const logCountrySaveFailure = ({
  step,
  user,
  selectedCode,
  error,
}: {
  step: CountrySaveStep;
  user?: { id?: string; email?: string | null } | null;
  selectedCode?: string | null;
  error?: {
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
  } | null;
}) => {
  console.error("country save failed", {
    step,
    userId: user?.id,
    email: user?.email,
    selectedCode,
    errorCode: error?.code,
    errorMessage: error?.message,
    errorDetails: error?.details,
    errorHint: error?.hint,
  });
};

export async function saveCountry(formData: FormData) {
  let step: CountrySaveStep = "read_form";
  const selectedCode = formData.get("country_code")?.toString().trim().toUpperCase();

  if (!selectedCode) {
    redirect(`${COUNTRY_ONBOARDING_PATH}?error=invalid_country`);
  }

  const supabase = await createClient();

  step = "get_user";
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    logCountrySaveFailure({ step, user, selectedCode, error: userError });
  }

  if (!user) {
    logCountrySaveFailure({ step, user, selectedCode, error: userError });
    redirect(LOGIN_SESSION_REQUIRED_PATH);
  }

  step = "validate_country";
  const { data: country, error: countryError } = await supabase
    .from("countries")
    .select("code")
    .eq("code", selectedCode)
    .eq("is_active", true)
    .maybeSingle();

  if (countryError) {
    logCountrySaveFailure({ step, user, selectedCode, error: countryError });
    redirect(`${COUNTRY_ONBOARDING_PATH}?error=save_failed`);
  }

  if (!country) {
    logCountrySaveFailure({ step, user, selectedCode });
    redirect(`${COUNTRY_ONBOARDING_PATH}?error=invalid_country`);
  }

  step = "update_profile";
  const { data: updatedProfile, error: updateError } = await supabase
    .from("profiles")
    .update({
      country_code: country.code,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id)
    .select("id")
    .maybeSingle();

  if (updateError) {
    logCountrySaveFailure({ step, user, selectedCode, error: updateError });
    redirect(`${COUNTRY_ONBOARDING_PATH}?error=save_failed`);
  }

  if (updatedProfile) {
    redirect(DASHBOARD_PATH);
  }

  step = "insert_profile";
  const profilePayload = getProfilePayload(user);
  const { error: insertError } = await supabase.from("profiles").insert({
    ...profilePayload,
    country_code: country.code,
  });

  if (insertError) {
    logCountrySaveFailure({ step, user, selectedCode, error: insertError });
    redirect(`${COUNTRY_ONBOARDING_PATH}?error=save_failed`);
  }

  redirect(DASHBOARD_PATH);
}
