import { Calendar } from "lucide-react";
import { formatDate } from "@/lib/utils";
import type { ProjectWithRelations } from "@/types";

interface ProjectTimelineProps {
  project: ProjectWithRelations;
}

interface TimelineEntry {
  label: string;
  date: Date;
}

export function ProjectTimeline({ project }: ProjectTimelineProps) {
  const entries: TimelineEntry[] = [];

  if (project.icDate) entries.push({ label: "Interest Check", date: project.icDate });
  if (project.gbStartDate) entries.push({ label: "Group Buy Start", date: project.gbStartDate });
  if (project.gbEndDate) entries.push({ label: "Group Buy End", date: project.gbEndDate });
  if (project.estimatedDelivery) entries.push({ label: "Estimated Delivery", date: project.estimatedDelivery });

  if (entries.length === 0) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Timeline</h2>
      <div className="space-y-3">
        {entries.map((entry, i) => (
          <div key={i} className="flex items-start gap-3">
            <div className="bg-primary/10 mt-0.5 rounded-full p-1.5">
              <Calendar className="text-primary h-3.5 w-3.5" />
            </div>
            <div>
              <p className="text-sm font-medium">{entry.label}</p>
              <p className="text-muted-foreground text-sm">
                {formatDate(entry.date)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
