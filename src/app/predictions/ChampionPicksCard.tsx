"use client";

import { useState, useTransition } from "react";
import { saveChampionPick } from "./actions";

export type ChampionTeam = {
  teamCode: string;
  teamName: string;
  flag: string | null;
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
  const [pendingPick, setPendingPick] = useState<"A" | "B" | null>(null);
  const [, startTransition] = useTransition();
  const teamsByCode = new Map(teams.map((team) => [team.teamCode, team]));

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
    setPendingPick(pickType);
    startTransition(async () => {
      const result = await saveChampionPick(pickType, teamCode);
      setMessages((current) => ({ ...current, [pickType]: result.message }));
      setPendingPick(null);
    });
  };

  const statusClass = (pick: ChampionPickState) => {
    if (pick.isOpen) return "border-emerald-200 bg-emerald-50 text-emerald-800";
    if (pick.selectedTeamCode)
      return "border-gold/30 bg-gold/10 text-gold-dark";
    if (pick.isUnavailable) return "border-gray-200 bg-gray-100 text-gray-500";
    return "border-red-200 bg-red-50 text-red-700";
  };

  return (
    <section className="mb-8 overflow-hidden rounded-3xl border border-emerald-100 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.3em] text-emerald-700">
            Tournament picks
          </p>
          <h2 className="text-2xl font-black text-gray-900">
            World Cup Champion Picks
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">
            Pick A and Pick B are separate champion selections with their own
            deadlines. They are easy to update while open, then lock in for the prize chase.
          </p>
        </div>
        <span className="w-fit rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-xs font-black text-gold-dark">
          Pick A 20 pts · Pick B 15 pts
        </span>
      </div>

      {disabledMessage && (
        <p className="mt-5 rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-500">
          {disabledMessage} The admin team will open this as soon as deadlines are ready.
        </p>
      )}

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {picks.map((pick) => {
          const selectedTeam = pick.selectedTeamCode
            ? teamsByCode.get(pick.selectedTeamCode)
            : null;
          const selectedLabel = selectedTeam
            ? `${selectedTeam.flag ? `${selectedTeam.flag} ` : ""}${selectedTeam.teamName}`
            : "None saved";
          const canChoose = pick.isOpen && teams.length > 0;

          return (
            <article
              key={pick.pickType}
              className="rounded-2xl border border-gray-200 bg-gray-50/70 p-4 shadow-inner shadow-white"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-black text-gray-900">
                    {pick.label}
                  </h3>
                  <p className="mt-1 text-xs font-semibold text-gray-500">
                    {pick.points} pts · {formatDeadline(pick.deadline)}
                  </p>
                </div>
                <span
                  className={`rounded-full border px-2.5 py-1 text-xs font-black ${statusClass(pick)}`}
                >
                  {pick.statusLabel}
                </span>
              </div>

              <div className="mt-3 grid gap-2 rounded-xl bg-white px-3 py-2 text-sm text-gray-600">
                <p>
                  Saved team:{" "}
                  <span className="font-bold text-gray-900">
                    {selectedLabel}
                  </span>
                </p>
                <p className="text-xs font-semibold text-gray-500">
                  Deadline: {formatDeadline(pick.deadline)}
                </p>
              </div>

              <div className="mt-3 space-y-3">
                <label className="block text-xs font-bold uppercase tracking-[0.16em] text-gray-500">
                  Choose champion
                  <select
                    value={selectedByType[pick.pickType]}
                    onChange={(event) =>
                      setSelectedByType((current) => ({
                        ...current,
                        [pick.pickType]: event.target.value,
                      }))
                    }
                    disabled={!canChoose}
                    className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold normal-case tracking-normal text-gray-800 outline-none transition focus:border-gold focus:ring-4 focus:ring-gold/20 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
                  >
                    <option value="">Choose champion</option>
                    {teams.map((team) => (
                      <option key={team.teamCode} value={team.teamCode}>
                        {team.flag ? `${team.flag} ` : ""}
                        {team.teamName}
                      </option>
                    ))}
                  </select>
                </label>

                {pick.isOpen ? (
                  <button
                    type="button"
                    onClick={() => savePick(pick.pickType)}
                    disabled={pendingPick === pick.pickType || !selectedByType[pick.pickType]}
                    className="rounded-xl border border-emerald-700 bg-emerald-700 px-4 py-2 text-xs font-black text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:border-gray-300 disabled:bg-gray-300"
                  >
                    {pendingPick === pick.pickType
                      ? "Saving pick..."
                      : pick.selectedTeamCode
                        ? `Update Pick ${pick.pickType}`
                        : `Save Pick ${pick.pickType}`}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="rounded-xl border border-gray-200 bg-gray-100 px-4 py-2 text-xs font-black text-gray-400"
                  >
                    {pick.isUnavailable ? "Opening soon" : "Locked"}
                  </button>
                )}
              </div>

              {!pick.isOpen && (
                <p className="mt-3 rounded-xl border border-dashed border-gray-200 bg-white px-3 py-2 text-sm text-gray-500">
                  {pick.isUnavailable
                    ? "This pick is not open for your account yet."
                    : "This pick is locked and can no longer be updated."}
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
    </section>
  );
}
