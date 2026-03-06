"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Bell, Check } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  createdAt: string;
  readAt: string | null;
  metadata?: Record<string, unknown>;
}

const TYPE_LABELS: Record<string, string> = {
  PROJECT_STATUS_CHANGE: "Project status",
  PROJECT_GB_ENDING_SOON: "Group buy ending",
};

export function NotificationBell() {
  const { data: session } = useSession();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);

  const fetchNotifications = useCallback(async () => {
    if (!session?.user) return;
    try {
      const res = await fetch("/api/notifications?limit=10");
      if (res.ok) {
        const data = await res.json();
        return data;
      }
    } catch {
      // Silent fail
    }
    return null;
  }, [session?.user]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const data = await fetchNotifications();
      if (data && !cancelled) {
        setNotifications(data.notifications);
        setUnreadCount(data.unreadCount);
      }
    };
    run();
    const interval = setInterval(run, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [fetchNotifications]);

  async function markAllRead() {
    try {
      await fetch("/api/notifications", { method: "PATCH" });
      const nowIso = new Date().toISOString();
      setNotifications((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? nowIso })));
      setUnreadCount(0);
    } catch {
      // Silent fail
    }
  }

  if (!session?.user) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="text-sm font-semibold">Notifications</h3>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllRead}>
              <Check className="mr-1 h-3 w-3" />
              Mark all as read
            </Button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="text-muted-foreground px-4 py-8 text-center text-sm">
              No notifications yet
            </div>
          ) : (
            notifications.map((n) => {
              const typeLabel = TYPE_LABELS[n.type];
              const inner = (
                <div
                  key={n.id}
                  className={`border-b px-4 py-3 transition-colors last:border-0 ${
                    !n.readAt ? "bg-primary/5" : ""
                  } hover:bg-muted/50`}
                >
                  <div className="flex items-start gap-2">
                    {!n.readAt && (
                      <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-blue-500" />
                    )}
                    <div className="min-w-0 flex-1">
                      {typeLabel && (
                        <p className="text-muted-foreground mb-0.5 text-[10px] font-semibold uppercase tracking-wide">
                          {typeLabel}
                        </p>
                      )}
                      <p className="text-sm font-medium">{n.title}</p>
                      <p className="text-muted-foreground line-clamp-2 text-xs">
                        {n.message}
                      </p>
                      <p className="text-muted-foreground mt-1 text-xs">
                        {formatDistanceToNow(new Date(n.createdAt), {
                          addSuffix: true,
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              );

              return n.link ? (
                <Link key={n.id} href={n.link} onClick={() => setOpen(false)}>
                  {inner}
                </Link>
              ) : (
                <div key={n.id}>{inner}</div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
