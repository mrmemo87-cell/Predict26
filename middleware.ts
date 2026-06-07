import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const getRuntimeEnv = (key: string) => process.env[key] ?? "";
const protectedPaths = ["/dashboard", "/predictions", "/leaderboard", "/onboarding"];
const publicPaths = ["/", "/login", "/auth/callback"];
const staticAssetPattern = /\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|xml)$/i;

const isPublicPath = (pathname: string) =>
  publicPaths.includes(pathname) ||
  pathname.startsWith("/_next/static") ||
  pathname.startsWith("/_next/image") ||
  staticAssetPattern.test(pathname);

export async function middleware(request: NextRequest) {
  if (isPublicPath(request.nextUrl.pathname)) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    getRuntimeEnv("NEXT_PUBLIC_SUPABASE_URL"),
    getRuntimeEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isProtected = protectedPaths.some((path) => request.nextUrl.pathname.startsWith(path));

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirectTo", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|xml)$).*)"],
};
