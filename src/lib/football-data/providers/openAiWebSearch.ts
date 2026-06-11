import "server-only";

import type {
  FootballDataProvider,
  ProviderGoalEvent,
  ProviderLineupPlayer,
  ProviderMatch,
  ProviderPostMatchReport,
  ProviderPostMatchReportCategory,
  ProviderPostMatchReportCategoryStatus,
  ProviderPostMatchReportContext,
  ProviderPossessionStat,
} from "./types";

const OPENAI_RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses";
const OPENAI_MODEL = "gpt-4.1-mini";
const TRUSTED_SOURCE_LIMIT = 3;

const TRUSTED_SOURCES = [
  { host: "fifa.com", label: "FIFA", priority: 100 },
  { host: "espn.com", label: "ESPN", priority: 90 },
  { host: "bbc.com", label: "BBC Sport", priority: 85 },
  { host: "bbc.co.uk", label: "BBC Sport", priority: 85 },
  { host: "reuters.com", label: "Reuters", priority: 80 },
  { host: "skysports.com", label: "Sky Sports", priority: 75 },
  { host: "ussoccer.com", label: "Official federation", priority: 70 },
  { host: "canadasoccer.com", label: "Official federation", priority: 70 },
  { host: "miseleccion.mx", label: "Official federation", priority: 70 },
  { host: "the-afc.com", label: "Official federation", priority: 70 },
  { host: "cafonline.com", label: "Official federation", priority: 70 },
  { host: "concacaf.com", label: "Official federation", priority: 70 },
  { host: "conmebol.com", label: "Official federation", priority: 70 },
  { host: "uefa.com", label: "Official federation", priority: 70 },
] as const;

const CATEGORY_KEYS = [
  "exact_result",
  "possession",
  "goal_events",
  "lineup_home",
  "lineup_away",
] as const satisfies ProviderPostMatchReportCategory[];

class OpenAiWebSearchConfigurationError extends Error {
  constructor() {
    super("OpenAI web search provider is not configured. Set OPENAI_API_KEY.");
    this.name = "OpenAiWebSearchConfigurationError";
  }
}

export const isOpenAiWebSearchConfigurationError = (error: unknown) =>
  error instanceof OpenAiWebSearchConfigurationError;

type SourcePage = {
  url: string;
  title: string;
  snippet?: string;
  host: string;
  label: string;
  priority: number;
};

type ExtractedSource = {
  url: string;
  host: string;
  label: string;
};

type ExtractedGoal = {
  teamSide: "home" | "away" | null;
  playerName: string | null;
  teamCode: string | null;
  eventType: "goal" | "penalty_goal" | "own_goal" | "other_goal";
  minute: number | null;
  stoppageMinute: number | null;
  sourceUrls: string[];
};

type ExtractedLineupPlayer = {
  teamSide: "home" | "away" | null;
  teamCode: string | null;
  playerName: string | null;
  shirtNumber: number | null;
  position: string | null;
  isStarter: boolean;
  lineupSlot: number | null;
  sourceUrls: string[];
};

type ExtractedMatchReport = {
  isFinal: boolean;
  status: "scheduled" | "in_progress" | "live" | "completed" | "finished" | "postponed" | "cancelled";
  homeScore: number | null;
  awayScore: number | null;
  possession: Array<{ teamSide: "home" | "away" | null; percent: number | null; sourceUrls: string[] }>;
  goals: ExtractedGoal[];
  lineups: ExtractedLineupPlayer[];
  categoryStatus: Record<ProviderPostMatchReportCategory, ProviderPostMatchReportCategoryStatus>;
  categoryConfidence: Record<ProviderPostMatchReportCategory, number>;
  categoryReasons: Record<ProviderPostMatchReportCategory, string>;
  agreeingSources: Record<ProviderPostMatchReportCategory, string[]>;
  conflictingSources: Record<ProviderPostMatchReportCategory, string[]>;
};

const providerPlayerId = (teamSide: "home" | "away", teamCode: string | null | undefined, playerName: string) =>
  `google-openai:${teamSide}:${(teamCode ?? "unknown").toUpperCase()}:${normalizeName(playerName)}`;

const normalizeName = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

const envConfigured = () => Boolean(process.env.OPENAI_API_KEY);

const matchLabel = (context?: ProviderPostMatchReportContext) => {
  if (!context) return "World Cup 2026 match";
  return `${context.homeTeamName} vs ${context.awayTeamName} ${context.kickoffAt?.slice(0, 10) ?? "World Cup 2026"}`;
};

const hostForUrl = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
};

const trustedSourceForHost = (host: string) =>
  TRUSTED_SOURCES.find((source) => host === source.host || host.endsWith(`.${source.host}`));

const trustedDomains = () => TRUSTED_SOURCES.map((source) => source.host);

const trustedSourceLabels = () =>
  TRUSTED_SOURCES.map((source) => `${source.label} (${source.host})`).join(", ");

const extractionInstructions = (context?: ProviderPostMatchReportContext) => `
You extract post-match soccer data for Predict26. Use the built-in web_search tool only; do not rely on any Google Custom Search data, Google sports widgets, paid sports APIs, unsourced knowledge, or live polling loops.
Return only strict JSON matching this TypeScript shape:
{
  "isFinal": boolean,
  "status": "scheduled" | "in_progress" | "live" | "completed" | "finished" | "postponed" | "cancelled",
  "homeScore": number | null,
  "awayScore": number | null,
  "possession": [{ "teamSide": "home" | "away" | null, "percent": number | null, "sourceUrls": string[] }],
  "goals": [{ "teamSide": "home" | "away" | null, "playerName": string | null, "teamCode": string | null, "eventType": "goal" | "penalty_goal" | "own_goal" | "other_goal", "minute": number | null, "stoppageMinute": number | null, "sourceUrls": string[] }],
  "lineups": [{ "teamSide": "home" | "away" | null, "teamCode": string | null, "playerName": string | null, "shirtNumber": number | null, "position": string | null, "isStarter": boolean, "lineupSlot": number | null, "sourceUrls": string[] }],
  "categoryStatus": { "exact_result": "ready" | "missing" | "ambiguous" | "untrusted" | "incomplete", "possession": "ready" | "missing" | "ambiguous" | "untrusted" | "incomplete", "goal_events": "ready" | "missing" | "ambiguous" | "untrusted" | "incomplete", "lineup_home": "ready" | "missing" | "ambiguous" | "untrusted" | "incomplete", "lineup_away": "ready" | "missing" | "ambiguous" | "untrusted" | "incomplete" },
  "categoryConfidence": { "exact_result": number, "possession": number, "goal_events": number, "lineup_home": number, "lineup_away": number },
  "categoryReasons": { "exact_result": string, "possession": string, "goal_events": string, "lineup_home": string, "lineup_away": string },
  "agreeingSources": { "exact_result": string[], "possession": string[], "goal_events": string[], "lineup_home": string[], "lineup_away": string[] },
  "conflictingSources": { "exact_result": string[], "possession": string[], "goal_events": string[], "lineup_home": string[], "lineup_away": string[] }
}

Trusted public sources: ${trustedSourceLabels()}. Prefer FIFA, then ESPN, BBC Sport, Reuters, Sky Sports, and official federation/confederation pages. Search across the trusted domains allowed by the web_search tool. Treat UZ and UZB as the same Uzbekistan team code when matching teams or player sources.

Confidence rules:
- Final score is ready only when two trusted sources agree, or FIFA alone is clear and no source conflicts.
- Scorers are ready only when two trusted sources agree, or FIFA alone is clear and no source conflicts.
- Possession is ready only from FIFA, ESPN, or official stats pages.
- A lineup side is ready only when exactly 11 starters are found for that team.
- Mark only the uncertain/conflicting category ambiguous, missing, untrusted, or incomplete; do not downgrade other categories.
- Never use a Google sports widget, Google Custom Search, paid sports API, client-side key, or unsourced knowledge.

Match context: ${JSON.stringify(context ?? {})}
`;

const responseText = (payload: { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> }) =>
  payload.output_text ?? payload.output?.flatMap((item) => item.content ?? []).map((content) => content.text ?? "").join("") ?? "";

type WebSearchSource = {
  url?: string;
  title?: string;
};

type WebSearchOutputItem = {
  type?: string;
  action?: {
    sources?: WebSearchSource[];
  };
};

const responseSources = (payload: { output?: WebSearchOutputItem[] }): SourcePage[] =>
  (payload.output ?? [])
    .flatMap((item) => item.action?.sources ?? [])
    .map<SourcePage | null>((source) => {
      const url = source.url ?? "";
      const host = hostForUrl(url);
      const trusted = trustedSourceForHost(host);
      if (!url || !trusted) return null;
      return {
        url,
        title: source.title ?? "Untitled source",
        host,
        label: trusted.label,
        priority: trusted.priority,
      };
    })
    .filter((source): source is SourcePage => Boolean(source))
    .sort((left, right) => right.priority - left.priority)
    .filter((item, index, items) => items.findIndex((candidate) => candidate.url === item.url) === index)
    .slice(0, TRUSTED_SOURCE_LIMIT);

async function extractWithOpenAi(context?: ProviderPostMatchReportContext) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new OpenAiWebSearchConfigurationError();

  const response = await fetch(OPENAI_RESPONSES_ENDPOINT, {
    method: "POST",
    cache: "no-store",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      tools: [
        {
          type: "web_search",
          filters: { allowed_domains: trustedDomains() },
          external_web_access: true,
        },
      ],
      tool_choice: "auto",
      include: ["web_search_call.action.sources"],
      input: [
        { role: "system", content: extractionInstructions(context) },
        {
          role: "user",
          content: `Find trusted public post-match sources for ${matchLabel(context)}. Compare sources and return only the structured JSON requested.`,
        },
      ],
      text: { format: { type: "json_object" } },
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI web search extraction failed with ${response.status}.`);
  }

  const payload = (await response.json()) as {
    output_text?: string;
    output?: Array<WebSearchOutputItem & { content?: Array<{ text?: string }> }>;
  };
  const text = responseText(payload);
  if (!text) throw new Error("OpenAI web search extraction returned an empty response.");

  return { extracted: JSON.parse(text) as ExtractedMatchReport, sources: responseSources(payload) };
}

const safeCategoryStatus = (
  extracted: ExtractedMatchReport,
  category: ProviderPostMatchReportCategory,
): ProviderPostMatchReportCategoryStatus => {
  const status = extracted.categoryStatus?.[category];
  return status && ["ready", "missing", "ambiguous", "untrusted", "incomplete"].includes(status)
    ? status
    : "incomplete";
};

const sourceRefs = (sources: SourcePage[]): ExtractedSource[] =>
  sources.map((source) => ({ url: source.url, host: source.host, label: source.label }));

function toProviderReport(
  providerMatchId: string,
  extracted: ExtractedMatchReport,
  sources: SourcePage[],
): ProviderPostMatchReport {
  const categoryStatuses = Object.fromEntries(
    CATEGORY_KEYS.map((category) => [category, safeCategoryStatus(extracted, category)]),
  ) as Record<ProviderPostMatchReportCategory, ProviderPostMatchReportCategoryStatus>;

  const possession: ProviderPossessionStat[] = extracted.possession
    .filter((stat) => stat.teamSide === "home" || stat.teamSide === "away")
    .map((stat) => ({
      teamSide: stat.teamSide as "home" | "away",
      percent: typeof stat.percent === "number" ? stat.percent : null,
      rawPayload: stat,
    }));

  const goalEvents: ProviderGoalEvent[] = extracted.goals
    .filter((goal) => (goal.teamSide === "home" || goal.teamSide === "away") && goal.playerName)
    .map((goal, index) => ({
      externalId: `google-openai:goal:${index + 1}:${goal.minute ?? "unknown"}:${normalizeName(goal.playerName ?? "unknown")}`,
      teamSide: goal.teamSide as "home" | "away",
      player: goal.playerName
        ? {
            externalId: providerPlayerId(goal.teamSide as "home" | "away", goal.teamCode, goal.playerName),
            displayName: goal.playerName,
            teamCode: goal.teamCode,
            shirtNumber: null,
          }
        : null,
      eventType: goal.eventType,
      minute: goal.minute,
      stoppageMinute: goal.stoppageMinute,
      rawPayload: goal,
    }));

  const lineups: ProviderLineupPlayer[] = extracted.lineups
    .filter((lineup) => (lineup.teamSide === "home" || lineup.teamSide === "away") && lineup.playerName)
    .map((lineup, index) => ({
      externalId: providerPlayerId(lineup.teamSide as "home" | "away", lineup.teamCode, lineup.playerName ?? `player-${index}`),
      teamSide: lineup.teamSide as "home" | "away",
      teamCode: lineup.teamCode,
      displayName: lineup.playerName ?? "Unknown player",
      shirtNumber: lineup.shirtNumber,
      position: lineup.position,
      isStarter: lineup.isStarter,
      lineupSlot: lineup.lineupSlot,
      rawPayload: lineup,
    }));

  const confidences = CATEGORY_KEYS.map((category) => extracted.categoryConfidence?.[category] ?? 0);
  const confidence = confidences.length > 0 ? Math.round(Math.max(...confidences)) : null;

  return {
    providerMatchId,
    status: extracted.status ?? (extracted.isFinal ? "finished" : "completed"),
    homeScore: typeof extracted.homeScore === "number" ? extracted.homeScore : null,
    awayScore: typeof extracted.awayScore === "number" ? extracted.awayScore : null,
    isFinal: Boolean(extracted.isFinal),
    confidence,
    fetchedAt: new Date().toISOString(),
    categoryStatuses,
    categoryConfidence: extracted.categoryConfidence,
    rawPayload: {
      provider: "openai-web-search",
      model: OPENAI_MODEL,
      sourceSelection: {
        trustedHosts: trustedDomains(),
        selectedSources: sourceRefs(sources),
      },
      extractionSchema: "openai_web_search_post_match_v1",
      categoryReasons: extracted.categoryReasons,
      agreeingSources: extracted.agreeingSources,
      conflictingSources: extracted.conflictingSources,
      extracted,
    },
    goalEvents,
    possession,
    lineups,
  };
}

export const openAiWebSearchFootballDataProvider: FootballDataProvider = {
  name: "google-openai",
  async fetchMatches(): Promise<ProviderMatch[]> {
    return [];
  },
  async fetchPostMatchReport(providerMatchId, context) {
    if (!envConfigured()) throw new OpenAiWebSearchConfigurationError();

    const { extracted, sources } = await extractWithOpenAi(context);
    return toProviderReport(providerMatchId, extracted, sources);
  },
};
