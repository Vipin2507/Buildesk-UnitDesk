import { cn } from "@/lib/cn";
import type { HTMLAttributes } from "react";

export function CardSoft({
  className,
  padded = true,
  ...props
}: HTMLAttributes<HTMLDivElement> & { padded?: boolean | "login" }) {
  return (
    <div
      className={cn(
        "card-soft",
        padded === true && "p-2.5 sm:p-3",
        padded === "login" && "p-6",
        padded === false && "",
        className,
      )}
      {...props}
    />
  );
}
