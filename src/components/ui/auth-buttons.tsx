import { signOut } from "@/app/auth/actions";
import { GoogleAuthButton } from "@/components/ui/google-auth-button";

type AuthButtonsProps = {
  isAuthenticated: boolean;
};

export function AuthButtons({ isAuthenticated }: AuthButtonsProps) {
  if (isAuthenticated) {
    return (
      <form action={signOut}>
        <button
          type="submit"
          className="rounded-full border border-[var(--border)] px-5 py-2 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--gold)] hover:text-[var(--gold)]"
        >
          Sign out
        </button>
      </form>
    );
  }

  return (
    <GoogleAuthButton
      className="rounded-full bg-[var(--gold)] px-5 py-2 text-sm font-semibold text-black transition hover:bg-[var(--gold-soft)] disabled:cursor-not-allowed disabled:opacity-70"
      label="Continue with Google"
      showIcon={false}
    />
  );
}
