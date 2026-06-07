type HeaderGetter = {
  get(name: string): string | null;
};

const DEFAULT_LOCAL_SITE_URL = "http://localhost:3000";

const trimTrailingSlash = (value: string) => value.replace(/\/$/, "");

export function getSiteOriginFromHeaders(headersList: HeaderGetter) {
  const forwardedHost = headersList.get("x-forwarded-host");
  const host = forwardedHost ?? headersList.get("host");
  const forwardedProto = headersList.get("x-forwarded-proto");
  const protocol = forwardedProto ?? (process.env.NODE_ENV === "development" ? "http" : "https");

  if (host) {
    return `${protocol}://${host}`;
  }

  return trimTrailingSlash(process.env.NEXT_PUBLIC_SITE_URL ?? DEFAULT_LOCAL_SITE_URL);
}

export function getRedirectUrl(request: Request, path: string) {
  const requestUrl = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const protocol = forwardedProto ?? (process.env.NODE_ENV === "development" ? "http" : "https");

  if (host) {
    return `${protocol}://${host}${path}`;
  }

  return `${requestUrl.origin}${path}`;
}
