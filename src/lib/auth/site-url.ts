const DEFAULT_LOCAL_SITE_URL = "http://localhost:3000";
const PRODUCTION_SITE_URL = "https://predict26.live";

const trimTrailingSlashes = (value: string) => value.replace(/\/+$/, "");

const normalizeSiteUrl = (value: string) => trimTrailingSlashes(value.trim());

const isDevelopment = () => process.env.NODE_ENV === "development";

export function getSiteUrl() {
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  if (configuredSiteUrl?.trim()) {
    return normalizeSiteUrl(configuredSiteUrl);
  }

  return isDevelopment() ? DEFAULT_LOCAL_SITE_URL : PRODUCTION_SITE_URL;
}

export function getAuthCallbackUrl() {
  return `${getSiteUrl()}/auth/callback`;
}

export function getSiteRedirectUrl(path: string) {
  const safePath = path.startsWith("/") ? path : `/${path}`;
  return `${getSiteUrl()}${safePath}`;
}
