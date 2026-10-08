import { format, parse, isValid, startOfMonth } from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { DateRange } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/cn";

function toDate(value?: string | null) {
  if (!value) return undefined;
  const d = parse(value, "yyyy-MM-dd", new Date());
  return isValid(d) ? d : undefined;
}

function toIso(d?: Date) {
  return d ? format(d, "yyyy-MM-dd") : "";
}

function monthLabel(value: string) {
  const d = parse(`${value}-01`, "yyyy-MM-dd", new Date());
  return isValid(d) ? format(d, "MMM yyyy") : value;
}

const PRESETS: { label: string; days: number }[] = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

export function DatePicker({
  value,
  onChange,
  placeholder = "Pick date",
  className,
  allowClear = true,
}: {
  value?: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  className?: string;
  allowClear?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = toDate(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            "h-8 justify-start gap-1.5 px-2.5 font-normal",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <CalendarDays className="h-3.5 w-3.5 text-primary" />
          <span className="truncate">{selected ? format(selected, "dd MMM yyyy") : placeholder}</span>
          {allowClear && value ? (
            <span
              role="button"
              tabIndex={0}
              className="ml-auto rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  onChange(null);
                }
              }}
            >
              <X className="h-3 w-3" />
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(d) => {
            onChange(d ? toIso(d) : null);
            setOpen(false);
          }}
          defaultMonth={selected}
        />
      </PopoverContent>
    </Popover>
  );
}

export function DateRangePicker({
  from,
  to,
  onChange,
  className,
}: {
  from?: string | null;
  to?: string | null;
  onChange: (next: { from: string | null; to: string | null }) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const range: DateRange | undefined = useMemo(
    () => ({
      from: toDate(from),
      to: toDate(to),
    }),
    [from, to],
  );

  const label =
    range?.from && range?.to
      ? `${format(range.from, "dd MMM")} – ${format(range.to, "dd MMM yyyy")}`
      : range?.from
        ? `${format(range.from, "dd MMM yyyy")} – …`
        : "Date range";

  function applyPreset(days: number) {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (days - 1));
    onChange({ from: toIso(start), to: toIso(end) });
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            "h-8 min-w-[11rem] justify-start gap-1.5 px-2.5 font-normal",
            !from && !to && "text-muted-foreground",
            className,
          )}
        >
          <CalendarDays className="h-3.5 w-3.5 text-primary" />
          <span className="truncate">{label}</span>
          {from || to ? (
            <span
              role="button"
              tabIndex={0}
              className="ml-auto rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                onChange({ from: null, to: null });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  onChange({ from: null, to: null });
                }
              }}
            >
              <X className="h-3 w-3" />
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex flex-wrap gap-1 border-b px-3 py-2">
          {PRESETS.map((p) => (
            <Button key={p.label} type="button" size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => applyPreset(p.days)}>
              Last {p.label}
            </Button>
          ))}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[11px]"
            onClick={() => {
              const now = new Date();
              const start = startOfMonth(now);
              onChange({ from: toIso(start), to: toIso(now) });
              setOpen(false);
            }}
          >
            This month
          </Button>
        </div>
        <Calendar
          mode="range"
          numberOfMonths={1}
          selected={range}
          onSelect={(next) => {
            onChange({
              from: next?.from ? toIso(next.from) : null,
              to: next?.to ? toIso(next.to) : null,
            });
          }}
          defaultMonth={range?.from}
        />
        <div className="flex justify-end gap-1.5 border-t px-3 py-2">
          <Button type="button" size="sm" variant="ghost" onClick={() => onChange({ from: null, to: null })}>
            Clear
          </Button>
          <Button type="button" size="sm" onClick={() => setOpen(false)} disabled={!from}>
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function MonthPicker({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (month: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = useMemo(() => {
    const d = parse(`${value}-01`, "yyyy-MM-dd", new Date());
    return isValid(d) ? d : new Date();
  }, [value]);
  const [cursor, setCursor] = useState(current.getFullYear());

  const months = Array.from({ length: 12 }, (_, i) => new Date(cursor, i, 1));

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setCursor(current.getFullYear());
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn("h-8 min-w-[8.5rem] justify-start gap-1.5 px-2.5 font-normal", className)}
        >
          <CalendarDays className="h-3.5 w-3.5 text-primary" />
          {monthLabel(value)}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start">
        <div className="mb-2 flex items-center justify-between">
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => setCursor((y) => y - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <p className="text-sm font-semibold">{cursor}</p>
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => setCursor((y) => y + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-1">
          {months.map((m) => {
            const key = format(m, "yyyy-MM");
            const active = key === value;
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  onChange(key);
                  setOpen(false);
                }}
                className={cn(
                  "rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-foreground hover:bg-muted",
                )}
              >
                {format(m, "MMM")}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
