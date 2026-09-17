import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker, useNavigation, useDayPicker } from "react-day-picker";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type CalendarProps = React.ComponentProps<typeof DayPicker> & {
  portalContainer?: HTMLElement | null;
};

const CalendarPortalContext = React.createContext<HTMLElement | null | undefined>(undefined);

const navBtnCls = cn(
  buttonVariants({ variant: "outline" }),
  "h-8 w-8 rounded-lg bg-muted/40 border-border/70 p-0 opacity-100 hover:bg-muted/55 hover:border-primary/40 flex items-center justify-center shrink-0",
);

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const selectTriggerCls =
  "h-8 min-w-[76px] rounded-lg border-border/70 bg-muted/40 px-2.5 text-xs font-medium text-foreground hover:border-primary/40 focus:border-primary/60 focus:ring-2 focus:ring-primary/30";

function CalendarCaption({ displayMonth }: { displayMonth: Date }) {
  const { goToMonth, nextMonth, previousMonth } = useNavigation();
  const { fromYear, toYear } = useDayPicker();
  const portalContainer = React.useContext(CalendarPortalContext);

  const currentYear = displayMonth.getFullYear();
  const currentMonth = displayMonth.getMonth();

  const startYear = fromYear ?? 1900;
  const endYear = toYear ?? new Date().getFullYear();
  const years = Array.from({ length: endYear - startYear + 1 }, (_, i) => endYear - i);

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        className={navBtnCls}
        disabled={!previousMonth}
        onClick={() => previousMonth && goToMonth(previousMonth)}
        aria-label="Previous month"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      <div className="flex flex-1 items-center justify-center gap-1.5">
        <Select
          value={String(currentMonth)}
          onValueChange={(val) => goToMonth(new Date(currentYear, +val))}
        >
          <SelectTrigger className={selectTriggerCls}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent
            portalContainer={portalContainer}
            className="rounded-xl border-border/70 bg-card/95 text-foreground backdrop-blur-md"
            position="popper"
          >
            {MONTH_NAMES.map((name, idx) => (
              <SelectItem
                key={idx}
                value={String(idx)}
                className="rounded-lg text-xs focus:bg-primary/20 focus:text-foreground"
              >
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={String(currentYear)}
          onValueChange={(val) => goToMonth(new Date(+val, currentMonth))}
        >
          <SelectTrigger className={selectTriggerCls}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent
            portalContainer={portalContainer}
            className="rounded-xl border-border/70 bg-card/95 text-foreground backdrop-blur-md"
            position="popper"
            style={{ maxHeight: "350px", overflowY: "auto" }}
          >
            {years.map((y) => (
              <SelectItem
                key={y}
                value={String(y)}
                className="rounded-lg text-xs focus:bg-primary/20 focus:text-foreground"
              >
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <button
        type="button"
        className={navBtnCls}
        disabled={!nextMonth}
        onClick={() => nextMonth && goToMonth(nextMonth)}
        aria-label="Next month"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

function Calendar({ className, classNames, showOutsideDays = true, portalContainer, ...props }: CalendarProps) {
  return (
    <CalendarPortalContext.Provider value={portalContainer}>
      <DayPicker
        showOutsideDays={showOutsideDays}
        className={cn("p-3", className)}
        classNames={{
          months: "flex flex-col space-y-3",
          month: "space-y-3",
          caption: "pt-1",
          caption_label: "hidden",
          nav: "hidden",
          nav_button: "hidden",
          nav_button_previous: "hidden",
          nav_button_next: "hidden",
          table: "w-full border-collapse space-y-1",
          head_row: "flex",
          head_cell: "text-muted-foreground/90 rounded-md w-9 font-medium text-[0.78rem]",
          row: "flex w-full mt-1.5",
          cell: "h-9 w-9 text-center text-sm p-0 relative focus-within:relative focus-within:z-20",
          day: cn(
            buttonVariants({ variant: "ghost" }),
            "h-9 w-9 rounded-lg p-0 font-medium text-foreground/95 aria-selected:opacity-100 hover:bg-primary/15",
          ),
          day_range_end: "day-range-end",
          day_selected:
            "bg-primary text-primary-foreground shadow-[0_0_0_1px_hsl(var(--primary)/0.55)] hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
          day_today: "bg-primary/20 text-foreground",
          day_outside:
            "day-outside text-muted-foreground opacity-45 aria-selected:bg-primary/25 aria-selected:text-muted-foreground aria-selected:opacity-40",
          day_disabled: "text-muted-foreground opacity-50",
          day_range_middle: "aria-selected:bg-accent aria-selected:text-accent-foreground",
          day_hidden: "invisible",
          vhidden: "sr-only",
          ...classNames,
        }}
        components={{
          Caption: CalendarCaption,
        }}
        {...props}
      />
    </CalendarPortalContext.Provider>
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
