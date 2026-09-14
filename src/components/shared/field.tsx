import { Label } from "@/components/ui/label";
import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

export function Field({
  label,
  children,
  className,
  error,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  error?: string;
}) {
  return (
    <label className={cn("block space-y-1", className)}>
      <Label>{label}</Label>
      {children}
      {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
    </label>
  );
}
