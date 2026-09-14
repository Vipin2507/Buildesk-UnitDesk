import { Link } from "react-router-dom";
import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  breadcrumbs,
  actions,
}: {
  title: string;
  subtitle?: string;
  breadcrumbs?: { label: string; to?: string }[];
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0 space-y-0.5">
        {breadcrumbs?.length ? (
          <nav className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
            {breadcrumbs.map((b, i) => (
              <span key={`${b.label}-${i}`} className="flex items-center gap-1">
                {i > 0 ? <span>/</span> : null}
                {b.to ? (
                  <Link to={b.to} className="hover:text-foreground">
                    {b.label}
                  </Link>
                ) : (
                  <span className="text-foreground">{b.label}</span>
                )}
              </span>
            ))}
          </nav>
        ) : null}
        <h1 className="text-base font-semibold tracking-tight sm:text-lg">{title}</h1>
        {subtitle ? (
          <p className="line-clamp-1 text-xs text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div className={cn("flex shrink-0 items-center gap-1.5")}>{actions}</div> : null}
    </div>
  );
}
