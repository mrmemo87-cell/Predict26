import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { signOut } from "@/app/auth/actions";
import Image from "next/image";

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-12">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚽</span>
            <span className="font-bold gold-text-gradient text-xl">Predict26</span>
          </div>
          <form action={signOut}>
            <button
              type="submit"
              className="text-sm text-gray-400 hover:text-white border border-surface-border px-4 py-2 rounded-full transition-colors"
            >
              Sign Out
            </button>
          </form>
        </div>

        {/* Welcome */}
        <div className="bg-surface border border-surface-border rounded-2xl p-8 mb-8">
          <div className="flex items-center gap-4 mb-6">
            {profile?.avatar_url && (
              <Image
                src={profile.avatar_url}
                alt="Avatar"
                width={64}
                height={64}
                className="w-16 h-16 rounded-full border-2 border-gold/50"
              />
            )}
            <div>
              <h1 className="text-2xl font-bold">
                Welcome, {profile?.display_name || profile?.username || "Player"}!
              </h1>
              <p className="text-gray-400 text-sm">
                {profile?.is_founder && (
                  <span className="text-gold mr-2">🏅 Founder</span>
                )}
                {profile?.country_code && profile.country_code !== "XX" && (
                  <span>Representing {profile.country_code}</span>
                )}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-background rounded-xl p-4 text-center">
              <p className="text-2xl font-bold gold-text-gradient">{profile?.points || 0}</p>
              <p className="text-xs text-gray-400 mt-1">Points</p>
            </div>
            <div className="bg-background rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-white">{profile?.country_code || "—"}</p>
              <p className="text-xs text-gray-400 mt-1">Country</p>
            </div>
            <div className="bg-background rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-white">{profile?.referral_code || "—"}</p>
              <p className="text-xs text-gray-400 mt-1">Referral Code</p>
            </div>
          </div>
        </div>

        {/* Coming soon */}
        <div className="text-center text-gray-500 py-12">
          <p className="text-lg">🏟️ Match predictions coming soon...</p>
          <p className="text-sm mt-2">The World Cup 2026 is approaching. Get ready!</p>
        </div>
      </div>
    </main>
  );
}
