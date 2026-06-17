"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import StatusChip from "@/components/ui/StatusChip";
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

const formatDeadline = (deadline: string | null, compact = false) => {
  if (!deadline) return compact ? "TBA" : "Deadline TBA";
  try {
    return new Intl.DateTimeFormat("en", compact ? { month: "short", day: "numeric" } : {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(deadline));
  } catch {
    return compact ? "TBA" : "Deadline TBA";
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

  const statusTone = (pick: ChampionPickState) => {
    if (!pick.isOpen && !pick.selectedTeamCode) return pick.isUnavailable ? "gray" : "red";
    if (!pick.isOpen) return "gray";
    return pick.selectedTeamCode ? "green" : "blue";
  };

  const shortStatus = (pick: ChampionPickState) => {
    if (pick.isOpen && pick.selectedTeamCode) return "Saved";
    if (pick.isOpen) return "Open";
    if (pick.selectedTeamCode) return "Locked";
    return pick.isUnavailable ? "Soon" : "Locked";
  };

  return (
    <section className="mb-5 overflow-hidden rounded-3xl border border-emerald-100 bg-white p-3 shadow-sm sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-3 px-1">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.24em] text-emerald-700">
            Champion picks
          </p>
        </div>
        <Link href="/rules" className="text-xs font-black text-gold-dark hover:text-gold">
          Rules
        </Link>
      </div>

      {disabledMessage && (
        <p className="mb-3 rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-3 py-2 text-xs font-bold text-gray-500">
          {disabledMessage}
        </p>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {picks.map((pick) => {
          const selectedTeam = pick.selectedTeamCode
            ? teamsByCode.get(pick.selectedTeamCode)
            : null;
          const selectedLabel = selectedTeam
            ? `${selectedTeam.flag ? `${selectedTeam.flag} ` : ""}${selectedTeam.teamName}`
            : pick.pickType === "A"
              ? "Choose champion"
              : "Choose backup";
          const canChoose = pick.isOpen && teams.length > 0;

          return (
            <details
              key={pick.pickType}
              className="group rounded-2xl border border-gray-200 bg-gray-50/80 p-3 shadow-inner shadow-white open:bg-white"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
                <div className="min-w-0">
                  <p className="text-xs font-black text-gray-500">
                    Pick {pick.pickType} · {pick.points} pts
                  </p>
                  <p className="mt-1 truncate text-sm font-black text-gray-900">
                    {selectedLabel}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusChip label={shortStatus(pick)} tone={statusTone(pick)} />
                  <span className="rounded-full border border-gray-200 bg-white px-2 py-1 text-xs font-black text-gray-600 group-open:hidden">
                    Edit
                  </span>
                  <span className="hidden rounded-full border border-gray-200 bg-white px-2 py-1 text-xs font-black text-gray-600 group-open:inline-flex">
                    Close
                  </span>
                </div>
              </summary>

              <div className="mt-3 space-y-3 border-t border-gray-100 pt-3">
                <div className="flex flex-wrap gap-2">
                  <StatusChip label={`Locks ${formatDeadline(pick.deadline, true)}`} tone={pick.isOpen ? "amber" : "gray"} />
                  <StatusChip label={pick.points === 20 ? "20 pts" : "15 pts"} tone="gold" />
                </div>
                <label className="block text-xs font-bold uppercase tracking-[0.16em] text-gray-500">
                  Team
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
                    <option value="">{pick.pickType === "A" ? "Choose champion" : "Choose backup"}</option>
                    {teams.map((team) => (
                      <option key={team.teamCode} value={team.teamCode}>
                        {team.flag ? `${team.flag} ` : ""}
                        {team.teamName}
                      </option>
                    ))}
                  </select>
                </label>

                <p className="text-xs font-semibold text-gray-500">
                  Full deadline: {formatDeadline(pick.deadline)}
                </p>

                {pick.isOpen ? (
                  <button
                    type="button"
                    onClick={() => savePick(pick.pickType)}
                    disabled={pendingPick === pick.pickType || !selectedByType[pick.pickType]}
                    className="rounded-xl border border-emerald-700 bg-emerald-700 px-4 py-2 text-xs font-black text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:border-gray-300 disabled:bg-gray-300"
                  >
                    {pendingPick === pick.pickType ? "Saving..." : "Save"}
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
                {messages[pick.pickType] && (
                  <p className="text-sm font-semibold text-emerald-700">
                    {messages[pick.pickType]}
                  </p>
                )}
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}
