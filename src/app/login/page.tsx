import Link from "next/link";
import { GoogleAuthButton } from "@/components/ui/google-auth-button";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="bg-surface border border-surface-border rounded-2xl p-8 text-center">
          {/* Logo */}
          <div className="mb-8">
            <span className="text-4xl">⚽</span>
            <h1 className="text-2xl font-bold mt-4">
              Sign in to <span className="gold-text-gradient">Predict26</span>
            </h1>
            <p className="text-gray-400 text-sm mt-2">
              Predict World Cup 2026 matches and win prizes
            </p>
          </div>

          {/* Error message */}
          {params.error && (
            <div className="mb-6 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
              Authentication failed. Please try again.
            </div>
          )}

          {/* Google Sign In */}
          <GoogleAuthButton label="Sign in with Google" />

          {/* Footer */}
          <p className="text-xs text-gray-500 mt-6">
            By signing in, you agree to our Terms of Service and Privacy Policy
          </p>
        </div>

        {/* Back link */}
        <div className="text-center mt-6">
          <Link href="/" className="text-sm text-gray-400 hover:text-gold transition-colors">
            ← Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}
