import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
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
  const cookieStore = await cookies();

  if (!code) {
    console.error("Google OAuth callback missing code");
    return NextResponse.redirect(
      getRedirectUrl(request, origin, LOGIN_CALLBACK_FAILED_PATH)
    );
  }

  // Collect cookies that Supabase sets during code exchange so we can
  // attach them to the redirect response (NextResponse.redirect creates a
  // new response object that doesn't inherit cookies set via next/headers).
  const cookiesToSet: Array<{
    name: string;
    value: string;
    options: Record<string, unknown>;
  }> = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookies) {
          cookies.forEach(({ name, value, options }) => {
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

  const response = NextResponse.redirect(
    getRedirectUrl(request, origin, redirectPath)
  );

  // Attach session cookies to the redirect response so the browser stores them
  cookiesToSet.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options);
  });

  return response;
}
