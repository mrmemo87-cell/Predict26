export type FootballProviderName = "mock" | "sportmonks" | "api-football" | "google-openai";

export type ProviderMatchStatus =
  | "scheduled"
  | "in_progress"
  | "live"
  | "completed"
  | "finished"
  | "postponed"
  | "cancelled";

export type ProviderStadium = {
  externalId: string;
  name: string;
  city: string;
  countryCode?: string | null;
  capacity?: number | null;
  timezone?: string | null;
};

export type ProviderTeam = {
  externalId?: string | null;
  name: string;
  code?: string | null;
};

export type ProviderMatch = {
  externalId: string;
  competitionSlug: string;
  homeTeam: ProviderTeam;
  awayTeam: ProviderTeam;
  kickoffAt: string;
  status: ProviderMatchStatus;
  stadium?: ProviderStadium | null;
  homeScore?: number | null;
  awayScore?: number | null;
};

export type ProviderPlayerRef = {
  externalId: string;
  displayName: string;
  teamCode?: string | null;
  shirtNumber?: number | null;
};

export type ProviderGoalEvent = {
  externalId: string;
  teamSide: "home" | "away";
  player: ProviderPlayerRef | null;
  eventType: "goal" | "penalty_goal" | "own_goal" | "other_goal";
  minute?: number | null;
  stoppageMinute?: number | null;
  rawPayload?: unknown;
};

export type ProviderPossessionStat = {
  teamSide: "home" | "away";
  percent: number | null;
  rawPayload?: unknown;
};

export type ProviderLineupPlayer = {
  externalId: string;
  teamSide: "home" | "away";
  teamCode?: string | null;
  displayName: string;
  shirtNumber?: number | null;
  position?: string | null;
  isStarter: boolean;
  lineupSlot?: number | null;
  rawPayload?: unknown;
};

export type ProviderPostMatchReportCategory =
  | "exact_result"
  | "possession"
  | "goal_events"
  | "lineup_home"
  | "lineup_away";

export type ProviderPostMatchReportCategoryStatus =
  | "ready"
  | "missing"
  | "ambiguous"
  | "untrusted"
  | "incomplete";

export type ProviderPostMatchReportContext = {
  matchId: string;
  competitionCode?: string | null;
  homeTeamName: string | null;
  awayTeamName: string | null;
  homeTeamCode: string | null;
  awayTeamCode: string | null;
  homeCountryCode: string | null;
  awayCountryCode: string | null;
  kickoffAt: string | null;
  venue?: string | null;
  city?: string | null;
};

export type ProviderPostMatchReport = {
  providerMatchId: string;
  status: ProviderMatchStatus;
  homeScore: number | null;
  awayScore: number | null;
  isFinal: boolean;
  confidence?: number | null;
  fetchedAt: string;
  rawPayload?: unknown;
  categoryStatuses?: Partial<Record<ProviderPostMatchReportCategory, ProviderPostMatchReportCategoryStatus>>;
  categoryConfidence?: Partial<Record<ProviderPostMatchReportCategory, number>>;
  goalEvents: ProviderGoalEvent[];
  possession: ProviderPossessionStat[];
  lineups: ProviderLineupPlayer[];
};

export type SyncMatchesResult = {
  provider: FootballProviderName;
  processed: number;
  inserted: number;
  updated: number;
};

export type PostMatchSyncResult = {
  provider: FootballProviderName;
  eligible: number;
  processed: number;
  remaining: number;
  scored: number;
  needsReview: number;
  failed: number;
  skipped: number;
};

export interface FootballDataProvider {
  readonly name: FootballProviderName;
  fetchMatches(): Promise<ProviderMatch[]>;
  fetchPostMatchReport?(
    providerMatchId: string,
    context?: ProviderPostMatchReportContext & { categories?: ProviderPostMatchReportCategory[] },
  ): Promise<ProviderPostMatchReport | null>;
}
