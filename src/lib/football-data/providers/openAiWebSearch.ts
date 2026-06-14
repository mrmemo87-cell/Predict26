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
const OPENAI_MODEL = process.env.OPENAI_WEB_SEARCH_MODEL ?? "gpt-5-mini";
const TRUSTED_SOURCE_LIMIT = 5;

const TRUSTED_SOURCES = [
  { host: "fifa.com", label: "FIFA", priority: 100 },
  { host: "www.fifa.com", label: "FIFA", priority: 100 },
  { host: "espn.com", label: "ESPN", priority: 90 },
  { host: "www.espn.com", label: "ESPN", priority: 90 },
  { host: "bbc.com", label: "BBC Sport", priority: 85 },
  { host: "www.bbc.com", label: "BBC Sport", priority: 85 },
  { host: "bbc.co.uk", label: "BBC Sport", priority: 85 },
  { host: "www.bbc.co.uk", label: "BBC Sport", priority: 85 },
  { host: "reuters.com", label: "Reuters", priority: 80 },
  { host: "www.reuters.com", label: "Reuters", priority: 80 },
  { host: "apnews.com", label: "AP", priority: 78 },
  { host: "www.apnews.com", label: "AP", priority: 78 },
  { host: "skysports.com", label: "Sky Sports", priority: 75 },
  { host: "www.skysports.com", label: "Sky Sports", priority: 75 },
  { host: "sofascore.com", label: "SofaScore", priority: 72 },
  { host: "www.sofascore.com", label: "SofaScore", priority: 72 },
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
  reason = "openai_api_key_missing" as const;

  constructor() {
    super("openai_api_key_missing: OPENAI_API_KEY is not configured.");
    this.name = "OpenAiWebSearchConfigurationError";
  }
}

export class OpenAiWebSearchProviderError extends Error {
  constructor(
    public readonly reason:
      | "openai_request_failed"
      | "openai_web_search_no_sources"
      | "openai_extraction_failed"
      | "final_score_missing"
      | "final_score_conflict",
    message: string,
  ) {
    super(`${reason}: ${message}`);
    this.name = "OpenAiWebSearchProviderError";
  }
}

export const isOpenAiWebSearchConfigurationError = (error: unknown) =>
  error instanceof OpenAiWebSearchConfigurationError;

export const openAiWebSearchErrorReason = (error: unknown) => {
  if (error instanceof OpenAiWebSearchConfigurationError) return error.reason;
  if (error instanceof OpenAiWebSearchProviderError) return error.reason;
  return null;
};


type OpenAiErrorResponseBody = {
  error?: {
    code?: string | null;
    message?: string | null;
    param?: string | null;
    type?: string | null;
  };
};

type OpenAiRequestMode = "primary" | "fallback";

type OpenAiResponsePayload = {
  output_text?: string;
  output?: Array<WebSearchOutputItem & { content?: Array<ResponseContentItem> }>;
};

type ResponseContentItem = {
  text?: string;
  annotations?: Array<{
    type?: string;
    url?: string;
    title?: string;
  }>;
};

const sanitizeOpenAiErrorValue = (value: unknown) =>
  typeof value === "string"
    ? value
        .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [redacted]")
        .replace(/sk-[A-Za-z0-9_-]+/g, "[redacted-openai-api-key]")
        .slice(0, 1000)
    : null;

const parseOpenAiErrorBody = (rawBody: string): OpenAiErrorResponseBody => {
  try {
    const parsed = JSON.parse(rawBody) as OpenAiErrorResponseBody;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return { error: { message: rawBody.slice(0, 1000) } };
  }
};

const formatOpenAiHttpError = (status: number, rawBody: string) => {
  const parsed = parseOpenAiErrorBody(rawBody);
  const error = parsed.error ?? {};
  const details = {
    status,
    code: sanitizeOpenAiErrorValue(error.code),
    message: sanitizeOpenAiErrorValue(error.message),
    param: sanitizeOpenAiErrorValue(error.param),
    type: sanitizeOpenAiErrorValue(error.type),
  };
  const parts = [
    `Responses API returned HTTP ${details.status}`,
    details.message ? `message: ${details.message}` : null,
    details.code ? `code: ${details.code}` : null,
    details.param ? `param: ${details.param}` : null,
    details.type ? `type: ${details.type}` : null,
  ].filter(Boolean);
  return { details, message: parts.join("; ") };
};

const openAiRequestBody = (context: ProviderPostMatchReportContext | undefined, mode: OpenAiRequestMode) => ({
  model: OPENAI_MODEL,
  tools: [
    mode === "primary"
      ? {
          type: "web_search",
          filters: { allowed_domains: trustedDomains() },
        }
      : { type: "web_search" },
  ],
  input: [
    { role: "system", content: extractionInstructions(context) },
    {
      role: "user",
      content:
        mode === "primary"
          ? `Find trusted public post-match sources for ${matchLabel(context)} using the category-specific queries from the system message. Run separate searches for exact_result, possession, goal_events, lineup_home, and lineup_away. Compare sources and return only the structured JSON requested.`
          : `Search the public web for trusted post-match sources for ${matchLabel(context)}. Prefer these plain domains: ${trustedDomains().join(", ")}. Return JSON only, with source URLs in every sourceUrls/agreeingSources/conflictingSources array.`,
    },
  ],
});

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

const teamName = (value: string | null | undefined, fallback: string) => value?.trim() || fallback;

const matchLabel = (context?: ProviderPostMatchReportContext) => {
  if (!context) return "World Cup 2026 match";
  const home = teamName(context.homeTeamName, context.homeTeamCode ?? "Home team");
  const away = teamName(context.awayTeamName, context.awayTeamCode ?? "Away team");
  return `${home} vs ${away} ${context.kickoffAt?.slice(0, 10) ?? "World Cup 2026"}`;
};

const categorySearchQueries = (context?: ProviderPostMatchReportContext) => {
  const home = teamName(context?.homeTeamName, context?.homeTeamCode ?? "Home team");
  const away = teamName(context?.awayTeamName, context?.awayTeamCode ?? "Away team");
  return {
    exact_result: [
      `${home} vs ${away} World Cup 2026 final score`,
      `${home} ${away} World Cup 2026 ESPN final score`,
      `${home} ${away} Reuters match report final score`,
      `${home} ${away} FIFA match report`,
    ],
    possession: [
      `${home} vs ${away} possession stats World Cup 2026`,
      `${home} ${away} match stats possession`,
      `${home} ${away} FIFA stats possession`,
      `${home} ${away} ESPN stats possession`,
    ],
    goal_events: [
      `${home} ${away} goals scorers World Cup 2026`,
      `${home} vs ${away} match report goals`,
      `${home} ${away} FIFA highlights goals`,
      `${home} ${away} goal scorers ESPN`,
      `${home} ${away} Sky Sports goals`,
      `${home} ${away} SofaScore goals`,
    ],
    lineup_home: [
      `${home} ${away} starting lineups World Cup 2026`,
      `${home} vs ${away} lineups`,
      `${home} ${away} confirmed starting XI`,
      `${home} ${away} FIFA lineups`,
      `${home} ${away} ESPN lineups`,
      `${home} ${away} SofaScore lineups`,
    ],
    lineup_away: [
      `${home} ${away} starting lineups World Cup 2026`,
      `${home} vs ${away} lineups`,
      `${home} ${away} confirmed starting XI`,
      `${home} ${away} FIFA lineups`,
      `${home} ${away} ESPN lineups`,
      `${home} ${away} SofaScore lineups`,
    ],
  } satisfies Record<ProviderPostMatchReportCategory, string[]>;
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

Trusted public sources: ${trustedSourceLabels()}. Prefer FIFA, then ESPN, Reuters, AP, BBC Sport, Sky Sports, SofaScore, and official federation/confederation pages. Search across the trusted domains allowed by the web_search tool. Treat UZ and UZB as the same Uzbekistan team code when matching teams or player sources. If URL capture is not possible, still name each trusted source used in agreeingSources/conflictingSources.

Confidence rules:
- Final score is ready when two named trusted sources agree, even if possession, lineups, scorer-player mapping, or web_search action.sources are incomplete. FIFA alone is also acceptable only when clear and no source conflicts.
- Scorers are ready only when goal scorers are confidently extracted from trusted match reports. For every goal, extract the scorer player name, team side/team code, minute when available, whether it was a penalty, whether it was an own goal, and sourceUrls or named trusted sources. Include normal goals and penalty goals. Label own goals as own_goal so scorer-pick scoring can exclude them. If a trusted source names a scorer but URLs are not captured, put the trusted source name in sourceUrls/agreeingSources rather than dropping the scorer.
- Possession is ready only when a trusted source gives both teams' possession percentages. Totals of 99, 100, or 101 are acceptable because of rounding; significant source disagreement must mark possession ambiguous.
- A lineup side is ready only when exactly 11 starters are found for that team. Return all extracted starters even if confidence or mapping may be incomplete; do not silently discard extracted XI data. If exactly 11 names are found but any names may need internal mapping review, still return the names and mark only that lineup side incomplete. Add warnings/reasons explaining no trusted lineup source, too few/many extracted starters, or uncertain names.
- Mark only the uncertain/conflicting category ambiguous, missing, untrusted, or incomplete; do not downgrade other categories.
- Never use a Google sports widget, Google Custom Search, paid sports API, client-side key, or unsourced knowledge.

Match context: ${JSON.stringify(context ?? {})}

Search these exact category-specific queries before extracting:
${Object.entries(categorySearchQueries(context)).map(([category, queries]) => `${category}:\n${queries.map((query) => `- ${query}`).join("\n")}`).join("\n")}
`;

const responseText = (payload: { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> }) =>
  payload.output_text ?? payload.output?.flatMap((item) => item.content ?? []).map((content) => content.text ?? "").join("") ?? "";

type WebSearchSource = {
  url?: string;
  title?: string;
  snippet?: string;
};

type WebSearchOutputItem = {
  type?: string;
  action?: {
    sources?: WebSearchSource[];
  };
};

const sourceFromTrustedName = (value: string): SourcePage | null => {
  const normalized = normalizeName(value);
  if (!normalized) return null;
  const match = TRUSTED_SOURCES.find((source) => {
    const sourceName = normalizeName(`${source.label} ${source.host}`);
    return sourceName.includes(normalized) || normalized.includes(normalizeName(source.label)) || normalized.includes(normalizeName(source.host));
  });
  if (!match) return null;
  return {
    url: `uncaptured:${match.host}`,
    title: `${match.label} (URL not captured)`,
    host: match.host.replace(/^www\./, ""),
    label: match.label,
    priority: match.priority,
  };
};

const toTrustedSourcePage = (source: WebSearchSource): SourcePage | null => {
  const url = source.url ?? "";
  const host = hostForUrl(url);
  const trusted = trustedSourceForHost(host);
  if (!url || !trusted) return sourceFromTrustedName(`${source.title ?? ""} ${source.snippet ?? ""}`);
  return {
    url,
    title: source.title ?? "Untitled source",
    snippet: source.snippet,
    host,
    label: trusted.label,
    priority: trusted.priority,
  };
};

const urlsInText = (text: string): WebSearchSource[] =>
  Array.from(text.matchAll(/https?:\/\/[^\s"'<>),]+/g)).map((match) => ({ url: match[0] }));

const sourceStringsFromExtraction = (extracted: ExtractedMatchReport): string[] => [
  ...Object.values(extracted.agreeingSources ?? {}).flat(),
  ...Object.values(extracted.conflictingSources ?? {}).flat(),
  ...(extracted.goals ?? []).flatMap((goal) => goal.sourceUrls ?? []),
  ...(extracted.possession ?? []).flatMap((stat) => stat.sourceUrls ?? []),
  ...(extracted.lineups ?? []).flatMap((lineup) => lineup.sourceUrls ?? []),
];

const responseSources = (payload: OpenAiResponsePayload, text: string, extracted?: ExtractedMatchReport): SourcePage[] => {
  const responseCandidates = (payload.output ?? []).flatMap((item) => [
    ...(item.action?.sources ?? []),
    ...((item.content ?? []).flatMap((content) => content.annotations ?? []) as WebSearchSource[]),
    ...((item.content ?? []).flatMap((content) => urlsInText(content.text ?? "")) as WebSearchSource[]),
  ]);
  const extractedCandidates = extracted
    ? sourceStringsFromExtraction(extracted).map((value) => ({ url: value, title: value }))
    : [];
  const textCandidates = urlsInText(text);
  const normalizedText = normalizeName(text);
  const namedTextCandidates = TRUSTED_SOURCES.filter(
    (source) => normalizedText.includes(normalizeName(source.label)) || normalizedText.includes(normalizeName(source.host)),
  ).map((source) => ({ title: `${source.label} ${source.host}` }));

  return [...responseCandidates, ...textCandidates, ...extractedCandidates, ...namedTextCandidates]
    .map(toTrustedSourcePage)
    .filter((source): source is SourcePage => Boolean(source))
    .sort((left, right) => right.priority - left.priority)
    .filter((item, index, items) => items.findIndex((candidate) => candidate.url === item.url || candidate.label === item.label) === index)
    .slice(0, TRUSTED_SOURCE_LIMIT);
};

const trustedSourceCountForExact = (extracted: ExtractedMatchReport) => {
  const exactSources = (extracted.agreeingSources?.exact_result ?? [])
    .map((source) => toTrustedSourcePage({ url: source, title: source }) ?? sourceFromTrustedName(source))
    .filter((source): source is SourcePage => Boolean(source));
  return new Set(exactSources.map((source) => source.label)).size;
};

const extractionReviewStatus = (sources: SourcePage[], extracted: ExtractedMatchReport) =>
  sources.some((source) => source.url.startsWith("uncaptured:"))
    ? "sources_uncaptured_but_answered"
    : extracted.isFinal && typeof extracted.homeScore === "number" && typeof extracted.awayScore === "number"
      ? "extraction_needs_review"
      : "sources_captured";

async function requestOpenAiExtraction(key: string, context: ProviderPostMatchReportContext | undefined, mode: OpenAiRequestMode) {
  const response = await fetch(OPENAI_RESPONSES_ENDPOINT, {
    method: "POST",
    cache: "no-store",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(openAiRequestBody(context, mode)),
  });

  if (!response.ok) {
    const error = formatOpenAiHttpError(response.status, await response.text());
    throw new OpenAiWebSearchProviderError("openai_request_failed", error.message);
  }

  return (await response.json()) as OpenAiResponsePayload;
}

async function extractWithOpenAi(context?: ProviderPostMatchReportContext) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new OpenAiWebSearchConfigurationError();

  let payload: OpenAiResponsePayload;
  try {
    payload = await requestOpenAiExtraction(key, context, "primary");
  } catch (error) {
    if (!(error instanceof OpenAiWebSearchProviderError) || error.reason !== "openai_request_failed" || !error.message.includes("HTTP 400")) {
      throw error;
    }
    payload = await requestOpenAiExtraction(key, context, "fallback");
  }
  const text = responseText(payload);
  if (!text) throw new OpenAiWebSearchProviderError("openai_extraction_failed", "Responses API returned an empty extraction response.");

  try {
    const extracted = JSON.parse(text) as ExtractedMatchReport;
    const sources = responseSources(payload, text, extracted);
    return { extracted, sources };
  } catch (error) {
    throw new OpenAiWebSearchProviderError(
      "openai_extraction_failed",
      error instanceof Error ? error.message : "Could not parse structured extraction JSON.",
    );
  }
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
  if (extracted.categoryStatus?.exact_result === "ambiguous" || (extracted.conflictingSources?.exact_result ?? []).length > 0) {
    throw new OpenAiWebSearchProviderError("final_score_conflict", "Trusted sources conflict on the final score.");
  }

  if (extracted.isFinal && (typeof extracted.homeScore !== "number" || typeof extracted.awayScore !== "number")) {
    throw new OpenAiWebSearchProviderError("final_score_missing", "The match appears final but no complete final score was extracted.");
  }

  const exactFallbackReady =
    extracted.isFinal &&
    typeof extracted.homeScore === "number" &&
    typeof extracted.awayScore === "number" &&
    (extracted.conflictingSources?.exact_result ?? []).length === 0 &&
    trustedSourceCountForExact(extracted) >= 2;

  const categoryStatuses = Object.fromEntries(
    CATEGORY_KEYS.map((category) => [
      category,
      category === "exact_result" && exactFallbackReady ? "ready" : safeCategoryStatus(extracted, category),
    ]),
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
        extractionStatus: extractionReviewStatus(sources, extracted),
        sourceCapture: sources.some((source) => source.url.startsWith("uncaptured:")) ? "url_capture_failed_named_sources_found" : "urls_captured",
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

export const openAiWebSearchDebugMexicoSouthAfrica = () => {
  const context: ProviderPostMatchReportContext = {
    matchId: "debug-mexico-south-africa",
    competitionCode: "WC2026",
    homeTeamName: "Mexico",
    awayTeamName: "South Africa",
    homeTeamCode: "MEX",
    awayTeamCode: "RSA",
    homeCountryCode: "MEX",
    awayCountryCode: "ZAF",
    kickoffAt: "2026-06-11T00:00:00Z",
  };
  return {
    context,
    expected: { homeScore: 2, awayScore: 0, scorers: ["Julián Quiñones", "Raúl Jiménez"] },
    queries: categorySearchQueries(context),
    trustedDomains: trustedDomains(),
    prompt: extractionInstructions(context),
  };
};

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
