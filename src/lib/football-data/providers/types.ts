export type FootballProviderName = "mock" | "sportmonks" | "api-football";

export type ProviderMatchStatus =
  | "scheduled"
  | "in_progress"
  | "live"
  | "completed"
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

export type SyncMatchesResult = {
  provider: FootballProviderName;
  processed: number;
  inserted: number;
  updated: number;
};

export interface FootballDataProvider {
  readonly name: FootballProviderName;
  fetchMatches(): Promise<ProviderMatch[]>;
}
