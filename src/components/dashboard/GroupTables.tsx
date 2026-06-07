import type { GroupTeam } from "@/lib/data/groups";

interface GroupTablesProps {
  groups: Record<string, GroupTeam[]>;
  userCountryCode: string;
}

export default function GroupTables({ groups, userCountryCode }: GroupTablesProps) {
  const groupNames = Object.keys(groups).sort();

  if (groupNames.length === 0) {
    return null;
  }

  return (
    <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm sm:p-8">
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold">Tournament</p>
        <h2 className="mt-1 text-lg font-bold text-gray-900">Groups</h2>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {groupNames.map((groupName) => {
          const teams = groups[groupName];
          return (
            <div
              key={groupName}
              className="rounded-2xl border border-gray-200 bg-gray-50 p-4"
            >
              <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-gray-700">
                Group {groupName}
              </h3>
              <div className="space-y-2">
                {teams.map((team) => {
                  const isUser =
                    userCountryCode &&
                    team.country_code.toUpperCase() === userCountryCode.toUpperCase();
                  return (
                    <div
                      key={team.country_code}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2 ${
                        isUser
                          ? "border border-gold/50 bg-gold/10"
                          : "bg-white"
                      }`}
                    >
                      <span className="text-xl">{team.flag_emoji ?? "🌍"}</span>
                      <span className={`text-sm font-medium ${isUser ? "text-gold font-bold" : "text-gray-800"}`}>
                        {team.country_name}
                      </span>
                      {isUser && (
                        <span className="ml-auto text-[10px] font-bold uppercase text-gold">You</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
