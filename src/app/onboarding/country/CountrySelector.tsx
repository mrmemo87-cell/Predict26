"use client";

import { useState } from "react";

type Country = {
  code: string;
  name: string;
  flag_emoji: string | null;
  confederation: string | null;
};

interface CountrySelectorProps {
  countries: Country[];
  saveAction: (formData: FormData) => Promise<void>;
}

export default function CountrySelector({ countries, saveAction }: CountrySelectorProps) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const filtered = countries.filter((c) => {
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.code.toLowerCase().includes(q)
    );
  });

  return (
    <form action={saveAction} className="space-y-4 rounded-3xl border border-gray-200 bg-white p-4 shadow-lg sm:p-6">
      <input type="hidden" name="country_code" value={selected ?? ""} />

      <div className="relative">
        <input
          type="text"
          placeholder="Search by country name or code..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-gold focus:ring-2 focus:ring-gold/20"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        )}
      </div>

      <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
        {filtered.length === 0 && (
          <p className="py-8 text-center text-sm text-gray-400">No countries found.</p>
        )}
        {filtered.map((country) => (
          <label
            key={country.code}
            className={`group flex cursor-pointer items-center gap-4 rounded-2xl border p-4 transition hover:border-gold/60 hover:bg-gold/5 ${
              selected === country.code
                ? "border-gold bg-gold/10"
                : "border-gray-200 bg-gray-50"
            }`}
          >
            <input
              type="radio"
              name="country_code_radio"
              value={country.code}
              checked={selected === country.code}
              onChange={() => setSelected(country.code)}
              className="sr-only"
            />
            <span className="text-3xl" aria-hidden="true">{country.flag_emoji ?? "🌍"}</span>
            <span className="flex-1 min-w-0">
              <span className="block font-semibold text-gray-900">{country.name}</span>
              <span className="flex items-center gap-2 text-xs text-gray-500">
                <span className="uppercase tracking-wider">{country.code}</span>
                {country.confederation && (
                  <>
                    <span>•</span>
                    <span>{country.confederation}</span>
                  </>
                )}
              </span>
            </span>
            <span
              className={`h-5 w-5 rounded-full border transition ${
                selected === country.code
                  ? "border-gold bg-gold"
                  : "border-gray-300 group-hover:border-gold"
              }`}
            />
          </label>
        ))}
      </div>

      <button
        type="submit"
        disabled={!selected}
        className="mt-4 w-full rounded-full gold-gradient px-6 py-4 font-bold text-black transition hover:scale-[1.01] disabled:opacity-50 disabled:hover:scale-100"
      >
        Continue to dashboard
      </button>
    </form>
  );
}
