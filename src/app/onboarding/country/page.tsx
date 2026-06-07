import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { saveCountry } from "./actions";
import CountrySelector from "./CountrySelector";

export default async function CountryOnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const errorMessages: Record<string, string> = {
    save_failed: "Could not save your country. Please try again.",
    invalid_country: "Please choose one of the available countries.",
    session_required: "Please sign in again.",
  };
  const errorMessage = params.error ? errorMessages[params.error] : null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?error=session_required");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("country_code")
    .eq("id", user.id)
    .single();

  if (profile?.country_code) {
    redirect("/dashboard");
  }

  const { data: countries } = await supabase
    .from("countries")
    .select("code, name, flag_emoji, confederation")
    .eq("is_active", true)
    .order("name", { ascending: true });

  return (
    <main className="min-h-screen bg-white px-4 py-8 sm:py-12">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-lg flex-col justify-center">
        <div className="mb-8 text-center">
          <div className="mb-4 text-4xl">🏆</div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.35em] text-gold">Country battle</p>
          <h1 className="text-3xl font-bold text-gray-900 sm:text-4xl">
            Choose your <span className="gold-text-gradient">team</span>
          </h1>
          <p className="mt-4 text-sm leading-6 text-gray-500">
            Pick the country you will represent on Predict26. You can start making match predictions right after this.
          </p>
        </div>

        {errorMessage && (
          <div className="mb-5 rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        <CountrySelector countries={countries ?? []} saveAction={saveCountry} />
      </div>
    </main>
  );
}
