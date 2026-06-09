"use client";

import { useFormStatus } from "react-dom";

type PendingSubmitButtonProps = {
  idleText: string;
  pendingText?: string;
  className: string;
  disabled?: boolean;
  formAction?: string | ((formData: FormData) => void | Promise<void>);
};

export default function PendingSubmitButton({
  idleText,
  pendingText = "Saving...",
  className,
  disabled = false,
  formAction,
}: PendingSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={disabled || pending}
      aria-disabled={disabled || pending}
      formAction={formAction}
      className={`${className} disabled:cursor-not-allowed disabled:opacity-60`}
    >
      <span className="inline-flex items-center justify-center gap-2">
        {pending && (
          <span
            className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
            aria-hidden="true"
          />
        )}
        {pending ? pendingText : idleText}
      </span>
    </button>
  );
}
