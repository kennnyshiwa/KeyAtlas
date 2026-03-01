"use client";

import { useRouter } from "next/navigation";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
} from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarDayCell } from "./calendar-day-cell";
import { ChevronLeft, ChevronRight, Package } from "lucide-react";
import Link from "next/link";

interface CalendarProject {
  id: string;
  title: string;
  slug: string;
  status: string;
  icDate: Date | null;
  gbStartDate: Date | null;
  gbEndDate: Date | null;
}

interface DeliveryProject {
  id: string;
  title: string;
  slug: string;
  status: string;
  category: string;
  estimatedDelivery: string | null;
  heroImage: string | null;
  vendor: { name: string } | null;
}

interface CalendarViewProps {
  projects: CalendarProject[];
  year: number;
  month: number;
  deliveryProjects?: DeliveryProject[];
  quarterLabel?: string;
}

type CalendarEvent = {
  project: CalendarProject;
  type: "ic" | "gb-start" | "gb-end";
};

export function CalendarView({ projects, year, month, deliveryProjects = [], quarterLabel }: CalendarViewProps) {
  const router = useRouter();
  const date = new Date(year, month - 1, 1);

  const monthStart = startOfMonth(date);
  const monthEnd = endOfMonth(date);
  const calStart = startOfWeek(monthStart);
  const calEnd = endOfWeek(monthEnd);

  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  const eventsByDay = new Map<string, CalendarEvent[]>();

  for (const project of projects) {
    const addEvent = (d: Date | null, type: CalendarEvent["type"]) => {
      if (!d) return;
      const key = format(d, "yyyy-MM-dd");
      const events = eventsByDay.get(key) ?? [];
      events.push({ project, type });
      eventsByDay.set(key, events);
    };
    addEvent(project.icDate, "ic");
    addEvent(project.gbStartDate, "gb-start");
    addEvent(project.gbEndDate, "gb-end");
  }

  const navigateTo = (d: Date) => {
    router.push(`/calendar?year=${d.getFullYear()}&month=${d.getMonth() + 1}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="icon"
          onClick={() => navigateTo(subMonths(date, 1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-lg font-semibold">
          {format(date, "MMMM yyyy")}
        </h2>
        <Button
          variant="outline"
          size="icon"
          onClick={() => navigateTo(addMonths(date, 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-7 text-center text-sm font-medium">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="text-muted-foreground py-2">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 border-t border-l">
        {days.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const events = eventsByDay.get(key) ?? [];
          const isCurrentMonth = isSameMonth(day, date);
          const isToday = isSameDay(day, new Date());

          return (
            <CalendarDayCell
              key={key}
              day={day}
              events={events}
              isCurrentMonth={isCurrentMonth}
              isToday={isToday}
            />
          );
        })}
      </div>

      <div className="flex gap-4 text-sm">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
          IC Date
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
          GB Start
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
          GB End
        </div>
      </div>

      {quarterLabel && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Expected Deliveries — {quarterLabel}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {deliveryProjects.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No projects with estimated delivery in {quarterLabel}.
              </p>
            ) : (
              <div className="divide-y">
                {deliveryProjects.map((p) => (
                  <Link
                    key={p.id}
                    href={`/projects/${p.slug}`}
                    className="hover:bg-muted/50 flex items-center gap-4 py-3 transition-colors first:pt-0 last:pb-0"
                  >
                    {p.heroImage ? (
                      <img
                        src={p.heroImage}
                        alt={p.title}
                        className="h-12 w-12 rounded-md object-cover"
                      />
                    ) : (
                      <div className="bg-muted flex h-12 w-12 items-center justify-center rounded-md">
                        <Package className="text-muted-foreground h-5 w-5" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{p.title}</p>
                      <div className="flex items-center gap-2 text-sm">
                        <Badge variant="outline" className="text-xs">
                          {p.status.replace(/_/g, " ")}
                        </Badge>
                        {p.vendor && (
                          <span className="text-muted-foreground truncate text-xs">
                            {p.vendor.name}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-muted-foreground shrink-0 text-sm">
                      {p.estimatedDelivery}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
