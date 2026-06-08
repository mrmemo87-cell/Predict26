"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  fetchPredictionMatchById,
  isPredictableMatchStatus,
} from "@/lib/data/upcomingPredictionMatches";
import { createClient } from "@/lib/supabase/server";
import {
  buildTeamCodeAliasMap,
  normalizeTeamCode,
  resolveMatchSideTeamCode,
} from "@/lib/football-data/teamCodes";

const MIN_SCORE = 0;
const MAX_SCORE = 20;
const MAX_SCORER_PICKS = 4;
const LINEUP_SIZE = 11;
const CHAMPION_PICK_TYPES = ["A", "B"] as const;
const POSSESSION_CHOICES = ["home_more", "away_more", "equal_50_50"] as const;

type PossessionChoice = (typeof POSSESSION_CHOICES)[number];
type TeamSide = "home" | "away";
type ChampionPickType = (typeof CHAMPION_PICK_TYPES)[number];
type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type AuthenticatedPredictionUser = {
  id: string;
};

type SquadPlayerTeamRow = {
  player_id: string | null;
  team_code: string | null;
};

const redirectWithError = (
  error: "invalid_prediction" | "locked" | "save_failed",
  matchId?: string,
) => {
  const params = new URLSearchParams({ error });
  if (matchId) params.set("match", matchId);
  redirect(`/predictions?${params.toString()}`);
};

const redirectWithBonusError = (
  error:
    | "invalid_bonus"
    | "invalid_possession"
    | "too_many_scorers"
    | "invalid_scorer"
    | "locked"
    | "bonus_save_failed",
  matchId?: string,
) => {
  const params = new URLSearchParams({ bonus_error: error });
  if (matchId) params.set("match", matchId);
  redirect(`/predictions?${params.toString()}`);
};

const redirectWithBonusSaved = (
  saved: "possession" | "scorers",
  matchId: string,
) => {
  const params = new URLSearchParams({ bonus_saved: saved, match: matchId });
  redirect(`/predictions?${params.toString()}`);
};

const safeActionError = (message: string) => ({ ok: false as const, message });
const safeActionSuccess = (message: string) => ({ ok: true as const, message });

const normalizeChampionPickType = (
  pickType: string,
): ChampionPickType | null => {
  const normalized = pickType.trim().toUpperCase();
  return CHAMPION_PICK_TYPES.includes(normalized as ChampionPickType)
    ? (normalized as ChampionPickType)
    : null;
};

const normalizePlayerIds = (playerIds: string[]) => [
  ...new Set(playerIds.map((playerId) => playerId.trim()).filter(Boolean)),
];

const parseScore = (value: FormDataEntryValue | null) => {
  if (typeof value !== "string" || value.trim() === "") return null;
  if (!/^\d+$/.test(value.trim())) return null;

  const score = Number(value);
  if (!Number.isInteger(score) || score < MIN_SCORE || score > MAX_SCORE)
    return null;

  return score;
};

const getPredictionChoice = (homeScore: number, awayScore: number) => {
  if (homeScore > awayScore) return "home";
  if (homeScore < awayScore) return "away";
  return "draw";
};

const requirePredictionUser = async (
  supabase: SupabaseServerClient,
): Promise<AuthenticatedPredictionUser> => {
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

  return { id: user.id };
};

const requireOpenPredictionMatch = async (
  supabase: SupabaseServerClient,
  matchId: string,
): Promise<
  NonNullable<Awaited<ReturnType<typeof fetchPredictionMatchById>>>
> => {
  const match = await fetchPredictionMatchById(supabase, matchId);

  if (
    !match ||
    !isPredictableMatchStatus(match.status) ||
    !match.kickoff_at ||
    new Date(match.kickoff_at) <= new Date()
  ) {
    redirectWithBonusError("locked", matchId);
  }

  return match as NonNullable<
    Awaited<ReturnType<typeof fetchPredictionMatchById>>
  >;
};

const fetchTeamCodeAliases = async (
  supabase: SupabaseServerClient,
  teamCodes: Array<string | null>,
) => {
  const rawCodes = [
    ...new Set(teamCodes.map(normalizeTeamCode).filter(Boolean) as string[]),
  ];

  if (rawCodes.length === 0) return new Map<string, string>();

  const { data } = await supabase
    .from("team_code_aliases")
    .select("alias_code, canonical_team_code")
    .eq("competition_code", "WC2026")
    .in("alias_code", rawCodes);

  return buildTeamCodeAliasMap(data);
};

const parseUniqueScorerIds = (formData: FormData) => {
  const playerIds = formData
    .getAll("scorer_player_id")
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);

  return [...new Set(playerIds)];
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
  const user = await requirePredictionUser(supabase);

  const match = await fetchPredictionMatchById(supabase, validMatchId);

  if (
    !match ||
    !isPredictableMatchStatus(match.status) ||
    !match.kickoff_at ||
    new Date(match.kickoff_at) <= new Date()
  ) {
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
    pick: predictionChoice,
    choice: predictionChoice,
  };

  const { error } = await supabase
    .from("predictions")
    .upsert(predictionPayload, {
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

export async function savePossessionPrediction(formData: FormData) {
  const matchId = formData.get("match_id")?.toString();
  const choice = formData.get("possession_choice")?.toString();

  if (!matchId) {
    redirectWithBonusError("invalid_bonus");
  }

  const validMatchId = matchId as string;

  if (!choice || !POSSESSION_CHOICES.includes(choice as PossessionChoice)) {
    redirectWithBonusError("invalid_possession", validMatchId);
  }

  const supabase = await createClient();
  const user = await requirePredictionUser(supabase);
  const match = await requireOpenPredictionMatch(supabase, validMatchId);

  const { error } = await supabase.from("prediction_possession").upsert(
    {
      user_id: user.id,
      match_id: match.id,
      choice: choice as PossessionChoice,
    },
    { onConflict: "user_id,match_id" },
  );

  if (error) {
    console.error("Failed to save possession prediction", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
      matchId: match.id,
      userId: user.id,
      choice,
    });
    redirectWithBonusError("bonus_save_failed", validMatchId);
  }

  revalidatePath("/predictions");
  redirectWithBonusSaved("possession", match.id);
}

export async function saveScorerPredictions(formData: FormData) {
  const matchId = formData.get("match_id")?.toString();

  if (!matchId) {
    redirectWithBonusError("invalid_bonus");
  }

  const validMatchId = matchId as string;
  const playerIds = parseUniqueScorerIds(formData);

  if (playerIds.length > MAX_SCORER_PICKS) {
    redirectWithBonusError("too_many_scorers", validMatchId);
  }

  const supabase = await createClient();
  const user = await requirePredictionUser(supabase);
  const match = await requireOpenPredictionMatch(supabase, validMatchId);

  const aliases = await fetchTeamCodeAliases(supabase, [
    match.home_team_code,
    match.away_team_code,
    match.home_country_code,
    match.away_country_code,
  ]);
  const homeTeamCode = resolveMatchSideTeamCode(
    match.home_team_code,
    match.home_country_code,
    aliases,
  );
  const awayTeamCode = resolveMatchSideTeamCode(
    match.away_team_code,
    match.away_country_code,
    aliases,
  );
  const matchTeamCodes = [homeTeamCode, awayTeamCode].filter(
    Boolean,
  ) as string[];

  if (playerIds.length > 0 && matchTeamCodes.length < 2) {
    redirectWithBonusError("invalid_scorer", validMatchId);
  }

  const playerTeamCodes = new Map<string, string>();

  if (playerIds.length > 0) {
    const { data: squadRows, error: squadError } = await supabase
      .from("competition_team_players")
      .select("player_id, team_code")
      .eq("competition_code", "WC2026")
      .eq("is_active", true)
      .in("player_id", playerIds)
      .in("team_code", matchTeamCodes);

    if (squadError) {
      console.error("Failed to validate scorer squad membership", {
        code: squadError.code,
        message: squadError.message,
        details: squadError.details,
        hint: squadError.hint,
        matchId: match.id,
        userId: user.id,
      });
      redirectWithBonusError("bonus_save_failed", validMatchId);
    }

    ((squadRows ?? []) as SquadPlayerTeamRow[]).forEach((row) => {
      if (row.player_id && row.team_code) {
        playerTeamCodes.set(row.player_id, row.team_code);
      }
    });

    if (playerIds.some((playerId) => !playerTeamCodes.has(playerId))) {
      redirectWithBonusError("invalid_scorer", validMatchId);
    }
  }

  const { error: deleteError } = await supabase
    .from("prediction_scorers")
    .delete()
    .eq("user_id", user.id)
    .eq("match_id", match.id);

  if (deleteError) {
    console.error("Failed to clear scorer predictions", {
      code: deleteError.code,
      message: deleteError.message,
      details: deleteError.details,
      hint: deleteError.hint,
      matchId: match.id,
      userId: user.id,
    });
    redirectWithBonusError("bonus_save_failed", validMatchId);
  }

  if (playerIds.length > 0) {
    const insertRows = playerIds.map((playerId, index) => ({
      user_id: user.id,
      match_id: match.id,
      player_id: playerId,
      team_code: playerTeamCodes.get(playerId) as string,
      slot: index + 1,
    }));

    const { error: insertError } = await supabase
      .from("prediction_scorers")
      .insert(insertRows);

    if (insertError) {
      console.error("Failed to save scorer predictions", {
        code: insertError.code,
        message: insertError.message,
        details: insertError.details,
        hint: insertError.hint,
        matchId: match.id,
        userId: user.id,
      });
      redirectWithBonusError("bonus_save_failed", validMatchId);
    }
  }

  revalidatePath("/predictions");
  redirectWithBonusSaved("scorers", match.id);
}

export async function saveLineupPrediction(
  matchId: string,
  teamSide: TeamSide,
  playerIds: string[],
) {
  if (!matchId || (teamSide !== "home" && teamSide !== "away")) {
    return safeActionError(
      "Choose a valid match side before saving the lineup.",
    );
  }

  const uniquePlayerIds = normalizePlayerIds(playerIds);
  if (uniquePlayerIds.length !== LINEUP_SIZE) {
    return safeActionError(
      "Select exactly 11 unique players before saving this starting XI.",
    );
  }

  const supabase = await createClient();
  const user = await requirePredictionUser(supabase);
  const match = await fetchPredictionMatchById(supabase, matchId);

  if (
    !match ||
    !isPredictableMatchStatus(match.status) ||
    !match.kickoff_at ||
    new Date(match.kickoff_at) <= new Date()
  ) {
    return safeActionError("Lineup predictions are locked for this match.");
  }

  const aliases = await fetchTeamCodeAliases(supabase, [
    match.home_team_code,
    match.away_team_code,
    match.home_country_code,
    match.away_country_code,
  ]);
  const expectedTeamCode =
    teamSide === "home"
      ? resolveMatchSideTeamCode(
          match.home_team_code,
          match.home_country_code,
          aliases,
        )
      : resolveMatchSideTeamCode(
          match.away_team_code,
          match.away_country_code,
          aliases,
        );

  if (!expectedTeamCode) {
    return safeActionError("This match side is missing active squad data.");
  }

  const { data: squadRows, error: squadError } = await supabase
    .from("competition_team_players")
    .select("player_id")
    .eq("competition_code", "WC2026")
    .eq("team_code", expectedTeamCode)
    .eq("is_active", true)
    .in("player_id", uniquePlayerIds);

  if (squadError) {
    console.error("Failed to validate lineup squad membership", {
      code: squadError.code,
      message: squadError.message,
      details: squadError.details,
      hint: squadError.hint,
      matchId: match.id,
      userId: user.id,
      teamSide,
    });
    return safeActionError("Could not validate this lineup. Please try again.");
  }

  const validPlayerIds = new Set(
    ((squadRows ?? []) as SquadPlayerTeamRow[])
      .map((row) => row.player_id)
      .filter(Boolean),
  );
  if (uniquePlayerIds.some((playerId) => !validPlayerIds.has(playerId))) {
    return safeActionError(
      "Choose players from this team's active squad only.",
    );
  }

  const { data: lineup, error: upsertError } = await supabase
    .from("prediction_lineups")
    .upsert(
      {
        user_id: user.id,
        match_id: match.id,
        team_side: teamSide,
        team_code: expectedTeamCode,
        is_submitted: false,
        submitted_at: null,
      },
      { onConflict: "user_id,match_id,team_side" },
    )
    .select("id")
    .single();

  if (upsertError || !lineup?.id) {
    console.error("Failed to prepare lineup prediction", {
      code: upsertError?.code,
      message: upsertError?.message,
      details: upsertError?.details,
      hint: upsertError?.hint,
      matchId: match.id,
      userId: user.id,
      teamSide,
    });
    return safeActionError("Could not save this lineup. Please try again.");
  }

  const { error: deleteError } = await supabase
    .from("prediction_lineup_players")
    .delete()
    .eq("prediction_lineup_id", lineup.id);

  if (deleteError) {
    console.error("Failed to clear lineup players", {
      code: deleteError.code,
      message: deleteError.message,
      details: deleteError.details,
      hint: deleteError.hint,
      lineupId: lineup.id,
      matchId: match.id,
      userId: user.id,
      teamSide,
    });
    return safeActionError("Could not update this lineup. Please try again.");
  }

  const { error: insertError } = await supabase
    .from("prediction_lineup_players")
    .insert(
      uniquePlayerIds.map((playerId) => ({
        prediction_lineup_id: lineup.id,
        player_id: playerId,
      })),
    );

  if (insertError) {
    console.error("Failed to insert lineup players", {
      code: insertError.code,
      message: insertError.message,
      details: insertError.details,
      hint: insertError.hint,
      lineupId: lineup.id,
      matchId: match.id,
      userId: user.id,
      teamSide,
    });
    return safeActionError(
      "Could not save these lineup players. Please try again.",
    );
  }

  const { error: submitError } = await supabase
    .from("prediction_lineups")
    .update({ is_submitted: true, submitted_at: new Date().toISOString() })
    .eq("id", lineup.id)
    .eq("user_id", user.id);

  if (submitError) {
    console.error("Failed to submit lineup prediction", {
      code: submitError.code,
      message: submitError.message,
      details: submitError.details,
      hint: submitError.hint,
      lineupId: lineup.id,
      matchId: match.id,
      userId: user.id,
      teamSide,
    });
    return safeActionError("Could not submit this lineup. Please try again.");
  }

  revalidatePath("/predictions");
  return safeActionSuccess("Starting XI saved.");
}

export async function saveChampionPick(pickType: string, teamCode: string) {
  const validPickType = normalizeChampionPickType(pickType);
  const normalizedTeamCode = normalizeTeamCode(teamCode);

  if (!validPickType || !normalizedTeamCode) {
    return safeActionError("Choose a valid champion pick before saving.");
  }

  const supabase = await createClient();
  const user = await requirePredictionUser(supabase);

  const { data: config } = await supabase
    .from("tournament_prediction_config")
    .select("competition_code, competition_id, champion_picks_enabled")
    .eq("competition_code", "WC2026")
    .maybeSingle();

  if (!config?.champion_picks_enabled) {
    return safeActionError("Champion picks are not open yet.");
  }

  const { data: canSubmit, error: eligibilityError } = await supabase.rpc(
    "can_submit_champion_prediction",
    {
      p_user_id: user.id,
      p_competition_code: "WC2026",
      p_pick_type: validPickType,
      p_team_code: normalizedTeamCode,
    },
  );

  if (eligibilityError) {
    console.error("Failed to validate champion pick eligibility", {
      code: eligibilityError.code,
      message: eligibilityError.message,
      details: eligibilityError.details,
      hint: eligibilityError.hint,
      userId: user.id,
      pickType: validPickType,
      teamCode: normalizedTeamCode,
    });
    return safeActionError(
      "Could not validate champion pick eligibility. Please try again.",
    );
  }

  if (!canSubmit) {
    return safeActionError(
      "Champion pick is unavailable or the deadline has passed.",
    );
  }

  const { error } = await supabase
    .from("tournament_champion_predictions")
    .upsert(
      {
        user_id: user.id,
        competition_code: "WC2026",
        competition_id: config.competition_id,
        pick_type: validPickType,
        team_code: normalizedTeamCode,
      },
      { onConflict: "user_id,competition_code,pick_type" },
    );

  if (error) {
    console.error("Failed to save champion pick", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
      userId: user.id,
      pickType: validPickType,
      teamCode: normalizedTeamCode,
    });
    return safeActionError("Could not save champion pick. Please try again.");
  }

  revalidatePath("/predictions");
  return safeActionSuccess(`Champion Pick ${validPickType} saved.`);
}
