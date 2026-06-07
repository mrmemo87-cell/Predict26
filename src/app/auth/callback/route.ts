import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProfilePayload } from "@/lib/auth/profile";

const ONBOARDING_COUNTRY_PATH = "/onboarding/country";
const DASHBOARD_PATH = "/dashboard";

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

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return NextResponse.redirect(`${origin}/login?error=missing_user`);
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .upsert(getProfilePayload(user), { onConflict: "id" })
        .select("country_code")
        .single();

      if (profileError) {
        return NextResponse.redirect(
          `${origin}/login?error=profile_upsert_error`
        );
      }

      const redirectPath = profile.country_code
        ? DASHBOARD_PATH
        : ONBOARDING_COUNTRY_PATH;

      return NextResponse.redirect(
        getRedirectUrl(request, origin, redirectPath)
      );
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_error`);
}
