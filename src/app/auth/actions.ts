"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getBaseAppUrl } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const signInWithGoogle = async () => {
  const supabase = await createSupabaseServerClient();
  const host = (await headers()).get("host");
  const protocol = process.env.NODE_ENV === "development" ? "http" : "https";
  const baseUrl = host ? `${protocol}://${host}` : getBaseAppUrl();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${baseUrl}/auth/callback`,
      queryParams: {
        access_type: "offline",
        prompt: "consent",
      },
    },
  });

  if (error || !data.url) {
    redirect("/?authError=oauth_failed");
  }

  redirect(data.url);
};

export const signOut = async () => {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
};
