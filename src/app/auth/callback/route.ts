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
  console.info("callback received");

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  console.info("callback code exists", Boolean(code));

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

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(
    code
  );
  console.info("callback session exchange succeeded", !exchangeError);

  if (exchangeError) {
    console.error("Google OAuth code exchange failed", exchangeError.message);
    return redirectWithCookies(LOGIN_CALLBACK_FAILED_PATH);
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    console.error(
      "Google OAuth callback could not load user",
      userError?.message ?? "missing user"
    );
    return redirectWithCookies(LOGIN_CALLBACK_FAILED_PATH);
  }

  const { data: existingProfile, error: lookupError } = await supabase
    .from("profiles")
    .select("country_code")
    .eq("id", user.id)
    .maybeSingle();

  let profile = existingProfile;
  let profileError = lookupError;

  if (!profileError) {
    const profilePayload = getProfilePayload(user);

    if (existingProfile) {
      const { data: updatedProfile, error: updateError } = await supabase
        .from("profiles")
        .update({
          id: profilePayload.id,
          display_name: profilePayload.display_name,
          avatar_url: profilePayload.avatar_url,
          username: profilePayload.username,
        })
        .eq("id", user.id)
        .select("country_code")
        .single();

      profile = updatedProfile;
      profileError = updateError;
    } else {
      const { data: insertedProfile, error: insertError } = await supabase
        .from("profiles")
        .insert(profilePayload)
        .select("country_code")
        .single();

      profile = insertedProfile;
      profileError = insertError;
    }
  }

  console.info("callback profile upsert succeeded", !profileError);

  if (profileError) {
    console.error("Google OAuth profile upsert failed", profileError.message);
    return redirectWithCookies(LOGIN_CALLBACK_FAILED_PATH);
  }

  if (!profile?.country_code) {
    return redirectWithCookies(ONBOARDING_COUNTRY_PATH);
  }

  return redirectWithCookies(DASHBOARD_PATH);
}
