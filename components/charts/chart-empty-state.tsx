export function ChartEmptyState({ message = "No data for current filters." }: { message?: string }) {
  return (
    <div className="flex h-[280px] items-center justify-center border border-dashed border-card-border bg-surface-sunken/60 px-6 text-center text-sm text-foreground/60">
      {message}
    </div>
  );
}
