import { cn } from "@/lib/cn";
import { statusLabel, statusTone } from "@/lib/status";

const toneClass = {
  muted: "bg-muted text-muted-foreground border-border",
  info: "bg-primary/10 text-primary border-primary/20",
  success: "bg-success/12 text-success border-success/20",
  warning: "bg-warning/15 text-warning-foreground border-warning/25",
  danger: "bg-destructive/10 text-destructive border-destructive/20",
};

const dotClass = {
  muted: "bg-muted-foreground",
  info: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
};

export function StatusPill({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const tone = statusTone[status] ?? "muted";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium capitalize",
        toneClass[tone],
        className,
      )}
    >
      <span className={cn("h-[5px] w-[5px] rounded-full", dotClass[tone])} />
      {statusLabel[status] ?? status.replaceAll("_", " ")}
    </span>
  );
}
