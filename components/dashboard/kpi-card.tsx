import Link from "next/link";

type AccentColor = "accent" | "danger" | "warning" | "success";

const TOP_BORDER_COLORS: Record<AccentColor, string> = {
  accent: "border-t-[var(--accent)]",
  danger: "border-t-[var(--danger)]",
  warning: "border-t-[var(--warning)]",
  success: "border-t-[var(--success)]",
};

interface KpiCardProps {
  label: string;
  value: string | number;
  loading: boolean;
  accentColor?: AccentColor;
  href?: string;
}

export function KpiCard({
  label,
  value,
  loading,
  accentColor = "accent",
  href,
}: KpiCardProps) {
  const classes = `border border-card-border bg-card-bg border-t-[3px] ${TOP_BORDER_COLORS[accentColor]} p-4 transition ${
    href ? "hover:bg-surface-sunken" : ""
  }`;

  const content = (
    <>
      <p className="text-xs uppercase tracking-wider text-foreground/50">{label}</p>
      {loading ? (
        <div className="skeleton mt-3 h-8 w-24" />
      ) : (
        <p className="font-data mt-2 text-3xl font-bold text-foreground">{value}</p>
      )}
      {href && !loading ? <p className="mt-2 text-xs text-foreground/50">View list</p> : null}
    </>
  );

  if (!href) {
    return <div className={classes}>{content}</div>;
  }

  return (
    <Link href={href} className={`${classes} block`}>
      {content}
    </Link>
  );
}
