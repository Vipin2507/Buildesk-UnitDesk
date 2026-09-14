import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";
import { EASE, prefersReducedMotion, tabTransition } from "@/lib/motion";

export function Crossfade({
  id,
  children,
  className,
}: {
  id: string;
  children: ReactNode;
  className?: string;
}) {
  const reduced = prefersReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={id}
        initial={tabTransition.initial}
        animate={tabTransition.animate}
        exit={tabTransition.exit}
        transition={{ duration: 0.22, ease: EASE }}
        className={className}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
