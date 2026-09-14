import { motion } from "framer-motion";
import { useId, type ReactNode } from "react";
import { Crossfade } from "@/components/shared/crossfade";
import { cn } from "@/lib/cn";
import { EASE, prefersReducedMotion } from "@/lib/motion";

export function SegmentedTabs<T extends string>({
  tabs,
  value,
  onChange,
  children,
  className,
  compact,
}: {
  tabs: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  children?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  const uid = useId();
  const reduced = prefersReducedMotion();

  return (
    <div className={cn("space-y-2.5", className)}>
      <div className="flex gap-0.5 overflow-x-auto rounded-lg border bg-muted/30 p-0.5 scrollbar-none">
        {tabs.map((tab) => {
          const active = value === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className={cn(
                "relative shrink-0 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors duration-200",
                compact && "px-1.5 py-1 text-[11px]",
                active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                reduced && active && "bg-card shadow-sm",
              )}
            >
              {active && !reduced ? (
                <motion.span
                  layoutId={`seg-pill-${uid}`}
                  className="absolute inset-0 rounded-md bg-card shadow-sm"
                  transition={{ duration: 0.28, ease: EASE }}
                />
              ) : null}
              <span className="relative z-10">{tab.label}</span>
            </button>
          );
        })}
      </div>
      {children ? <Crossfade id={value}>{children}</Crossfade> : null}
    </div>
  );
}
