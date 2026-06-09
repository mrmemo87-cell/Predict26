"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

type LottieMeta = {
  nm?: string;
  fr?: number;
  op?: number;
  w?: number;
  h?: number;
  layers?: unknown[];
};

function LottieWorldCupHeroInner() {
  const [meta, setMeta] = useState<LottieMeta | null>(null);

  useEffect(() => {
    let mounted = true;

    import("@/lib/fifa-world-cup.json")
      .then((module) => {
        if (mounted) setMeta(module.default as LottieMeta);
      })
      .catch(() => {
        if (mounted) setMeta({ nm: "World Cup 2026" });
      });

    return () => {
      mounted = false;
    };
  }, []);

  const frameCount = Math.max(1, Math.round((meta?.op ?? 133) - 1));
  const seconds = Math.max(4, Math.round(frameCount / (meta?.fr ?? 25)));

  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-[2rem] border border-white/70 bg-gradient-to-br from-emerald-700 via-emerald-500 to-gold/80 p-4 shadow-2xl shadow-emerald-900/20 sm:p-6">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(255,255,255,0.45),transparent_24%),radial-gradient(circle_at_70%_75%,rgba(255,255,255,0.28),transparent_26%)]" />
      <div className="absolute inset-4 rounded-[1.5rem] border border-white/25" />
      <div className="absolute left-1/2 top-1/2 h-36 w-36 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/25 sm:h-48 sm:w-48" />
      <div
        className="absolute inset-x-8 bottom-10 h-3 rounded-full bg-emerald-950/25 blur-md"
        aria-hidden="true"
      />

      <div className="relative z-10 flex h-full flex-col items-center justify-center text-center text-white">
        <div
          className="relative h-36 w-36 sm:h-48 sm:w-48"
          style={{ animationDuration: `${seconds}s` }}
          aria-hidden="true"
        >
          <div className="absolute inset-0 animate-[spin_18s_linear_infinite] rounded-full border-[10px] border-white/25 border-t-white/80" />
          <div className="absolute inset-7 animate-[pulse_2.8s_ease-in-out_infinite] rounded-full bg-white shadow-2xl">
            <div className="absolute inset-4 rounded-full bg-[radial-gradient(circle_at_35%_30%,#ffffff_0_18%,#10b981_19%_31%,#064e3b_32%_44%,#d4af37_45%_58%,#ffffff_59%)]" />
            <div className="absolute inset-x-5 top-1/2 h-3 -translate-y-1/2 rounded-full bg-emerald-800/80" />
            <div className="absolute left-1/2 top-5 h-[calc(100%-2.5rem)] w-3 -translate-x-1/2 rounded-full bg-gold/90" />
          </div>
        </div>

        <p className="mt-5 text-xs font-black uppercase tracking-[0.32em] text-white/80">
          {meta?.nm ?? "Loading World Cup motion"}
        </p>
        <h2 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
          Predict26
        </h2>
        <p className="mt-2 max-w-xs text-sm font-semibold leading-6 text-white/90">
          A lightweight World Cup motion moment powered by the bundled Lottie asset.
        </p>
      </div>
    </div>
  );
}

const LottieWorldCupHero = dynamic(
  () => Promise.resolve(LottieWorldCupHeroInner),
  {
    ssr: false,
    loading: () => (
      <div className="aspect-square w-full rounded-[2rem] border border-emerald-100 bg-emerald-50 shadow-xl shadow-emerald-900/10" />
    ),
  },
);

export default LottieWorldCupHero;
