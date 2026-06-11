import Link from "next/link";
import { GoogleAuthButton } from "@/components/ui/google-auth-button";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_58%,#f1f5f9_100%)] px-4 py-10 text-gray-950 sm:px-6">
      <div className="w-full max-w-md">
        <div className="rounded-3xl border border-gray-200/80 bg-white p-6 text-center shadow-[0_24px_70px_rgba(15,23,42,0.12)] sm:p-8">
          {/* Logo */}
          <div className="mb-8">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gold/10 text-4xl shadow-inner shadow-gold/10">
              ⚽
            </div>
            <p className="mt-6 text-xs font-bold uppercase tracking-[0.28em] text-gold-dark">
              Predict26
            </p>
            <h1 className="mt-3 text-2xl font-bold text-gray-950 sm:text-3xl">
              Sign in to <span className="gold-text-gradient">Predict26</span>
            </h1>
            <p className="mt-3 text-sm leading-6 text-gray-600">
              Predict World Cup 2026 matches and win prizes.
            </p>
          </div>

          {/* Error message */}
          {params.error && (
            <div
              className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700"
              role="alert"
            >
              We couldn’t finish signing you in. Please try Google sign-in again.
            </div>
          )}

          {/* Google Sign In */}
          <GoogleAuthButton label="Sign in with Google" />

          {/* Footer */}
          <p className="mt-6 text-xs leading-5 text-gray-500">
            By signing in, you agree to our Terms of Service and Privacy Policy.
          </p>
        </div>

        {/* Back links */}
        <div className="mt-6 flex flex-col items-center justify-center gap-2 text-sm font-medium text-gray-600 sm:flex-row sm:gap-4">
          <Link href="/" className="transition-colors hover:text-gold-dark">
            ← Back to home
          </Link>
          <span className="hidden text-gray-300 sm:inline">•</span>
          <Link href="/rules" className="transition-colors hover:text-gold-dark">
            View rules
          </Link>
        </div>
      </div>
    </main>
  );
}
