import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { MatchManagerPanel } from "./MatchManagerPanel";

export const dynamic = "force-dynamic";

export default async function AdminMatchesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Basic admin check – expand to a proper roles table in production
  const adminEmails = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim());
  if (!adminEmails.includes(user.email ?? "")) {
    redirect("/dashboard");
  }

  const { data: matches } = await supabase
    .from("matches")
    .select("*")
    .order("kickoff_at", { ascending: true });

  const { data: stadiums } = await supabase.from("stadiums").select("*");

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Admin – Match Manager</h1>
      <MatchManagerPanel
        initialMatches={matches ?? []}
        stadiums={stadiums ?? []}
      />
    </main>
  );
}
