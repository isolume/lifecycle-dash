import { ExceptionManager } from "@/components/dashboard/exception-manager";

export default function ExceptionsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Project Exceptions</h1>
        <p className="mt-2 text-sm text-foreground/60">
          Mark active devices that should be skipped or omitted and keep reporting aligned with scope decisions.
        </p>
      </div>

      <ExceptionManager />
    </div>
  );
}
