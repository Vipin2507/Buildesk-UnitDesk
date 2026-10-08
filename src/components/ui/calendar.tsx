import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ComponentProps } from "react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import { cn } from "@/lib/cn";
import { buttonVariants } from "@/components/ui/button";

export type CalendarProps = ComponentProps<typeof DayPicker>;

export function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col gap-3 sm:flex-row",
        month: "space-y-3",
        month_caption: "relative flex items-center justify-center pt-0.5",
        caption_label: "text-sm font-semibold tracking-tight",
        nav: "absolute inset-x-0 top-0 flex items-center justify-between px-1",
        button_previous: cn(
          buttonVariants({ variant: "ghost", size: "icon-sm" }),
          "h-7 w-7 text-muted-foreground hover:text-foreground",
        ),
        button_next: cn(
          buttonVariants({ variant: "ghost", size: "icon-sm" }),
          "h-7 w-7 text-muted-foreground hover:text-foreground",
        ),
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday: "w-8 text-[10px] font-medium uppercase tracking-wide text-muted-foreground",
        week: "mt-1 flex w-full",
        day: "relative h-8 w-8 p-0 text-center text-xs",
        day_button: cn(
          buttonVariants({ variant: "ghost", size: "icon-sm" }),
          "h-8 w-8 rounded-md p-0 font-normal aria-selected:opacity-100",
        ),
        selected:
          "[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary [&>button]:hover:text-primary-foreground",
        today: "[&>button]:bg-accent [&>button]:text-accent-foreground",
        outside: "text-muted-foreground/50 opacity-60",
        disabled: "text-muted-foreground opacity-40",
        range_middle: "[&>button]:bg-primary/15 [&>button]:text-foreground [&>button]:rounded-none",
        range_start: "[&>button]:rounded-l-md",
        range_end: "[&>button]:rounded-r-md",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === "left" ? (
            <ChevronLeft className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          ),
      }}
      {...props}
    />
  );
}
