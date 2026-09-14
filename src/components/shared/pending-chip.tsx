import { motion } from "framer-motion";
import { CountUp } from "@/components/shared/count-up";
import { cn } from "@/lib/cn";
import { EASE } from "@/lib/motion";

const urgency = {
  low: "bg-muted/60 text-muted-foreground border-border",
  info: "bg-primary/8 text-primary border-primary/20",
  warning: "bg-warning/12 text-warning-foreground border-warning/25",
  danger: "bg-destructive/10 text-destructive border-destructive/25",
};

export function PendingChip({
  label,
  value,
  tone = "info",
  onClick,
}: {
  label: string;
  value: number;
  tone?: keyof typeof urgency;
  onClick?: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.18, ease: EASE }}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1",
        urgency[tone],
      )}
    >
      <span className="text-[10px] font-medium">{label}</span>
      <span className="text-xs font-semibold tabular-nums">
        <CountUp value={value} />
      </span>
    </motion.button>
  );
}
