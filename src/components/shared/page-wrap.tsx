import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { EASE, pageTransition, prefersReducedMotion } from "@/lib/motion";

export function PageWrap({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduced = prefersReducedMotion();
  return (
    <motion.div
      initial={reduced ? false : pageTransition.initial}
      animate={pageTransition.animate}
      transition={{ duration: 0.35, ease: EASE }}
      className={cn("space-y-2.5 p-3 sm:p-4 lg:p-5", className)}
    >
      {children}
    </motion.div>
  );
}
