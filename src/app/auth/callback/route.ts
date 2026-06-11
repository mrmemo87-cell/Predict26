import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getProfilePayload } from "@/lib/auth/profile";
import { getRedirectUrl } from "@/lib/auth/redirect";

const DASHBOARD_PATH = "/dashboard";
const ONBOARDING_COUNTRY_PATH = "/onboarding/country";
const LOGIN_CALLBACK_FAILED_PATH = "/login?error=auth_callback_failed";

type CookieToSet = {
  name: string;
  value: string;
  options: Record<string, unknown>;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const cookieStore = await cookies();

  if (!code) {
    console.error("Google OAuth callback missing code");
    return NextResponse.redirect(
      getRedirectUrl(request, LOGIN_CALLBACK_FAILED_PATH)
    );
  }

  // Supabase sets session cookies during exchangeCodeForSession. Keep a mutable
  // copy so this route can read the fresh session before the browser receives
  // the redirect response.
  const mutableCookies = new Map(
    cookieStore.getAll().map((cookie) => [cookie.name, cookie.value])
  );
  const cookiesToSet: CookieToSet[] = [];

  const redirectWithCookies = (path: string) => {
    const response = NextResponse.redirect(getRedirectUrl(request, path));

    cookiesToSet.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, options);
    });

    return response;
  };

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return Array.from(mutableCookies, ([name, value]) => ({ name, value }));
        },
        setAll(cookies) {
          cookies.forEach(({ name, value, options }) => {
            mutableCookies.set(name, value);
            cookiesToSet.push({ name, value, options: options ?? {} });
          });
        },
      },
    }
  );

  const { data: sessionData, error: exchangeError } =
    await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError || !sessionData.user) {
    console.error("Google OAuth code exchange failed", {
      errorName: exchangeError?.name,
      status: exchangeError?.status,
      hasUser: Boolean(sessionData.user),
    });
    return redirectWithCookies(LOGIN_CALLBACK_FAILED_PATH);
  }

  const profilePayload = getProfilePayload(sessionData.user);
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .upsert(profilePayload, { onConflict: "id" })
    .select("country_code")
    .single();

  if (profileError) {
    console.error("Google OAuth profile upsert failed", profileError.message);
    return redirectWithCookies(LOGIN_CALLBACK_FAILED_PATH);
  }

  if (!profile?.country_code) {
    return redirectWithCookies(ONBOARDING_COUNTRY_PATH);
  }

  return redirectWithCookies(DASHBOARD_PATH);
}
