interface NewsItem {
  id: string;
  title: string;
  created_at: string;
}

interface NewsFeedProps {
  news: NewsItem[];
}

function formatNewsDate(dateStr: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(dateStr));
}

export default function NewsFeed({ news }: NewsFeedProps) {
  if (news.length === 0) {
    return (
      <section className="rounded-3xl border border-surface-border bg-surface p-6 sm:p-8">
        <h2 className="mb-4 text-lg font-bold text-white">📰 Latest News</h2>
        <p className="text-center text-gray-400">No news available yet.</p>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-surface-border bg-surface p-6 sm:p-8">
      <h2 className="mb-5 text-lg font-bold text-white">📰 Latest News</h2>
      <div className="space-y-3">
        {news.map((item) => (
          <article
            key={item.id}
            className="rounded-2xl border border-surface-border bg-background/60 p-4 transition hover:border-gold/30"
          >
            <h3 className="text-sm font-semibold text-white">{item.title}</h3>
            <p className="mt-1 text-xs text-gray-500">{formatNewsDate(item.created_at)}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
