import Link from "next/link";
import PendingSubmitButton from "@/components/PendingSubmitButton";
import { PULSE_CATEGORIES, type PulsePost } from "@/lib/data/pulse";
import { requireAdminUser } from "@/lib/admin/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { deletePulsePost, savePulsePost, setPulsePostPinned, setPulsePostPublished } from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ error?: string; saved?: string; edit?: string }>;

type MatchOption = {
  id: string;
  home_team_name: string | null;
  away_team_name: string | null;
  kickoff_at: string | null;
};

const statusMessages: Record<string, string> = {
  draft: "Pulse update saved as a draft.",
  published: "Pulse update published.",
  unpublished: "Pulse update moved back to draft.",
  pinned: "Pulse update pinned.",
  unpinned: "Pulse update unpinned.",
  deleted: "Pulse update deleted.",
};

const errorMessages: Record<string, string> = {
  missing_required: "Add a title and summary before saving this Pulse update.",
  unsafe_cta: "CTA links must be a Predict26 path or a safe http/https URL.",
  unsafe_source: "Source links must be safe http/https URLs.",
  save_failed: "Could not save the Pulse update. Please review the fields and try again.",
  delete_failed: "Could not delete the Pulse update.",
  missing_post: "Choose a Pulse update first.",
};

const formatInputDate = (value: string | null | undefined) => {
  if (!value) return "Not published yet";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
};

const emptyPost = {
  id: "",
  title: "",
  summary: "",
  body: "",
  category: "Matchday",
  country_code: "",
  home_team_code: "",
  away_team_code: "",
  match_id: "",
  source_name: "",
  source_url: "",
  cta_label: "",
  cta_href: "",
  is_published: false,
  is_pinned: false,
} as const;

export default async function AdminPulsePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  await requireAdminUser("/admin/pulse");
  const supabase = createAdminClient();

  const [postsRes, matchesRes] = await Promise.all([
    supabase
      .from("pulse_posts")
      .select("id, title, summary, body, category, country_code, home_team_code, away_team_code, match_id, source_name, source_url, cta_label, cta_href, is_published, is_pinned, published_at, created_at, updated_at")
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("matches")
      .select("id, home_team_name, away_team_name, kickoff_at")
      .order("kickoff_at", { ascending: true, nullsFirst: false })
      .limit(120),
  ]);

  const posts = (postsRes.data ?? []) as PulsePost[];
  const matches = (matchesRes.data ?? []) as MatchOption[];
  const editing = posts.find((post) => post.id === params.edit) ?? null;
  const formPost = editing ?? emptyPost;

  return (
    <main className="min-h-screen bg-gray-50 bg-[radial-gradient(circle_at_top_left,rgba(22,163,74,0.10),transparent_32%)] px-4 py-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">Admin</p>
            <h1 className="mt-2 text-3xl font-black text-gray-950">World Cup Pulse</h1>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              Create short, useful updates that point players back to predictions, leaderboards, Champion Picks, and Telegram.
            </p>
          </div>
          <Link href="/admin" prefetch className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-black text-gray-700 shadow-sm transition hover:border-gold/60">
            Back to admin
          </Link>
        </div>

        {params.saved && statusMessages[params.saved] && (
          <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-900">
            {statusMessages[params.saved]}
          </div>
        )}
        {params.error && (
          <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">
            {errorMessages[params.error] ?? "Pulse update could not be saved."}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-xl font-black text-gray-950">
              {editing ? "Edit Pulse update" : "Create Pulse update"}
            </h2>
            <form action={savePulsePost} className="mt-5 space-y-4">
              <input type="hidden" name="post_id" value={formPost.id} />
              <label className="block text-sm font-bold text-gray-800">
                Title
                <input name="title" defaultValue={formPost.title} required className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-emerald-500" />
              </label>
              <label className="block text-sm font-bold text-gray-800">
                Summary
                <textarea name="summary" defaultValue={formPost.summary} required rows={3} className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-emerald-500" />
              </label>
              <label className="block text-sm font-bold text-gray-800">
                Body
                <textarea name="body" defaultValue={formPost.body ?? ""} rows={5} className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-emerald-500" />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-bold text-gray-800">
                  Category
                  <select name="category" defaultValue={formPost.category} className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-emerald-500">
                    {PULSE_CATEGORIES.map((category) => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-bold text-gray-800">
                  Related match
                  <select name="match_id" defaultValue={formPost.match_id ?? ""} className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-emerald-500">
                    <option value="">No match</option>
                    {matches.map((match) => (
                      <option key={match.id} value={match.id}>
                        {(match.home_team_name ?? "Team TBA")} vs {(match.away_team_name ?? "Team TBA")}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <label className="block text-sm font-bold text-gray-800">Country code<input name="country_code" defaultValue={formPost.country_code ?? ""} placeholder="USA" className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm uppercase outline-none transition focus:border-emerald-500" /></label>
                <label className="block text-sm font-bold text-gray-800">Home team code<input name="home_team_code" defaultValue={formPost.home_team_code ?? ""} placeholder="MEX" className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm uppercase outline-none transition focus:border-emerald-500" /></label>
                <label className="block text-sm font-bold text-gray-800">Away team code<input name="away_team_code" defaultValue={formPost.away_team_code ?? ""} placeholder="CAN" className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm uppercase outline-none transition focus:border-emerald-500" /></label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-bold text-gray-800">Source name<input name="source_name" defaultValue={formPost.source_name ?? ""} placeholder="FIFA" className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-emerald-500" /></label>
                <label className="block text-sm font-bold text-gray-800">Source URL<input name="source_url" defaultValue={formPost.source_url ?? ""} placeholder="https://..." className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-emerald-500" /></label>
                <label className="block text-sm font-bold text-gray-800">CTA label<input name="cta_label" defaultValue={formPost.cta_label ?? ""} placeholder="Predict this match" className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-emerald-500" /></label>
                <label className="block text-sm font-bold text-gray-800">CTA href<input name="cta_href" defaultValue={formPost.cta_href ?? ""} placeholder="/predictions" className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-emerald-500" /></label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm font-bold text-gray-800">
                  <input type="checkbox" name="is_pinned" defaultChecked={formPost.is_pinned} className="h-4 w-4 accent-emerald-700" />
                  Pin this update
                </label>
                <label className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm font-bold text-gray-800">
                  <input type="checkbox" name="is_published" defaultChecked={formPost.is_published} className="h-4 w-4 accent-emerald-700" />
                  Publish update
                </label>
              </div>

              <div className="flex flex-wrap gap-3">
                <PendingSubmitButton idleText={editing ? "Save Pulse update" : "Create Pulse update"} pendingText="Saving Pulse update..." className="rounded-full bg-emerald-700 px-5 py-3 text-sm font-black text-white transition hover:bg-emerald-800" />
                {editing && <Link href="/admin/pulse" className="rounded-full border border-gray-200 bg-white px-5 py-3 text-sm font-black text-gray-700 transition hover:border-gold/60">Start a new update</Link>}
              </div>
            </form>
          </section>

          <section className="space-y-4">
            {posts.map((post) => (
              <article key={post.id} className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap gap-2 text-xs font-black uppercase tracking-[0.16em]">
                      <span className={post.is_published ? "rounded-full bg-emerald-50 px-3 py-1 text-emerald-800" : "rounded-full bg-gray-100 px-3 py-1 text-gray-600"}>
                        {post.is_published ? "Published" : "Draft"}
                      </span>
                      {post.is_pinned && <span className="rounded-full bg-gold/15 px-3 py-1 text-gold-dark">Pinned</span>}
                      <span className="rounded-full bg-gray-100 px-3 py-1 text-gray-600">{post.category}</span>
                    </div>
                    <h3 className="mt-3 text-lg font-black text-gray-950">{post.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-gray-600">{post.summary}</p>
                    <p className="mt-2 text-xs font-semibold text-gray-500">Published: {formatInputDate(post.published_at)}</p>
                  </div>
                  <Link href={`/admin/pulse?edit=${post.id}`} className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-black text-gray-700 transition hover:border-gold/60">Edit</Link>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <form action={setPulsePostPublished}>
                    <input type="hidden" name="post_id" value={post.id} />
                    <input type="hidden" name="is_published" value={post.is_published ? "false" : "true"} />
                    <PendingSubmitButton idleText={post.is_published ? "Unpublish" : "Publish update"} pendingText="Updating..." className="rounded-full bg-emerald-700 px-4 py-2 text-xs font-black text-white transition hover:bg-emerald-800" />
                  </form>
                  <form action={setPulsePostPinned}>
                    <input type="hidden" name="post_id" value={post.id} />
                    <input type="hidden" name="is_pinned" value={post.is_pinned ? "false" : "true"} />
                    <PendingSubmitButton idleText={post.is_pinned ? "Unpin" : "Pin this update"} pendingText="Updating..." className="rounded-full border border-gold/30 bg-gold/10 px-4 py-2 text-xs font-black text-gold-dark transition hover:bg-gold/20" />
                  </form>
                  <form action={deletePulsePost}>
                    <input type="hidden" name="post_id" value={post.id} />
                    <PendingSubmitButton idleText="Delete" pendingText="Deleting..." className="rounded-full border border-red-200 bg-red-50 px-4 py-2 text-xs font-black text-red-700 transition hover:bg-red-100" />
                  </form>
                </div>
              </article>
            ))}
            {posts.length === 0 && (
              <div className="rounded-3xl border border-dashed border-emerald-200 bg-white p-8 text-center text-sm text-gray-600">
                No Pulse updates yet. Create a draft to get started.
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
