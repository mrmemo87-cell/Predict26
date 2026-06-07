import { signInWithGoogle, signOut } from "@/app/auth/actions";

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
    <form action={async () => {
  "use server";
  await signInWithGoogle();
}}>
      <button
        type="submit"
        className="rounded-full bg-[var(--gold)] px-5 py-2 text-sm font-semibold text-black transition hover:bg-[var(--gold-soft)]"
      >
        Continue with Google
      </button>
    </form>
  );
}
