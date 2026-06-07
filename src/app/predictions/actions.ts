"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const PICKS = ["home", "draw", "away"] as const;
type Pick = (typeof PICKS)[number];

const isPick = (value: FormDataEntryValue | null): value is Pick =>
  typeof value === "string" && PICKS.includes(value as Pick);

export async function savePrediction(formData: FormData) {
  const matchId = formData.get("match_id")?.toString();
  const pick = formData.get("pick");

  if (!matchId || !isPick(pick)) {
    redirect("/predictions?error=invalid_prediction");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/predictions");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("country_code")
    .eq("id", user.id)
    .single();

  if (!profile?.country_code) {
    redirect("/onboarding/country");
  }

  const { data: match } = await supabase
    .from("matches")
    .select("id, kickoff_at, status")
    .eq("id", matchId)
    .single();

  if (!match || match.status !== "scheduled" || new Date(match.kickoff_at) <= new Date()) {
    redirect("/predictions?error=locked");
  }

  const { error } = await supabase.from("predictions").upsert(
    {
      user_id: user.id,
      match_id: match.id,
      choice: pick,
      submitted_at: new Date().toISOString(),
    },
    { onConflict: "user_id,match_id" },
  );

  if (error) {
    redirect("/predictions?error=save_failed");
  }

  revalidatePath("/predictions");
  redirect("/predictions?saved=1");
}
