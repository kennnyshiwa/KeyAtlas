"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { PushSubscribeButton } from "@/components/notifications/push-subscribe-button";

type PreferenceType =
  | "FORUM_REPLIES"
  | "FORUM_CATEGORY_THREADS"
  | "PROJECT_UPDATES"
  | "PROJECT_COMMENTS"
  | "PROJECT_STATUS_CHANGES"
  | "PROJECT_GB_ENDING_SOON"
  | "NEW_FOLLOWERS"
  | "WATCHLIST_MATCHES";

interface Preference {
  type: PreferenceType;
  inApp: boolean;
  email: boolean;
}

const LABELS: Record<PreferenceType, string> = {
  FORUM_REPLIES: "Forum replies on followed threads",
  FORUM_CATEGORY_THREADS: "New threads in followed categories",
  PROJECT_UPDATES: "Project updates",
  PROJECT_COMMENTS: "Project comments and replies",
  PROJECT_STATUS_CHANGES: "Project status changes",
  PROJECT_GB_ENDING_SOON: "Group buy ending soon",
  NEW_FOLLOWERS: "New followers",
  WATCHLIST_MATCHES: "Watchlist matches",
};

export function NotificationSettings() {
  const [preferences, setPreferences] = useState<Preference[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/notification-preferences");
        if (!res.ok) throw new Error();
        const data = await res.json();
        setPreferences(data.preferences);
      } catch {
        toast.error("Failed to load notification settings");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function updatePref(type: PreferenceType, key: "inApp" | "email", value: boolean) {
    setPreferences((prev) => prev.map((p) => (p.type === type ? { ...p, [key]: value } : p)));
    const res = await fetch("/api/notification-preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, [key]: value }),
    });

    if (!res.ok) {
      toast.error("Failed to update notification settings");
    }
  }

  return (
    <div className="space-y-4">
    <Card>
      <CardHeader>
        <CardTitle>Push Notifications</CardTitle>
        <CardDescription>
          Get instant browser notifications even when KeyAtlas isn&apos;t open.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <PushSubscribeButton />
      </CardContent>
    </Card>
    <Card>
      <CardHeader>
        <CardTitle>Notification Preferences</CardTitle>
        <CardDescription>Choose how KeyAtlas notifies you for each event type.</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-muted-foreground text-sm">Loading preferences...</p>
        ) : (
          <div className="space-y-4">
            <div className="text-muted-foreground grid grid-cols-[1fr_90px_90px] text-xs font-medium">
              <span>Event</span>
              <span>In-app</span>
              <span>Email</span>
            </div>
            {preferences.map((pref) => (
              <div key={pref.type} className="grid grid-cols-[1fr_90px_90px] items-center gap-2 border-t pt-3">
                <Label>{LABELS[pref.type]}</Label>
                <Checkbox
                  checked={pref.inApp}
                  onCheckedChange={(checked) => updatePref(pref.type, "inApp", checked === true)}
                />
                <Checkbox
                  checked={pref.email}
                  onCheckedChange={(checked) => updatePref(pref.type, "email", checked === true)}
                />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
    </div>
  );
}
