export const SUPPORTED_COUNTRIES = [
  { code: "KAZ", name: "Kazakhstan", flag: "🇰🇿" },
  { code: "KGZ", name: "Kyrgyzstan", flag: "🇰🇬" },
  { code: "UZB", name: "Uzbekistan", flag: "🇺��" },
  { code: "RUS", name: "Russia", flag: "🇷🇺" },
] as const;

export const SCORING_RULES = {
  correctPredictionPoints: 10,
  incorrectPredictionPoints: 0,
} as const;

export const PRIZE_POOL = [
  { position: 1, amount: 300 },
  { position: 2, amount: 100 },
  { position: 3, amount: 50 },
] as const;
