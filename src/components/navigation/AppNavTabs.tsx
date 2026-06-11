"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/dashboard", label: "Dashboard", match: ["/dashboard"] },
  { href: "/predictions", label: "Predictions", match: ["/predictions"] },
  { href: "/leaderboard", label: "Leaderboard", match: ["/leaderboard"] },
  { href: "/pulse", label: "Pulse", match: ["/pulse"] },
  { href: "/rules", label: "Rules", match: ["/rules"] },
] as const;

function isActive(pathname: string, href: string, match: readonly string[]) {
  if (href === "/dashboard" && pathname === "/") return true;
  return match.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export default function AppNavTabs({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const allTabs = isAdmin
    ? [...tabs, { href: "/admin", label: "Admin", match: ["/admin"] }]
    : tabs;

  return (
    <nav aria-label="Predict26 main navigation" className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="flex min-w-max items-center gap-1 rounded-full border border-gray-200 bg-white/85 p-1 shadow-sm backdrop-blur">
        {allTabs.map((tab) => {
          const active = isActive(pathname, tab.href, tab.match);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              prefetch
              aria-current={active ? "page" : undefined}
              className={`whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-black transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold sm:px-4 ${
                active
                  ? "bg-emerald-700 text-white shadow-sm"
                  : "text-gray-600 hover:bg-emerald-50 hover:text-emerald-900"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
