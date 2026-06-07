import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getProfilePayload } from "@/lib/auth/profile";
import { getRedirectUrl } from "@/lib/auth/redirect";

const DASHBOARD_PATH = "/dashboard";
const LOGIN_CALLBACK_FAILED_PATH = "/login?error=callback_failed";

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

  // Supabase sets the session cookies during exchangeCodeForSession. Keep a
  // mutable copy so the same server-side client can read the freshly exchanged
  // session before the browser receives the redirect response.
  const mutableCookies = new Map(
    cookieStore.getAll().map((cookie) => [cookie.name, cookie.value])
  );
  const cookiesToSet: CookieToSet[] = [];

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

  if (exchangeError) {
    console.error("Google OAuth code exchange failed", exchangeError);
    return NextResponse.redirect(
      getRedirectUrl(request, LOGIN_CALLBACK_FAILED_PATH)
    );
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    console.error("Google OAuth callback could not load user", userError);
    return NextResponse.redirect(
      getRedirectUrl(request, LOGIN_CALLBACK_FAILED_PATH)
    );
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .upsert(getProfilePayload(user), { onConflict: "id" });

  if (profileError) {
    // Do not send a successfully authenticated user back to /login because of
    // profile metadata. The auth trigger/migrations create the required profile
    // row, and the dashboard/onboarding flow can handle any missing fields.
    console.error("Google OAuth profile upsert failed", profileError);
  }

  const response = NextResponse.redirect(
    getRedirectUrl(request, DASHBOARD_PATH)
  );

  cookiesToSet.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options);
  });

  return response;
}
