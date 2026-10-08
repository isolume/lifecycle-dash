import type { ReactNode } from "react";

interface ChartCardProps {
  title: string;
  description?: string;
  children: ReactNode;
}

export function ChartCard({ title, description, children }: ChartCardProps) {
  return (
    <section className="border border-card-border bg-card-bg p-5">
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      {description ? <p className="mt-1 text-sm text-foreground/60">{description}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}
