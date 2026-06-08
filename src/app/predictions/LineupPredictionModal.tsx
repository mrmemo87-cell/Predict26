"use client";

import { useMemo, useState, useTransition } from "react";
import { saveLineupPrediction } from "./actions";

export type LineupPlayer = {
  playerId: string;
  displayName: string;
  shirtNumber: number | null;
  position: string | null;
  teamCode: string;
  teamName: string;
};

type TeamSide = "home" | "away";

type LineupModalProps = {
  matchId: string;
  homeTeamName: string;
  awayTeamName: string;
  homePlayers: LineupPlayer[];
  awayPlayers: LineupPlayer[];
  initialHomePlayerIds: string[];
  initialAwayPlayerIds: string[];
  locked: boolean;
};

const POSITION_GROUPS = ["GK", "DF", "MF", "FW"] as const;
const LINEUP_SIZE = 11;

const normalizePositionGroup = (position: string | null) => {
  const normalized = position?.trim().toUpperCase() ?? "";
  if (["GK", "G", "GOALKEEPER"].includes(normalized)) return "GK";
  if (
    ["DF", "D", "DEF", "DEFENDER", "CB", "LB", "RB", "LWB", "RWB"].includes(
      normalized,
    )
  )
    return "DF";
  if (
    ["MF", "M", "MID", "MIDFIELDER", "CM", "CDM", "CAM", "LM", "RM"].includes(
      normalized,
    )
  )
    return "MF";
  if (["FW", "F", "FORWARD", "ST", "CF", "LW", "RW"].includes(normalized))
    return "FW";
  return "MF";
};

const playerLabel = (player: LineupPlayer) =>
  `${player.shirtNumber ? `${player.shirtNumber}. ` : ""}${player.displayName}`;

function PitchPreview({ players }: { players: LineupPlayer[] }) {
  const grouped = POSITION_GROUPS.map((group) =>
    players.filter(
      (player) => normalizePositionGroup(player.position) === group,
    ),
  );

  return (
    <div className="relative min-h-[320px] overflow-hidden rounded-3xl border border-white/20 bg-emerald-900 p-4 text-white shadow-inner">
      <div className="absolute inset-3 rounded-[1.5rem] border-2 border-white/25" />
      <div className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/20" />
      <div className="absolute left-1/2 top-3 h-14 w-36 -translate-x-1/2 rounded-b-3xl border-x-2 border-b-2 border-white/20" />
      <div className="absolute bottom-3 left-1/2 h-14 w-36 -translate-x-1/2 rounded-t-3xl border-x-2 border-t-2 border-white/20" />
      <div className="relative z-10 grid min-h-[288px] grid-rows-4 gap-3">
        {grouped.map((line, index) => (
          <div
            key={POSITION_GROUPS[index]}
            className="flex flex-wrap items-center justify-center gap-2"
          >
            {line.length === 0 ? (
              <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-bold text-white/60">
                {POSITION_GROUPS[index]}
              </span>
            ) : (
              line.map((player) => (
                <span
                  key={player.playerId}
                  className="max-w-[9rem] truncate rounded-full border border-white/20 bg-white/90 px-3 py-1.5 text-xs font-black text-emerald-950 shadow"
                >
                  {playerLabel(player)}
                </span>
              ))
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function PlayerPicker({
  players,
  selectedIds,
  locked,
  onToggle,
}: {
  players: LineupPlayer[];
  selectedIds: Set<string>;
  locked: boolean;
  onToggle: (playerId: string) => void;
}) {
  const groupedPlayers = POSITION_GROUPS.map((group) => ({
    group,
    players: players.filter(
      (player) => normalizePositionGroup(player.position) === group,
    ),
  }));

  return (
    <div className="space-y-4">
      {groupedPlayers.map(({ group, players: groupPlayers }) => (
        <section key={group}>
          <h4 className="mb-2 text-xs font-black uppercase tracking-[0.2em] text-emerald-700">
            {group}
          </h4>
          <div className="grid gap-2 sm:grid-cols-2">
            {groupPlayers.map((player) => {
              const selected = selectedIds.has(player.playerId);
              const disabled =
                locked || (!selected && selectedIds.size >= LINEUP_SIZE);
              return (
                <button
                  key={player.playerId}
                  type="button"
                  disabled={disabled}
                  onClick={() => onToggle(player.playerId)}
                  className={`rounded-2xl border px-3 py-2 text-left text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold ${
                    selected
                      ? "border-emerald-600 bg-emerald-50 text-emerald-900 shadow-sm"
                      : "border-gray-200 bg-white text-gray-700 hover:border-gold/60"
                  } ${disabled && !selected ? "cursor-not-allowed opacity-45 hover:border-gray-200" : ""}`}
                >
                  <span className="block truncate font-bold">
                    {playerLabel(player)}
                  </span>
                  <span className="text-xs text-gray-500">
                    {player.position ?? "Position TBA"}
                  </span>
                </button>
              );
            })}
            {groupPlayers.length === 0 && (
              <p className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500">
                No active players listed.
              </p>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

export default function LineupPredictionModal(props: LineupModalProps) {
  const [open, setOpen] = useState(false);
  const [activeSide, setActiveSide] = useState<TeamSide>("home");
  const [homeIds, setHomeIds] = useState(() =>
    props.initialHomePlayerIds.slice(0, LINEUP_SIZE),
  );
  const [awayIds, setAwayIds] = useState(() =>
    props.initialAwayPlayerIds.slice(0, LINEUP_SIZE),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const currentPlayers =
    activeSide === "home" ? props.homePlayers : props.awayPlayers;
  const selectedIds = activeSide === "home" ? homeIds : awayIds;
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedPlayers = currentPlayers.filter((player) =>
    selectedIdSet.has(player.playerId),
  );
  const hasSquads =
    props.homePlayers.length > 0 && props.awayPlayers.length > 0;
  const currentTeamName =
    activeSide === "home" ? props.homeTeamName : props.awayTeamName;

  const togglePlayer = (playerId: string) => {
    setError(null);
    const updateIds = (ids: string[]) => {
      if (ids.includes(playerId)) return ids.filter((id) => id !== playerId);
      if (ids.length >= LINEUP_SIZE) return ids;
      return [...ids, playerId];
    };

    if (activeSide === "home") setHomeIds(updateIds);
    else setAwayIds(updateIds);
  };

  const saveSide = () => {
    if (selectedIds.length !== LINEUP_SIZE) {
      setError(
        `Select exactly ${LINEUP_SIZE} players for ${currentTeamName} before saving.`,
      );
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await saveLineupPrediction(
        props.matchId,
        activeSide,
        selectedIds,
      );
      if (!result.ok) setError(result.message);
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!hasSquads}
        className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-black text-emerald-800 transition hover:border-emerald-500 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-400"
      >
        Predict starting XIs
      </button>
      {!hasSquads && (
        <p className="mt-2 text-xs text-gray-500">
          Starting XI picks unlock when both active squads are available.
        </p>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/70 p-0 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Predict starting XIs"
        >
          <div className="flex h-full w-full flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[92vh] sm:max-w-6xl sm:rounded-[2rem]">
            <header className="flex items-start justify-between gap-4 border-b border-gray-200 px-4 py-4 sm:px-6">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-700">
                  Starting XI prediction
                </p>
                <h3 className="mt-1 text-xl font-black text-gray-900">
                  {props.homeTeamName} vs {props.awayTeamName}
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  Click players to add or remove them from a simple pitch
                  preview.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full border border-gray-200 px-3 py-1.5 text-sm font-bold text-gray-600 transition hover:border-gold hover:text-gold-dark"
              >
                Close
              </button>
            </header>

            <div className="border-b border-gray-200 px-4 pt-4 sm:px-6">
              <div className="grid grid-cols-2 gap-2 rounded-2xl bg-gray-100 p-1 text-sm font-black">
                {(["home", "away"] as const).map((side) => (
                  <button
                    key={side}
                    type="button"
                    onClick={() => {
                      setActiveSide(side);
                      setError(null);
                    }}
                    className={`rounded-xl px-3 py-2 transition ${activeSide === side ? "bg-white text-emerald-800 shadow-sm" : "text-gray-500 hover:text-gray-800"}`}
                  >
                    {side === "home" ? props.homeTeamName : props.awayTeamName}{" "}
                    XI · {(side === "home" ? homeIds : awayIds).length}/
                    {LINEUP_SIZE}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid flex-1 gap-5 overflow-y-auto p-4 sm:p-6 lg:grid-cols-[1fr_1.05fr]">
              <div>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-lg font-black text-gray-900">
                      {currentTeamName}
                    </h4>
                    <p className="text-sm text-gray-500">
                      Selected {selectedIds.length}/{LINEUP_SIZE}
                    </p>
                  </div>
                  {props.locked && (
                    <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-bold text-red-700">
                      Locked read-only
                    </span>
                  )}
                </div>
                <PitchPreview players={selectedPlayers} />
              </div>

              <div className="rounded-3xl border border-gray-200 bg-gray-50 p-4">
                <PlayerPicker
                  players={currentPlayers}
                  selectedIds={selectedIdSet}
                  locked={props.locked}
                  onToggle={togglePlayer}
                />
                {error && (
                  <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                    {error}
                  </p>
                )}
                {!props.locked && (
                  <button
                    type="button"
                    onClick={saveSide}
                    disabled={isPending || selectedIds.length !== LINEUP_SIZE}
                    className="mt-4 w-full rounded-2xl bg-emerald-700 px-5 py-3 text-sm font-black text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-gray-300"
                  >
                    {isPending ? "Saving..." : `Save ${currentTeamName} XI`}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
