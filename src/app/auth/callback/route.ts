import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProfilePayload } from "@/lib/auth/profile";

const ONBOARDING_COUNTRY_PATH = "/onboarding/country";
const DASHBOARD_PATH = "/dashboard";
const LOGIN_CALLBACK_FAILED_PATH = "/login?error=callback_failed";

function getRedirectUrl(request: Request, origin: string, path: string) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const isLocalEnv = process.env.NODE_ENV === "development";

  if (isLocalEnv) {
    return `${origin}${path}`;
  }

  if (forwardedHost) {
    return `https://${forwardedHost}${path}`;
  }

  return `${origin}${path}`;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    console.error("Google OAuth callback missing code");
    return NextResponse.redirect(
      getRedirectUrl(request, origin, LOGIN_CALLBACK_FAILED_PATH)
    );
  }

  const supabase = await createClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(
    code
  );

  if (exchangeError) {
    console.error("Google OAuth code exchange failed", exchangeError);
    return NextResponse.redirect(
      getRedirectUrl(request, origin, LOGIN_CALLBACK_FAILED_PATH)
    );
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    console.error("Google OAuth callback could not load user", userError);
    return NextResponse.redirect(
      getRedirectUrl(request, origin, LOGIN_CALLBACK_FAILED_PATH)
    );
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .upsert(getProfilePayload(user), { onConflict: "id" })
    .select("country_code")
    .single();

  if (profileError) {
    console.error("Google OAuth profile upsert failed", profileError);
    return NextResponse.redirect(
      getRedirectUrl(request, origin, LOGIN_CALLBACK_FAILED_PATH)
    );
  }

  const redirectPath = profile?.country_code
    ? DASHBOARD_PATH
    : ONBOARDING_COUNTRY_PATH;

  return NextResponse.redirect(getRedirectUrl(request, origin, redirectPath));
}
