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
      <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
        <h2 className="mb-4 text-lg font-bold text-gray-900">📰 Latest News</h2>
        <p className="text-center text-gray-500">No tournament updates yet. Check back soon.</p>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
      <h2 className="mb-5 text-lg font-bold text-gray-900">📰 Latest News</h2>
      <div className="space-y-3">
        {news.map((item) => (
          <article
            key={item.id}
            className="rounded-2xl border border-gray-200 bg-gray-50 p-4 transition hover:border-gold/30"
          >
            <h3 className="text-sm font-semibold text-gray-900">{item.title}</h3>
            <p className="mt-1 text-xs text-gray-500">{formatNewsDate(item.created_at)}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
