import { motion } from "framer-motion";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { CountUp } from "@/components/shared/count-up";
import { cn } from "@/lib/cn";
import { EASE, prefersReducedMotion } from "@/lib/motion";

export function KpiCard({
  label,
  value,
  icon: Icon,
  tone = "info",
  active,
  onClick,
  suffix,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  tone?: "info" | "success" | "warning" | "danger" | "muted";
  active?: boolean;
  onClick?: () => void;
  suffix?: string;
}) {
  const reduced = prefersReducedMotion();
  const tones = {
    info: "bg-primary/10 text-primary",
    success: "bg-success/12 text-success",
    warning: "bg-warning/15 text-warning",
    danger: "bg-destructive/12 text-destructive",
    muted: "bg-muted text-muted-foreground",
  };

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={onClick && !reduced ? { y: -1 } : undefined}
      whileTap={onClick && !reduced ? { scale: 0.98 } : undefined}
      transition={{ duration: 0.2, ease: EASE }}
      className={cn(
        "flex h-full min-w-0 w-full items-center gap-2 rounded-lg border bg-card/60 px-2.5 py-2 text-left transition-[box-shadow,background-color] duration-300",
        active && "ring-2 ring-primary/40",
        onClick ? "cursor-pointer" : "cursor-default",
      )}
    >
      <span className={cn("flex h-7 w-7 items-center justify-center rounded-md", tones[tone])}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className="block text-base font-semibold tabular-nums leading-tight">
          <CountUp value={value} />
          {suffix ? <span className="ml-0.5 text-[10px] font-medium text-muted-foreground">{suffix}</span> : null}
        </span>
      </span>
      {onClick ? <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : null}
    </motion.button>
  );
}
