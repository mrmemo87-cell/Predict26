export type PredictionChoice = "home" | "draw" | "away";

export type Profile = {
  id: string;
  username: string;
  avatarUrl: string | null;
  countryCode: string;
  points: number;
  accuracy: number;
  isFounder: boolean;
  referralCode: string;
};

export type Match = {
  id: string;
  competitionSlug: string;
  homeTeam: string;
  awayTeam: string;
  kickoffAt: string;
};

export type Prediction = {
  id: string;
  userId: string;
  matchId: string;
  choice: PredictionChoice;
  pointsAwarded: number;
};
