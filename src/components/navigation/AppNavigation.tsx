import Link from "next/link";
import { signOut } from "@/app/auth/actions";
import { isConfiguredAdminEmail } from "@/lib/admin/permissions";
import { createClient } from "@/lib/supabase/server";
import AppNavTabs from "./AppNavTabs";

export default async function AppNavigation() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isAdmin = isConfiguredAdminEmail(user?.email);

  return (
    <header className="sticky top-0 z-50 border-b border-emerald-100 bg-gray-50/95 px-3 py-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-gray-50/80 sm:px-4">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <Link href={user ? "/dashboard" : "/"} prefetch className="flex shrink-0 items-center gap-2 rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-700 text-lg text-white shadow-sm" aria-hidden="true">⚽</span>
            <span className="text-lg font-black gold-text-gradient">Predict26</span>
          </Link>
          <div className="flex shrink-0 items-center gap-2 sm:hidden">
            {user ? (
              <form action={signOut}>
                <button type="submit" className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-black text-gray-600 shadow-sm transition hover:text-gray-950">
                  Sign out
                </button>
              </form>
            ) : (
              <Link href="/login" prefetch className="rounded-full bg-emerald-700 px-3 py-1.5 text-xs font-black text-white shadow-sm">
                Sign in
              </Link>
            )}
          </div>
        </div>

        <AppNavTabs isAdmin={isAdmin} />

        <div className="hidden shrink-0 items-center gap-2 sm:flex">
          <a href="https://t.me/Predict26Official" target="_blank" rel="noreferrer" className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-800 transition hover:bg-emerald-100">
            Telegram
          </a>
          {user ? (
            <form action={signOut}>
              <button type="submit" className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-black text-gray-600 shadow-sm transition hover:border-gold/60 hover:text-gray-950">
                Sign out
              </button>
            </form>
          ) : (
            <Link href="/login" prefetch className="rounded-full bg-emerald-700 px-4 py-2 text-sm font-black text-white shadow-sm transition hover:bg-emerald-800">
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
