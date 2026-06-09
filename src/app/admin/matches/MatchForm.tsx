"use client";

import Link from "next/link";
import PendingSubmitButton from "@/components/PendingSubmitButton";
import type { FormEvent } from "react";
import { useMemo, useState } from "react";

import type { CompetitionRow, MatchRow, StadiumRow } from "./page";

type MatchFormProps = {
  competitions: CompetitionRow[];
  stadiums: StadiumRow[];
  editingMatch: MatchRow | null;
  defaultCompetitionId: string;
  saveAction: (formData: FormData) => Promise<void>;
};

const STATUS_OPTIONS = ["scheduled", "live", "in_progress", "completed", "finished", "postponed", "cancelled"];
const SCORE_ALLOWED_STATUSES = new Set(["live", "in_progress", "completed", "finished"]);

const formatDateTimeLocal = (value: string | null | undefined) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 16);
};

const statusLabel = (status: string) => {
  if (status === "in_progress") return "in progress (live)";
  if (status === "completed") return "completed (legacy finished)";
  return status;
};

const isNonNegativeInteger = (value: string) => /^\d+$/.test(value);

export default function MatchForm({
  competitions,
  stadiums,
  editingMatch,
  defaultCompetitionId,
  saveAction,
}: MatchFormProps) {
  const initialStatus = editingMatch?.status ?? "scheduled";
  const [status, setStatus] = useState(initialStatus);
  const scoresAllowed = SCORE_ALLOWED_STATUSES.has(status);
  const [homeScore, setHomeScore] = useState(
    SCORE_ALLOWED_STATUSES.has(initialStatus) && editingMatch?.home_score !== null && editingMatch?.home_score !== undefined
      ? String(editingMatch.home_score)
      : ""
  );
  const [awayScore, setAwayScore] = useState(
    SCORE_ALLOWED_STATUSES.has(initialStatus) && editingMatch?.away_score !== null && editingMatch?.away_score !== undefined
      ? String(editingMatch.away_score)
      : ""
  );
  const [scoreError, setScoreError] = useState<string | null>(null);

  const scoreHelperText = useMemo(() => {
    if (!scoresAllowed) return "Scores are only available for live or finished matches.";
    return "Enter both scores as non-negative whole numbers for live or finished matches.";
  }, [scoresAllowed]);

  const handleStatusChange = (nextStatus: string) => {
    setStatus(nextStatus);
    setScoreError(null);
    if (!SCORE_ALLOWED_STATUSES.has(nextStatus)) {
      setHomeScore("");
      setAwayScore("");
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    setScoreError(null);

    if (!scoresAllowed) {
      return;
    }

    if (!homeScore || !awayScore) {
      event.preventDefault();
      setScoreError("Enter both scores before saving a live or finished match.");
      return;
    }

    if (!isNonNegativeInteger(homeScore) || !isNonNegativeInteger(awayScore)) {
      event.preventDefault();
      setScoreError("Scores must be non-negative whole numbers.");
    }
  };

  return (
    <form action={saveAction} onSubmit={handleSubmit} className="mt-6 grid gap-4 md:grid-cols-2">
      <input type="hidden" name="match_id" value={editingMatch?.id ?? ""} />

      <label className="text-sm font-semibold text-gray-700">
        Competition
        <select name="competition_id" defaultValue={defaultCompetitionId} className="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-gray-900">
          {competitions.map((competition) => (
            <option key={competition.id} value={competition.id}>{competition.name}</option>
          ))}
        </select>
      </label>

      <label className="text-sm font-semibold text-gray-700">
        Stadium
        <select name="stadium_id" defaultValue={editingMatch?.stadium_id ?? ""} className="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-gray-900">
          <option value="">No stadium assigned</option>
          {stadiums.map((stadium) => (
            <option key={stadium.id} value={stadium.id}>{stadium.name} · {stadium.city}</option>
          ))}
        </select>
      </label>

      <label className="text-sm font-semibold text-gray-700">
        Home team
        <input name="home_team_name" required defaultValue={editingMatch?.home_team_name ?? ""} className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 text-gray-900" />
      </label>

      <label className="text-sm font-semibold text-gray-700">
        Away team
        <input name="away_team_name" required defaultValue={editingMatch?.away_team_name ?? ""} className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 text-gray-900" />
      </label>

      <label className="text-sm font-semibold text-gray-700">
        Home code
        <input name="home_team_code" defaultValue={editingMatch?.home_team_code ?? ""} className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 text-gray-900" />
      </label>

      <label className="text-sm font-semibold text-gray-700">
        Away code
        <input name="away_team_code" defaultValue={editingMatch?.away_team_code ?? ""} className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 text-gray-900" />
      </label>

      <label className="text-sm font-semibold text-gray-700">
        Kickoff time
        <input name="kickoff_at" type="datetime-local" required defaultValue={formatDateTimeLocal(editingMatch?.kickoff_at)} className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 text-gray-900" />
      </label>

      <label className="text-sm font-semibold text-gray-700">
        Status
        <select name="status" value={status} onChange={(event) => handleStatusChange(event.target.value)} className="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-gray-900">
          {STATUS_OPTIONS.map((option) => <option key={option} value={option}>{statusLabel(option)}</option>)}
        </select>
      </label>

      <div className="md:col-span-2 rounded-2xl border border-gray-100 bg-gray-50 p-4">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm font-semibold text-gray-700">
            Home score
            <input
              name="home_score"
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              value={homeScore}
              onChange={(event) => setHomeScore(event.target.value)}
              disabled={!scoresAllowed}
              required={scoresAllowed}
              className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 text-gray-900 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
            />
          </label>

          <label className="text-sm font-semibold text-gray-700">
            Away score
            <input
              name="away_score"
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              value={awayScore}
              onChange={(event) => setAwayScore(event.target.value)}
              disabled={!scoresAllowed}
              required={scoresAllowed}
              className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 text-gray-900 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
            />
          </label>
        </div>
        <p className="mt-3 text-xs font-medium text-gray-500">{scoreHelperText}</p>
        {scoreError && <p className="mt-2 text-xs font-semibold text-red-600">{scoreError}</p>}
      </div>

      <label className="text-sm font-semibold text-gray-700">
        Venue override
        <input name="venue" defaultValue={editingMatch?.venue ?? ""} className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 text-gray-900" />
      </label>

      <label className="text-sm font-semibold text-gray-700">
        City override
        <input name="city" defaultValue={editingMatch?.city ?? ""} className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 text-gray-900" />
      </label>

      <label className="text-sm font-semibold text-gray-700">
        Match number
        <input name="match_number" type="number" min="1" defaultValue={editingMatch?.match_number ?? ""} className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 text-gray-900" />
      </label>

      <label className="text-sm font-semibold text-gray-700">
        Stage
        <input name="stage" defaultValue={editingMatch?.stage ?? "group"} className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 text-gray-900" />
      </label>

      <div className="flex items-end gap-3 md:col-span-2">
        <PendingSubmitButton
          idleText="Save match"
          pendingText="Saving match..."
          className="rounded-full bg-gold px-6 py-3 text-sm font-bold text-black shadow-lg shadow-gold/20 transition hover:-translate-y-0.5"
        />
        {editingMatch && <Link href="/admin/matches" className="rounded-full border border-gray-200 px-6 py-3 text-sm font-bold text-gray-700 transition hover:border-gold hover:text-gold">Cancel edit</Link>}
      </div>
    </form>
  );
}
