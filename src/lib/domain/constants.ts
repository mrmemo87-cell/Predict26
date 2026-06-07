export const SCORING_RULES = {
  correctPredictionPoints: 10,
  incorrectPredictionPoints: 0,
} as const;

export const PRIZE_POOL = [
  { position: 1, amount: 300 },
  { position: 2, amount: 100 },
  { position: 3, amount: 50 },
] as const;

export const WORLD_CUP_SLUG = "world-cup-2026";
