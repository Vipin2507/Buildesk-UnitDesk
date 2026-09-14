import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

export type Column<T> = {
  key: string;
  header: string;
  className?: string;
  hideOnMobile?: boolean;
  cell: (row: T) => ReactNode;
};

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  onRowClick,
  selectedId,
  empty,
}: {
  columns: Column<T>[];
  rows: T[];
  onRowClick?: (row: T) => void;
  selectedId?: string | null;
  empty?: ReactNode;
}) {
  if (!rows.length) return <>{empty}</>;

  return (
    <>
      <div className="hidden overflow-hidden rounded-lg border md:block">
        <table className="w-full caption-bottom text-xs text-foreground">
          <thead className="bg-muted/60">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    "px-2 py-1.5 text-left text-[10px] font-medium uppercase tracking-wide text-muted-foreground",
                    col.className,
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                onClick={() => onRowClick?.(row)}
                className={cn(
                  "border-t hover:bg-muted/30",
                  onRowClick && "cursor-pointer",
                  selectedId === row.id && "bg-primary/[0.06]",
                )}
              >
                {columns.map((col) => (
                  <td key={col.key} className={cn("px-2 py-1.5", col.className)}>
                    {col.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-2 md:hidden">
        {rows.map((row) => (
          <button
            key={row.id}
            type="button"
            onClick={() => onRowClick?.(row)}
            className={cn(
              "card-soft space-y-1.5 p-3 text-left",
              selectedId === row.id && "ring-2 ring-primary/40",
            )}
          >
            {columns
              .filter((c) => !c.hideOnMobile)
              .map((col) => (
                <div key={col.key} className="flex items-start justify-between gap-2">
                  <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {col.header}
                  </span>
                  <span className="text-right text-xs">{col.cell(row)}</span>
                </div>
              ))}
          </button>
        ))}
      </div>
    </>
  );
}
