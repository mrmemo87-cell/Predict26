import { getSiteRedirectUrl } from "@/lib/auth/site-url";

export function getRedirectUrl(_request: Request, path: string) {
  return getSiteRedirectUrl(path);
}
