"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

interface ChangeLogEntry {
  id: string;
  summary: string;
  createdAt: string;
  actor: { name: string | null; username: string | null };
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

  if (loading || logs.length === 0) return null;

  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Clock className="h-4 w-4" />
        What Changed
      </h3>
      <ul className="border-muted space-y-2 border-l-2 pl-4">
        {logs.map((log) => (
          <li key={log.id} className="text-muted-foreground text-sm">
            <span className="text-foreground font-medium">{log.summary}</span>
            <br />
            <span className="text-xs">
              {log.actor.name || log.actor.username || "System"} &middot;{" "}
              {new Date(log.createdAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
