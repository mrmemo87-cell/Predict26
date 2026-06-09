"use client";

import { useMemo, useState } from "react";
import PendingSubmitButton from "@/components/PendingSubmitButton";
import { deleteTestParticipants, resetPredictionsAndScores } from "./actions";

export type CleanupCounts = {
  predictions: number;
  possession: number;
  scorers: number;
  lineups: number;
  lineupPlayers: number;
  championPicks: number;
  ledgerRows: number;
  scoringRuns: number;
  profiles: number;
  leaderboardRows: number;
};

export type CleanupParticipant = {
  id: string;
  username: string | null;
  displayName: string | null;
  email: string | null;
  countryCode: string | null;
  points: number | null;
  isCurrentAdmin: boolean;
  isConfiguredAdmin: boolean;
};

type AdminCleanupToolsProps = {
  counts: CleanupCounts;
  participants: CleanupParticipant[];
};

const RESET_CONFIRMATION = "RESET PREDICT26 TEST DATA";
const DELETE_CONFIRMATION = "DELETE TEST PARTICIPANTS";

const countItems: Array<[keyof CleanupCounts, string]> = [
  ["predictions", "Exact score predictions"],
  ["possession", "Possession picks"],
  ["scorers", "Scorer picks"],
  ["lineups", "Lineup cards"],
  ["lineupPlayers", "Lineup players"],
  ["championPicks", "Champion picks"],
  ["ledgerRows", "Ledger rows"],
  ["scoringRuns", "Scoring runs"],
  ["profiles", "Profiles to reset"],
  ["leaderboardRows", "Leaderboard rows"],
];

export default function AdminCleanupTools({
  counts,
  participants,
}: AdminCleanupToolsProps) {
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const filteredParticipants = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return participants;

    return participants.filter((participant) =>
      [
        participant.username,
        participant.displayName,
        participant.email,
        participant.countryCode,
        participant.id,
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(term)),
    );
  }, [participants, search]);

  const toggleParticipant = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <section id="testing-cleanup" className="mt-8 rounded-3xl border border-rose-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.24em] text-rose-700">
            Testing Cleanup
          </p>
          <h2 className="mt-2 text-2xl font-black text-gray-900">
            Reset trial data safely
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">
            These tools remove test prediction activity only. Fixtures, teams,
            squads, stadiums, tournament settings, champion settings, and admin
            access stay untouched.
          </p>
        </div>
        <span className="w-fit rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-black text-rose-700">
          Typed confirmation required
        </span>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {countItems.map(([key, label]) => (
          <div key={key} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500">
              {label}
            </p>
            <p className="mt-2 text-3xl font-black text-gray-900">
              {counts[key].toLocaleString()}
            </p>
          </div>
        ))}
      </div>

      <form action={resetPredictionsAndScores} className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-4">
        <label className="block text-sm font-bold text-rose-950">
          Reset predictions and scores
          <span className="mt-1 block font-normal leading-6 text-rose-900">
            Type <span className="font-mono font-black">{RESET_CONFIRMATION}</span> to clear prediction picks, scoring rows, profile points/stats, and leaderboard ranks.
          </span>
          <input
            name="confirmation"
            autoComplete="off"
            className="mt-3 w-full rounded-xl border border-rose-200 bg-white px-3 py-2 font-mono text-sm outline-none transition focus:border-rose-500 focus:ring-4 focus:ring-rose-100"
            placeholder={RESET_CONFIRMATION}
            required
          />
        </label>
        <PendingSubmitButton
          idleText="Reset predictions and scores"
          pendingText="Resetting test data..."
          className="mt-4 rounded-full bg-rose-700 px-5 py-3 text-sm font-black text-white transition hover:bg-rose-800"
        />
      </form>

      <div className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-black text-gray-900">
              Delete test participants
            </h3>
            <p className="mt-1 text-sm leading-6 text-gray-600">
              Removes selected app profile/data only. Supabase Auth users are not
              deleted by this tool.
            </p>
          </div>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search participants"
            className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm outline-none transition focus:border-gold focus:ring-4 focus:ring-gold/20"
          />
        </div>

        <form action={deleteTestParticipants} className="mt-4">
          {[...selectedIds].map((id) => (
            <input key={id} type="hidden" name="participant_ids" value={id} />
          ))}
          <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
            {filteredParticipants.map((participant) => {
              const protectedParticipant = participant.isCurrentAdmin || participant.isConfiguredAdmin;
              return (
                <label
                  key={participant.id}
                  className={`flex items-center gap-3 rounded-2xl border bg-white p-3 text-sm ${protectedParticipant ? "border-amber-200 opacity-70" : "border-gray-200"}`}
                >
                  <input
                    type="checkbox"
                    disabled={protectedParticipant}
                    checked={selectedIds.has(participant.id)}
                    onChange={() => toggleParticipant(participant.id)}
                    className="h-4 w-4 accent-rose-700 disabled:cursor-not-allowed"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold text-gray-900">
                      {participant.displayName || participant.username || participant.email || participant.id}
                    </span>
                    <span className="block truncate text-xs text-gray-500">
                      {participant.email ?? "Email hidden"} · {participant.countryCode ?? "No country"} · {participant.points ?? 0} pts
                    </span>
                  </span>
                  {protectedParticipant && (
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-amber-800">
                      Protected admin
                    </span>
                  )}
                </label>
              );
            })}
            {filteredParticipants.length === 0 && (
              <p className="rounded-2xl border border-dashed border-gray-200 bg-white p-4 text-center text-sm text-gray-500">
                No matching participants.
              </p>
            )}
          </div>

          <label className="mt-4 block text-sm font-bold text-gray-900">
            Confirmation
            <span className="mt-1 block font-normal leading-6 text-gray-600">
              Type <span className="font-mono font-black">{DELETE_CONFIRMATION}</span> to delete the selected app profiles and their app data.
            </span>
            <input
              name="confirmation"
              autoComplete="off"
              className="mt-3 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 font-mono text-sm outline-none transition focus:border-rose-500 focus:ring-4 focus:ring-rose-100"
              placeholder={DELETE_CONFIRMATION}
              required
            />
          </label>
          <PendingSubmitButton
            idleText={`Delete selected participants (${selectedIds.size})`}
            pendingText="Deleting participants..."
            disabled={selectedIds.size === 0}
            className="mt-4 rounded-full border border-rose-200 bg-white px-5 py-3 text-sm font-black text-rose-700 transition hover:border-rose-500 hover:bg-rose-50"
          />
        </form>
      </div>
    </section>
  );
}
