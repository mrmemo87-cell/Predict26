"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fetchPredictionMatchById, isPredictableMatchStatus } from "@/lib/data/upcomingPredictionMatches";
import { createClient } from "@/lib/supabase/server";

const MIN_SCORE = 0;
const MAX_SCORE = 20;

const redirectWithError = (error: "invalid_prediction" | "locked" | "save_failed", matchId?: string) => {
  const params = new URLSearchParams({ error });
  if (matchId) params.set("match", matchId);
  redirect(`/predictions?${params.toString()}`);
};

const parseScore = (value: FormDataEntryValue | null) => {
  if (typeof value !== "string" || value.trim() === "") return null;
  if (!/^\d+$/.test(value.trim())) return null;

  const score = Number(value);
  if (!Number.isInteger(score) || score < MIN_SCORE || score > MAX_SCORE) return null;

  return score;
};

const getPredictionChoice = (homeScore: number, awayScore: number) => {
  if (homeScore > awayScore) return "home";
  if (homeScore < awayScore) return "away";
  return "draw";
};

export async function savePrediction(formData: FormData) {
  const matchId = formData.get("match_id")?.toString();
  const homeScore = parseScore(formData.get("home_score"));
  const awayScore = parseScore(formData.get("away_score"));

  if (!matchId) {
    redirectWithError("invalid_prediction");
  }

  const validMatchId = matchId as string;

  if (homeScore === null || awayScore === null) {
    redirectWithError("invalid_prediction", validMatchId);
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

  const match = await fetchPredictionMatchById(supabase, validMatchId);

  if (!match || !isPredictableMatchStatus(match.status) || !match.kickoff_at || new Date(match.kickoff_at) <= new Date()) {
    redirectWithError("locked", validMatchId);
  }

  const unlockedMatch = match as NonNullable<typeof match>;
  const validHomeScore = homeScore as number;
  const validAwayScore = awayScore as number;

  const predictionChoice = getPredictionChoice(validHomeScore, validAwayScore);
  const predictionPayload = {
    user_id: user.id,
    match_id: unlockedMatch.id,
    home_score: validHomeScore,
    away_score: validAwayScore,
    choice: predictionChoice,
  };

  const { error } = await supabase.from("predictions").upsert(predictionPayload, {
    onConflict: "user_id,match_id",
  });

  if (error) {
    console.error("Failed to save prediction", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
      matchId: unlockedMatch.id,
      userId: user.id,
      homeScore: validHomeScore,
      awayScore: validAwayScore,
      choice: predictionChoice,
    });
    redirectWithError("save_failed", validMatchId);
  }

  revalidatePath("/predictions");
  redirect(`/predictions?saved=1&match=${unlockedMatch.id}`);
}
