"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock } from "lucide-react";

interface ChangeLogEntry {
  id: string;
  summary: string;
  createdAt: string;
  actor: { name: string | null; username: string | null };
}

interface ConsolidatedEntry {
  id: string;
  summary: string;
  count: number;
  date: string;
  actorLabel: string;
}

/**
 * Deduplicate entries that have the same summary, actor, and date.
 * Shows "Removed vendor (was Foo) ×12" instead of 12 identical lines.
 */
function consolidateLogs(logs: ChangeLogEntry[]): ConsolidatedEntry[] {
  const grouped = new Map<string, ConsolidatedEntry>();

  for (const log of logs) {
    const date = new Date(log.createdAt).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const actor = log.actor.name || log.actor.username || "System";
    const key = `${log.summary}|${actor}|${date}`;

    const existing = grouped.get(key);
    if (existing) {
      existing.count++;
    } else {
      grouped.set(key, {
        id: log.id,
        summary: log.summary,
        count: 1,
        date,
        actorLabel: actor,
      });
    }
  }

  return Array.from(grouped.values());
}

export function ProjectChangeLog({ projectId }: { projectId: string }) {
  const [logs, setLogs] = useState<ChangeLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/changelog`)
      .then((r) => r.json())
      .then((d) => setLogs(d.logs ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  const consolidated = useMemo(() => consolidateLogs(logs), [logs]);

  if (loading || consolidated.length === 0) return null;

  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Clock className="h-4 w-4" />
        What Changed
      </h3>
      <ul className="border-muted space-y-2 border-l-2 pl-4">
        {consolidated.map((entry) => (
          <li key={entry.id} className="text-muted-foreground text-sm">
            <span className="text-foreground font-medium">
              {entry.summary}
              {entry.count > 1 && (
                <span className="text-muted-foreground ml-1 font-normal">
                  ×{entry.count}
                </span>
              )}
            </span>
            <br />
            <span className="text-xs">
              {entry.actorLabel} &middot; {entry.date}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
