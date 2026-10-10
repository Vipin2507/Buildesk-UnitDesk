import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "default" | "success" | "warning" | "danger" | "info";
}) {
  const border =
    tone === "success"
      ? "border-success/25"
      : tone === "warning"
        ? "border-warning/30"
        : tone === "danger"
          ? "border-destructive/25"
          : tone === "info"
            ? "border-primary/25"
            : "border-border";
  return (
    <div className={cn("rounded-xl border bg-card p-3 shadow-sm", border)}>
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight">{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function UsageBar({
  label,
  used,
  max,
}: {
  label: string;
  used: number;
  max: number;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0;
  const over = used > max;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="text-muted-foreground">{label}</span>
        <span className={cn("tabular-nums font-medium", over && "text-destructive")}>
          {used}/{max}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            over ? "bg-destructive" : pct >= 85 ? "bg-warning" : "bg-primary",
          )}
          style={{ width: `${Math.max(over ? 100 : pct, used > 0 ? 4 : 0)}%` }}
        />
      </div>
    </div>
  );
}

export function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}

export function daysUntil(iso: string | null | undefined) {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

export function planTone(code: string) {
  if (code === "pro") return "bg-primary/10 text-primary border-primary/20";
  if (code === "basic") return "bg-success/10 text-success border-success/20";
  return "bg-muted text-muted-foreground border-border";
}
