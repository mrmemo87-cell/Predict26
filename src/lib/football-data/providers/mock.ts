import type { FootballDataProvider, ProviderMatch } from "./types";

const MOCK_MATCHES: ProviderMatch[] = [
  {
    externalId: "mock-world-cup-2026-001",
    competitionSlug: "world-cup-2026",
    homeTeam: { name: "Mexico", code: "MEX" },
    awayTeam: { name: "South Africa", code: "ZAF" },
    kickoffAt: "2026-06-11T19:00:00.000Z",
    status: "scheduled",
    stadium: {
      externalId: "mock-estadio-azteca",
      name: "Estadio Azteca",
      city: "Mexico City",
      countryCode: "MEX",
      capacity: 87523,
      timezone: "America/Mexico_City",
    },
  },
  {
    externalId: "mock-world-cup-2026-002",
    competitionSlug: "world-cup-2026",
    homeTeam: { name: "Canada", code: "CAN" },
    awayTeam: { name: "TBD", code: null },
    kickoffAt: "2026-06-12T00:00:00.000Z",
    status: "scheduled",
    stadium: {
      externalId: "mock-bmo-field",
      name: "BMO Field",
      city: "Toronto",
      countryCode: "CAN",
      capacity: 30000,
      timezone: "America/Toronto",
    },
  },
];

export const mockFootballDataProvider: FootballDataProvider = {
  name: "mock",
  async fetchMatches() {
    return MOCK_MATCHES;
  },
};
