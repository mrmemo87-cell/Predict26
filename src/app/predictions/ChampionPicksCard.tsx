"use client";

import { useState, useTransition } from "react";
import { saveChampionPick } from "./actions";

export type ChampionTeam = {
  teamCode: string;
  teamName: string;
};

export type ChampionPickState = {
  pickType: "A" | "B";
  label: string;
  points: number;
  deadline: string | null;
  selectedTeamCode: string | null;
  isOpen: boolean;
  isUnavailable: boolean;
  statusLabel: string;
};

type ChampionPicksCardProps = {
  teams: ChampionTeam[];
  picks: ChampionPickState[];
  disabledMessage: string | null;
};

const formatDeadline = (deadline: string | null) => {
  if (!deadline) return "Deadline TBA";
  try {
    return new Intl.DateTimeFormat("en", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(deadline));
  } catch {
    return "Deadline TBA";
  }
};

export default function ChampionPicksCard({
  teams,
  picks,
  disabledMessage,
}: ChampionPicksCardProps) {
  const [selectedByType, setSelectedByType] = useState<
    Record<"A" | "B", string>
  >({
    A: picks.find((pick) => pick.pickType === "A")?.selectedTeamCode ?? "",
    B: picks.find((pick) => pick.pickType === "B")?.selectedTeamCode ?? "",
  });
  const [messages, setMessages] = useState<Partial<Record<"A" | "B", string>>>(
    {},
  );
  const [isPending, startTransition] = useTransition();
  const teamsByCode = new Map(
    teams.map((team) => [team.teamCode, team.teamName]),
  );

  const savePick = (pickType: "A" | "B") => {
    const teamCode = selectedByType[pickType];
    if (!teamCode) {
      setMessages((current) => ({
        ...current,
        [pickType]: "Choose a team before saving.",
      }));
      return;
    }

    setMessages((current) => ({ ...current, [pickType]: undefined }));
    startTransition(async () => {
      const result = await saveChampionPick(pickType, teamCode);
      setMessages((current) => ({ ...current, [pickType]: result.message }));
    });
  };

  return (
    <section className="mb-8 overflow-hidden rounded-3xl border border-emerald-100 bg-white p-6 shadow-sm sm:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.3em] text-emerald-700">
            Tournament picks
          </p>
          <h2 className="text-2xl font-black text-gray-900">
            Champion Pick A/B
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">
            Pick the World Cup champion before each configured deadline. These
            picks are saved now but are not scored yet.
          </p>
        </div>
        <span className="w-fit rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-xs font-black text-gold-dark">
          A: 20 pts · B: 15 pts
        </span>
      </div>

      {disabledMessage ? (
        <p className="mt-5 rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-500">
          {disabledMessage}
        </p>
      ) : (
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {picks.map((pick) => {
            const selectedTeam = pick.selectedTeamCode
              ? (teamsByCode.get(pick.selectedTeamCode) ??
                pick.selectedTeamCode)
              : "None saved";
            return (
              <article
                key={pick.pickType}
                className="rounded-2xl border border-gray-200 bg-gray-50/70 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-black text-gray-900">
                      {pick.label}
                    </h3>
                    <p className="mt-1 text-xs font-semibold text-gray-500">
                      {pick.points} pts later · deadline{" "}
                      {formatDeadline(pick.deadline)}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-black ${pick.isOpen ? "border border-emerald-200 bg-emerald-50 text-emerald-800" : "border border-gray-200 bg-white text-gray-500"}`}
                  >
                    {pick.statusLabel}
                  </span>
                </div>

                <p className="mt-3 rounded-xl bg-white px-3 py-2 text-sm text-gray-600">
                  Selected team:{" "}
                  <span className="font-bold text-gray-900">
                    {selectedTeam}
                  </span>
                </p>

                {pick.isOpen ? (
                  <div className="mt-3 space-y-3">
                    <select
                      value={selectedByType[pick.pickType]}
                      onChange={(event) =>
                        setSelectedByType((current) => ({
                          ...current,
                          [pick.pickType]: event.target.value,
                        }))
                      }
                      className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-800 outline-none transition focus:border-gold focus:ring-4 focus:ring-gold/20"
                    >
                      <option value="">Choose champion</option>
                      {teams.map((team) => (
                        <option key={team.teamCode} value={team.teamCode}>
                          {team.teamName}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => savePick(pick.pickType)}
                      disabled={isPending || !selectedByType[pick.pickType]}
                      className="rounded-xl border border-emerald-700 bg-emerald-700 px-4 py-2 text-xs font-black text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:border-gray-300 disabled:bg-gray-300"
                    >
                      {isPending ? "Saving..." : `Save Pick ${pick.pickType}`}
                    </button>
                  </div>
                ) : (
                  <p className="mt-3 rounded-xl border border-dashed border-gray-200 bg-white px-3 py-2 text-sm text-gray-500">
                    {pick.isUnavailable
                      ? "This pick is unavailable for your join time or current configuration."
                      : "This pick is locked."}
                  </p>
                )}
                {messages[pick.pickType] && (
                  <p className="mt-3 text-sm font-semibold text-emerald-700">
                    {messages[pick.pickType]}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
