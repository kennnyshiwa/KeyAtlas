import Link from "next/link";
import { format } from "date-fns";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface CalendarEvent {
  project: {
    id: string;
    title: string;
    slug: string;
    status: string;
  };
  type: "ic" | "gb-start" | "gb-end";
}

interface CalendarDayCellProps {
  day: Date;
  events: CalendarEvent[];
  isCurrentMonth: boolean;
  isToday: boolean;
}

const eventColors = {
  ic: "bg-blue-500",
  "gb-start": "bg-green-500",
  "gb-end": "bg-red-500",
} as const;

const eventLabels = {
  ic: "IC",
  "gb-start": "GB Start",
  "gb-end": "GB End",
} as const;

export function CalendarDayCell({
  day,
  events,
  isCurrentMonth,
  isToday,
}: CalendarDayCellProps) {
  const visibleEvents = events.slice(0, 2);
  const remaining = events.length - 2;

  return (
    <div
      className={cn(
        "min-h-[80px] border-r border-b p-1",
        !isCurrentMonth && "bg-muted/30"
      )}
    >
      <div
        className={cn(
          "mb-0.5 text-right text-xs",
          !isCurrentMonth && "text-muted-foreground",
          isToday &&
            "bg-primary text-primary-foreground inline-flex h-5 w-5 items-center justify-center rounded-full float-right"
        )}
      >
        {format(day, "d")}
      </div>
      <div className="clear-both space-y-0.5">
        {visibleEvents.map((event, i) => (
          <Link
            key={`${event.project.id}-${event.type}-${i}`}
            href={`/projects/${event.project.slug}`}
            className="hover:opacity-80 flex items-center gap-1 truncate text-xs"
          >
            <span
              className={cn(
                "h-1.5 w-1.5 shrink-0 rounded-full",
                eventColors[event.type]
              )}
            />
            <span className="truncate">{event.project.title}</span>
          </Link>
        ))}
        {remaining > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <button className="text-muted-foreground text-xs hover:underline">
                +{remaining} more
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-64 space-y-1 p-2" align="start">
              {events.map((event, i) => (
                <Link
                  key={`${event.project.id}-${event.type}-${i}`}
                  href={`/projects/${event.project.slug}`}
                  className="hover:bg-muted flex items-center gap-2 rounded px-2 py-1 text-sm"
                >
                  <span
                    className={cn(
                      "h-2 w-2 shrink-0 rounded-full",
                      eventColors[event.type]
                    )}
                  />
                  <span className="truncate">{event.project.title}</span>
                  <span className="text-muted-foreground ml-auto text-xs">
                    {eventLabels[event.type]}
                  </span>
                </Link>
              ))}
            </PopoverContent>
          </Popover>
        )}
      </div>
    </div>
  );
}
