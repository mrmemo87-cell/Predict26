"use client";

import { useState } from "react";

interface Match {
  id: string;
  home_team: string;
  away_team: string;
  kickoff_at: string;
  status: string;
  result: string | null;
  home_score: number | null;
  away_score: number | null;
  stadium_id: string | null;
  competition_id: string;
}

interface Stadium {
  id: string;
  name: string;
  city: string;
}

interface Props {
  initialMatches: Match[];
  stadiums: Stadium[];
}

export function MatchManagerPanel({ initialMatches, stadiums }: Props) {
  const [matches, setMatches] = useState<Match[]>(initialMatches);
  const [editing, setEditing] = useState<Match | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function saveMatch(formData: FormData) {
    setSaving(true);
    setMessage("");

    const body = {
      id: formData.get("id") as string | null,
      home_team: formData.get("home_team") as string,
      away_team: formData.get("away_team") as string,
      kickoff_at: formData.get("kickoff_at") as string,
      status: formData.get("status") as string,
      home_score: formData.get("home_score")
        ? Number(formData.get("home_score"))
        : null,
      away_score: formData.get("away_score")
        ? Number(formData.get("away_score"))
        : null,
      stadium_id: (formData.get("stadium_id") as string) || null,
    };

    const res = await fetch("/api/admin/matches", {
      method: body.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const result = await res.json();

    if (!res.ok) {
      setMessage(result.error ?? "Failed to save");
    } else {
      setMessage("Saved successfully");
      if (body.id) {
        setMatches((prev) =>
          prev.map((m) => (m.id === body.id ? { ...m, ...body } : m))
        );
      } else if (result.match) {
        setMatches((prev) => [...prev, result.match]);
      }
      setEditing(null);
    }

    setSaving(false);
  }

  return (
    <div>
      {message && (
        <p className="mb-4 rounded bg-blue-100 p-2 text-sm text-blue-900">
          {message}
        </p>
      )}

      <button
        className="mb-4 rounded bg-green-600 px-4 py-2 text-white hover:bg-green-700"
        onClick={() =>
          setEditing({
            id: "",
            home_team: "",
            away_team: "",
            kickoff_at: "",
            status: "scheduled",
            result: null,
            home_score: null,
            away_score: null,
            stadium_id: null,
            competition_id: "",
          })
        }
      >
        + Add Match
      </button>

      {editing && (
        <form
          className="mb-6 rounded border p-4 space-y-3"
          action={saveMatch}
        >
          {editing.id && <input type="hidden" name="id" value={editing.id} />}
          <div className="grid grid-cols-2 gap-3">
            <input
              name="home_team"
              placeholder="Home Team"
              defaultValue={editing.home_team}
              required
              className="border rounded px-2 py-1"
            />
            <input
              name="away_team"
              placeholder="Away Team"
              defaultValue={editing.away_team}
              required
              className="border rounded px-2 py-1"
            />
          </div>
          <input
            name="kickoff_at"
            type="datetime-local"
            defaultValue={editing.kickoff_at?.slice(0, 16)}
            required
            className="border rounded px-2 py-1 w-full"
          />
          <div className="grid grid-cols-3 gap-3">
            <select
              name="status"
              defaultValue={editing.status}
              className="border rounded px-2 py-1"
            >
              <option value="scheduled">Scheduled</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="postponed">Postponed</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <input
              name="home_score"
              type="number"
              min={0}
              placeholder="Home Score"
              defaultValue={editing.home_score ?? ""}
              className="border rounded px-2 py-1"
            />
            <input
              name="away_score"
              type="number"
              min={0}
              placeholder="Away Score"
              defaultValue={editing.away_score ?? ""}
              className="border rounded px-2 py-1"
            />
          </div>
          <select
            name="stadium_id"
            defaultValue={editing.stadium_id ?? ""}
            className="border rounded px-2 py-1 w-full"
          >
            <option value="">-- Select Stadium --</option>
            {stadiums.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.city})
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="rounded border px-4 py-2 hover:bg-gray-100"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">Home</th>
            <th>Away</th>
            <th>Kickoff</th>
            <th>Status</th>
            <th>Score</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {matches.map((m) => (
            <tr key={m.id} className="border-b">
              <td className="py-2">{m.home_team}</td>
              <td>{m.away_team}</td>
              <td>{new Date(m.kickoff_at).toLocaleString()}</td>
              <td>{m.status}</td>
              <td>
                {m.home_score !== null && m.away_score !== null
                  ? `${m.home_score} - ${m.away_score}`
                  : "–"}
              </td>
              <td>
                <button
                  onClick={() => setEditing(m)}
                  className="text-blue-600 hover:underline"
                >
                  Edit
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
