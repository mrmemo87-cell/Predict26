type StatusTone =
  | "green"
  | "amber"
  | "red"
  | "gray"
  | "blue"
  | "gold";

type StatusChipProps = {
  label: string;
  tone?: StatusTone;
  icon?: string;
  className?: string;
};

const toneClasses: Record<StatusTone, string> = {
  green: "border-emerald-200 bg-emerald-50 text-emerald-800",
  amber: "border-amber-200 bg-amber-50 text-amber-800",
  red: "border-red-200 bg-red-50 text-red-700",
  gray: "border-gray-200 bg-gray-100 text-gray-600",
  blue: "border-cyan-200 bg-cyan-50 text-cyan-800",
  gold: "border-gold/30 bg-gold/10 text-gold-dark",
};

export default function StatusChip({
  label,
  tone = "gray",
  icon,
  className = "",
}: StatusChipProps) {
  return (
    <span
      className={`inline-flex w-fit items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-black leading-none ${toneClasses[tone]} ${className}`}
    >
      {icon ? <span aria-hidden="true">{icon}</span> : null}
      {label}
    </span>
  );
}
