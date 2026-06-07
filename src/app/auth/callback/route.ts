import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getProfilePayload } from "@/lib/auth/profile";

const ONBOARDING_COUNTRY_PATH = "/onboarding/country";
const DASHBOARD_PATH = "/dashboard";

type ProfilePayload = {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  username: string;
};

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

function getStringMetadataValue(
  metadata: User["user_metadata"],
  keys: string[]
) {
  for (const key of keys) {
    const value = metadata?.[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function getProfilePayload(user: User): ProfilePayload {
  const displayName = getStringMetadataValue(user.user_metadata, [
    "full_name",
    "name",
    "display_name",
  ]);
  const avatarUrl = getStringMetadataValue(user.user_metadata, [
    "avatar_url",
    "picture",
  ]);
  const email =
    user.email ?? getStringMetadataValue(user.user_metadata, ["email"]);
  const username =
    getStringMetadataValue(user.user_metadata, [
      "user_name",
      "preferred_username",
      "username",
    ]) ?? `user_${user.id.slice(0, 8)}`;

  return {
    id: user.id,
    email,
    display_name: displayName,
    avatar_url: avatarUrl,
    username,
  };
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
