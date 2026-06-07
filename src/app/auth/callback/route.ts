import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProfilePayload } from "@/lib/auth/profile";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const profilePayload = getProfilePayload(user);

        await supabase.from("profiles").upsert(profilePayload, {
          onConflict: "id",
          ignoreDuplicates: false,
        });

        const { data: profile } = await supabase
          .from("profiles")
          .select("country_code")
          .eq("id", user.id)
          .single();

        const redirectPath = profile?.country_code ? next : "/onboarding/country";
        const forwardedHost = request.headers.get("x-forwarded-host");
        const isLocalEnv = process.env.NODE_ENV === "development";

        if (isLocalEnv) {
          return NextResponse.redirect(`${origin}${redirectPath}`);
        } else if (forwardedHost) {
          return NextResponse.redirect(`https://${forwardedHost}${redirectPath}`);
        } else {
          return NextResponse.redirect(`${origin}${redirectPath}`);
        }
      }
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_error`);
}
