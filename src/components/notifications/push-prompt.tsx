"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Bell, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const DISMISSED_KEY = "keyatlas-push-prompt-dismissed";
const PROMPT_DELAY_MS = 3000; // Show after 3 seconds

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer as ArrayBuffer;
}

export function PushPrompt() {
  const { data: session } = useSession();
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    // Don't show if not logged in, not supported, or already dismissed
    if (!session?.user) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    if (localStorage.getItem(DISMISSED_KEY)) return;

    // Check if already subscribed
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (!sub) {
          // Check if permission was already denied
          if (Notification.permission === "denied") return;
          // Show prompt after delay
          const timer = setTimeout(() => setVisible(true), PROMPT_DELAY_MS);
          return () => clearTimeout(timer);
        }
      })
      .catch(() => {/* ignore */});
  }, [mounted, session?.user]);

  function dismiss() {
    setVisible(false);
    localStorage.setItem(DISMISSED_KEY, Date.now().toString());
  }

  async function enablePush() {
    let vapidPublicKey: string | null = null;
    try {
      const res = await fetch("/api/push/vapid-key");
      if (res.ok) {
        const data = await res.json();
        vapidPublicKey = data.publicKey;
      }
    } catch { /* ignore */ }
    if (!vapidPublicKey) return;

    setLoading(true);
    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        dismiss();
        return;
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      });

      if (!res.ok) throw new Error("Subscribe failed");

      setVisible(false);
      localStorage.setItem(DISMISSED_KEY, "subscribed");
    } catch (err) {
      console.error("Push prompt subscribe error:", err);
      dismiss();
    } finally {
      setLoading(false);
    }
  }

  if (!visible) return null;

  return (
    <div className="animate-in slide-in-from-top-2 fade-in fixed top-4 left-1/2 z-50 -translate-x-1/2">
      <div className="flex items-center gap-3 rounded-lg border bg-background px-4 py-3 shadow-lg">
        <Bell className="h-5 w-5 shrink-0 text-primary" />
        <p className="text-sm">
          <span className="font-medium">Stay in the loop!</span>{" "}
          Get notified about new group buys and ending-soon projects.
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            size="sm"
            onClick={() => void enablePush()}
            disabled={loading}
          >
            {loading ? "Enabling..." : "Enable"}
          </Button>
          <button
            onClick={dismiss}
            className="text-muted-foreground hover:text-foreground rounded p-1 transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
