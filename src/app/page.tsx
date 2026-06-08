import CountdownTimer from "@/components/CountdownTimer";

export default function Home() {
  return (
    <main className="flex-1">
      {/* Hero Section */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-4 py-20 overflow-hidden">
        {/* Background gradient effects */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(212,175,55,0.08)_0%,_transparent_60%)]" />
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-gold/5 rounded-full blur-3xl" />

        <div className="relative z-10 text-center max-w-4xl mx-auto">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-gold/30 bg-gold/5 mb-8">
            <span className="w-2 h-2 rounded-full bg-gold animate-pulse" />
            <span className="text-sm text-gold font-medium">Launching Soon</span>
          </div>

          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold leading-tight mb-6">
            Predict the{" "}
            <span className="gold-text-gradient">World Cup 2026</span>
            <br />
            Win Real Prizes
          </h1>

          <p className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto mb-12">
            Compete with friends, represent your country, climb the leaderboard,
            and win cash prizes. The ultimate football prediction experience.
          </p>

          {/* Countdown */}
          <div className="mb-12">
            <p className="text-sm text-gray-500 uppercase tracking-widest mb-4">
              Kickoff in
            </p>
            <CountdownTimer />
          </div>

          {/* CTA */}
          <a
            href="/login"
            className="inline-flex items-center gap-2 gold-gradient text-black font-bold px-8 py-4 rounded-full text-lg hover:scale-105 transition-transform animate-pulse-gold"
          >
            🏆 Start Predicting
          </a>

          <p className="text-sm text-gray-500 mt-4">
            Free to play • No credit card required
          </p>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
          <svg className="w-6 h-6 text-gold/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </div>
      </section>

      {/* Prize Pool Section */}
      <section className="py-20 md:py-32 px-4" id="prizes">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold mb-4">
              Prize Pool
            </h2>
            <p className="text-gray-400 text-lg">Real prizes for real predictions</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {/* 2nd Place */}
            <div className="order-2 md:order-1 bg-surface border border-surface-border rounded-2xl p-8 text-center hover:border-gray-500 transition-colors md:mt-8">
              <div className="text-4xl mb-4">🥈</div>
              <h3 className="text-xl font-bold text-gray-300 mb-2">2nd Place</h3>
              <p className="text-3xl font-bold text-white">$100</p>
            </div>

            {/* 1st Place */}
            <div className="order-1 md:order-2 bg-surface border-2 border-gold/50 rounded-2xl p-8 text-center relative animate-pulse-gold">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gold text-black text-xs font-bold px-3 py-1 rounded-full">
                GRAND PRIZE
              </div>
              <div className="text-5xl mb-4 animate-float">🥇</div>
              <h3 className="text-xl font-bold gold-text-gradient mb-2">1st Place</h3>
              <p className="text-4xl font-bold gold-text-gradient">$300</p>
            </div>

            {/* 3rd Place */}
            <div className="order-3 bg-surface border border-surface-border rounded-2xl p-8 text-center hover:border-gray-500 transition-colors md:mt-8">
              <div className="text-4xl mb-4">🥉</div>
              <h3 className="text-xl font-bold text-gray-300 mb-2">3rd Place</h3>
              <p className="text-3xl font-bold text-white">$50</p>
            </div>
          </div>

          <p className="text-center text-gray-500 mt-12 text-sm">
            Total Prize Pool: <span className="text-gold font-bold">$450</span> • More prizes added as community grows
          </p>
        </div>
      </section>

      {/* Founder Badge Section */}
      <section className="py-20 md:py-32 px-4 bg-surface/50">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-20">
            {/* Badge Visual */}
            <div className="flex-shrink-0">
              <div className="relative w-48 h-48 md:w-64 md:h-64">
                <div className="absolute inset-0 gold-gradient rounded-full opacity-20 blur-2xl animate-pulse" />
                <div className="relative w-full h-full rounded-full border-4 border-gold/50 bg-surface flex items-center justify-center animate-float">
                  <div className="text-center">
                    <div className="text-5xl md:text-6xl mb-2">🏅</div>
                    <p className="text-xs md:text-sm font-bold text-gold uppercase tracking-wider">Founder</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="text-center lg:text-left">
              <h2 className="text-3xl md:text-5xl font-bold mb-6">
                Exclusive <span className="gold-text-gradient">Founder Badge</span>
              </h2>
              <p className="text-gray-400 text-lg mb-6 max-w-lg">
                Be among the first 1,000 members to join and earn the exclusive Founder Badge.
                A permanent symbol of your early support that will never be available again.
              </p>
              <ul className="space-y-3 text-left inline-block">
                <li className="flex items-center gap-3">
                  <span className="text-gold">✓</span>
                  <span className="text-gray-300">Permanent profile badge</span>
                </li>
                <li className="flex items-center gap-3">
                  <span className="text-gold">✓</span>
                  <span className="text-gray-300">Priority access to new features</span>
                </li>
                <li className="flex items-center gap-3">
                  <span className="text-gold">✓</span>
                  <span className="text-gray-300">Exclusive Founder leaderboard</span>
                </li>
                <li className="flex items-center gap-3">
                  <span className="text-gold">✓</span>
                  <span className="text-gray-300">Limited to first 1,000 members</span>
                </li>
              </ul>

              <div className="mt-8">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-gold/10 border border-gold/30 rounded-full">
                  <span className="text-gold font-bold text-sm">🔥 Spots filling fast</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Country Battle Section */}
      <section className="py-20 md:py-32 px-4" id="countries">
        <div className="max-w-6xl mx-auto text-center">
          <h2 className="text-3xl md:text-5xl font-bold mb-4">
            Country <span className="gold-text-gradient">Battle</span>
          </h2>
          <p className="text-gray-400 text-lg mb-16 max-w-2xl mx-auto">
            Represent your nation. Every correct prediction earns points for your country.
            Which nation will dominate the leaderboard?
          </p>

          {/* Country Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-12">
            {[
              { flag: "🇧🇷", name: "Brazil" },
              { flag: "🇦🇷", name: "Argentina" },
              { flag: "🇫🇷", name: "France" },
              { flag: "🇩🇪", name: "Germany" },
              { flag: "🇪🇸", name: "Spain" },
              { flag: "🇬🇧", name: "England" },
              { flag: "🇵🇹", name: "Portugal" },
              { flag: "🇳🇱", name: "Netherlands" },
              { flag: "🇮🇹", name: "Italy" },
              { flag: "🇺🇸", name: "USA" },
              { flag: "🇲🇽", name: "Mexico" },
              { flag: "🇯🇵", name: "Japan" },
            ].map((country) => (
              <div
                key={country.name}
                className="bg-surface border border-surface-border rounded-xl p-4 hover:border-gold/50 transition-colors group cursor-pointer"
              >
                <div className="text-3xl md:text-4xl mb-2 group-hover:scale-110 transition-transform">
                  {country.flag}
                </div>
                <p className="text-sm text-gray-400 group-hover:text-gold transition-colors">
                  {country.name}
                </p>
              </div>
            ))}
          </div>

          <p className="text-gray-500 text-sm">
            🌍 All 48 participating nations available at launch
          </p>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-20 md:py-32 px-4 bg-surface/50">
        <div className="max-w-6xl mx-auto text-center">
          <h2 className="text-3xl md:text-5xl font-bold mb-16">
            How It <span className="gold-text-gradient">Works</span>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <div className="flex flex-col items-center">
              <div className="w-16 h-16 rounded-full gold-gradient flex items-center justify-center text-2xl font-bold text-black mb-4">
                1
              </div>
              <h3 className="text-xl font-bold mb-2">Join Free</h3>
              <p className="text-gray-400">Sign up and pick your country to represent</p>
            </div>
            <div className="flex flex-col items-center">
              <div className="w-16 h-16 rounded-full gold-gradient flex items-center justify-center text-2xl font-bold text-black mb-4">
                2
              </div>
              <h3 className="text-xl font-bold mb-2">Predict</h3>
              <p className="text-gray-400">Make your predictions for each World Cup match</p>
            </div>
            <div className="flex flex-col items-center">
              <div className="w-16 h-16 rounded-full gold-gradient flex items-center justify-center text-2xl font-bold text-black mb-4">
                3
              </div>
              <h3 className="text-xl font-bold mb-2">Win</h3>
              <p className="text-gray-400">Climb the leaderboard and win real cash prizes</p>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="py-20 md:py-32 px-4 relative overflow-hidden" id="join">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,_rgba(212,175,55,0.1)_0%,_transparent_60%)]" />
        
        <div className="relative z-10 max-w-3xl mx-auto text-center">
          <h2 className="text-3xl md:text-5xl font-bold mb-6">
            Ready to <span className="gold-text-gradient">Predict & Win</span>?
          </h2>
          <p className="text-gray-400 text-lg mb-10 max-w-xl mx-auto">
            Join thousands of football fans competing for glory and real prizes.
            Don&apos;t miss your chance to earn the Founder Badge.
          </p>

          <a
            href="https://t.me/Predict26Official"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-3 gold-gradient text-black font-bold px-10 py-5 rounded-full text-xl hover:scale-105 transition-transform animate-pulse-gold"
          >
            <span>⚽</span>
            <span>Join Telegram</span>
          </a>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-gray-500">
            <span className="flex items-center gap-2">
              <span className="text-gold">✓</span> Free to play
            </span>
            <span className="hidden sm:inline text-gray-700">•</span>
            <span className="flex items-center gap-2">
              <span className="text-gold">✓</span> Real prizes
            </span>
            <span className="hidden sm:inline text-gray-700">•</span>
            <span className="flex items-center gap-2">
              <span className="text-gold">✓</span> No credit card
            </span>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-surface-border">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">⚽</span>
            <span className="font-bold gold-text-gradient">Predict26</span>
          </div>
          <div className="flex items-center gap-4 text-sm text-gray-500">
            <a href="/rules" className="transition hover:text-gold">Rules</a>
            <span>© 2025 Predict26. All rights reserved.</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
