import type { GroupTeam } from "@/lib/data/groups";

interface GroupTablesProps {
  groups: Record<string, GroupTeam[]>;
  userCountryCode: string;
}

type StandingRow = GroupTeam & {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
};

const columns = ["#", "Team", "MP", "W", "D", "L", "GF", "GA", "GD", "Pts"];

const toDefaultStandingRows = (teams: GroupTeam[]): StandingRow[] =>
  teams.map((team) => ({
    ...team,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0,
  }));

export default function GroupTables({
  groups,
  userCountryCode,
}: GroupTablesProps) {
  const groupNames = Object.keys(groups).sort();

  if (groupNames.length === 0) {
    return null;
  }

  return (
    <section className="rounded-3xl border border-emerald-100 bg-white p-5 shadow-sm sm:p-8">
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-700">
            Tournament standings
          </p>
          <h2 className="mt-1 text-xl font-black text-gray-900">
            World Cup 2026 groups
          </h2>
        </div>
        <p className="max-w-xl text-sm leading-6 text-gray-600">
          Tables are prepared from the loaded group/team data. Stats stay at 0
          until official results are available. Swipe sideways on small screens
          to see every column.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {groupNames.map((groupName) => {
          const standings = toDefaultStandingRows(groups[groupName]);

          return (
            <article
              key={groupName}
              className="overflow-hidden rounded-2xl border border-gray-200 bg-gray-50 shadow-sm"
            >
              <div className="flex items-center justify-between border-b border-gray-200 bg-emerald-700 px-4 py-3 text-white">
                <h3 className="text-sm font-black uppercase tracking-[0.2em]">
                  Group {groupName}
                </h3>
                <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold">
                  {standings.length} teams
                </span>
              </div>

              <div
                className="overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
                role="region"
                aria-label={`Group ${groupName} standings`}
                tabIndex={0}
              >
                <table className="min-w-[720px] w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-white text-xs uppercase tracking-[0.16em] text-gray-500">
                      {columns.map((column) => (
                        <th
                          key={column}
                          scope="col"
                          className={`px-3 py-3 font-black ${column === "Team" ? "min-w-52" : "text-center"}`}
                        >
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {standings.map((team, index) => {
                      const isUser = Boolean(
                        userCountryCode &&
                        team.country_code.toUpperCase() ===
                          userCountryCode.toUpperCase(),
                      );

                      return (
                        <tr
                          key={team.country_code}
                          className={
                            isUser ? "bg-gold/10" : "hover:bg-emerald-50/60"
                          }
                        >
                          <td className="px-3 py-3 text-center font-black text-gray-700">
                            {index + 1}
                          </td>
                          <th scope="row" className="px-3 py-3">
                            <span className="flex min-w-0 items-center gap-3">
                              {team.flag_emoji && (
                                <span className="text-xl" aria-hidden="true">
                                  {team.flag_emoji}
                                </span>
                              )}
                              <span className="min-w-0">
                                <span className="block truncate font-bold text-gray-900">
                                  {team.country_name}
                                </span>
                                <span className="text-xs font-bold uppercase tracking-[0.14em] text-gray-500">
                                  {team.country_code}
                                </span>
                              </span>
                              {isUser && (
                                <span className="ml-auto rounded-full bg-gold px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-black">
                                  You
                                </span>
                              )}
                            </span>
                          </th>
                          <td className="px-3 py-3 text-center font-semibold text-gray-700">
                            {team.played}
                          </td>
                          <td className="px-3 py-3 text-center font-semibold text-gray-700">
                            {team.won}
                          </td>
                          <td className="px-3 py-3 text-center font-semibold text-gray-700">
                            {team.drawn}
                          </td>
                          <td className="px-3 py-3 text-center font-semibold text-gray-700">
                            {team.lost}
                          </td>
                          <td className="px-3 py-3 text-center font-semibold text-gray-700">
                            {team.goalsFor}
                          </td>
                          <td className="px-3 py-3 text-center font-semibold text-gray-700">
                            {team.goalsAgainst}
                          </td>
                          <td className="px-3 py-3 text-center font-semibold text-gray-700">
                            {team.goalDifference}
                          </td>
                          <td className="px-3 py-3 text-center text-base font-black text-gold-dark">
                            {team.points}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
