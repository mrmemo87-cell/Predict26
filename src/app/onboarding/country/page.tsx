import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { saveCountry } from "./actions";

type Country = {
  code: string;
  name: string;
  flag_emoji: string | null;
};

const priorityCodes = ["KG", "KZ", "UZ", "RU", "KGZ", "KAZ", "UZB", "RUS"];

export default async function CountryOnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/onboarding/country");
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
    .select("code, name, flag_emoji")
    .in("code", priorityCodes)
    .order("name", { ascending: true });

  const orderedCountries = (countries ?? []).sort(
    (a: Country, b: Country) => priorityCodes.indexOf(a.code) - priorityCodes.indexOf(b.code),
  );

  return (
    <main className="min-h-screen px-4 py-8 sm:py-12">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-lg flex-col justify-center">
        <div className="mb-8 text-center">
          <div className="mb-4 text-4xl">🏆</div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.35em] text-gold">Country battle</p>
          <h1 className="text-3xl font-bold sm:text-4xl">
            Choose your <span className="gold-text-gradient">team</span>
          </h1>
          <p className="mt-4 text-sm leading-6 text-gray-400">
            Pick the country you will represent on Predict26. You can start making match predictions right after this.
          </p>
        </div>

        {params.error && (
          <div className="mb-5 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
            Could not save your country. Please choose one of the available countries and try again.
          </div>
        )}

        <form action={saveCountry} className="space-y-3 rounded-3xl border border-surface-border bg-surface/90 p-4 shadow-2xl shadow-gold/5 sm:p-6">
          {orderedCountries.map((country: Country) => (
            <label
              key={country.code}
              className="group flex cursor-pointer items-center gap-4 rounded-2xl border border-surface-border bg-background/70 p-4 transition hover:border-gold/60 hover:bg-gold/5 has-[:checked]:border-gold has-[:checked]:bg-gold/10"
            >
              <input type="radio" name="country_code" value={country.code} className="peer sr-only" required />
              <span className="text-3xl" aria-hidden="true">{country.flag_emoji ?? "🌍"}</span>
              <span className="flex-1">
                <span className="block font-semibold text-white">{country.name}</span>
                <span className="text-xs uppercase tracking-[0.25em] text-gray-500">{country.code}</span>
              </span>
              <span className="h-5 w-5 rounded-full border border-surface-border transition group-hover:border-gold peer-checked:border-gold peer-checked:bg-gold" />
            </label>
          ))}

          <button type="submit" className="mt-5 w-full rounded-full gold-gradient px-6 py-4 font-bold text-black transition hover:scale-[1.01]">
            Continue to dashboard
          </button>
        </form>
      </div>
    </main>
  );
}
