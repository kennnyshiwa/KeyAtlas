"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { toast } from "sonner";

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

interface PushSubscribeButtonProps {
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
}

export function PushSubscribeButton({
  variant = "outline",
  size = "sm",
  className,
}: PushSubscribeButtonProps) {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);

  const checkSubscription = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setLoading(false);
      return;
    }

    setSupported(true);

    try {
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      setSubscribed(!!existing);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void checkSubscription();
  }, [checkSubscription]);

  async function subscribe() {
    let vapidPublicKey: string | null = null;
    try {
      const res = await fetch("/api/push/vapid-key");
      if (res.ok) {
        const data = await res.json();
        vapidPublicKey = data.publicKey;
      }
    } catch { /* ignore */ }
    if (!vapidPublicKey) {
      toast.error("Push notifications are not configured.");
      return;
    }

    setLoading(true);
    try {
      // Register service worker if not already
      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        toast.error("Push notification permission denied.");
        setLoading(false);
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

      if (!res.ok) {
        throw new Error("Failed to register subscription");
      }

      setSubscribed(true);
      toast.success("Push notifications enabled!");
    } catch (err) {
      console.error("Push subscribe error:", err);
      toast.error("Failed to enable push notifications.");
    } finally {
      setLoading(false);
    }
  }

  async function unsubscribe() {
    setLoading(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });

        await subscription.unsubscribe();
      }

      setSubscribed(false);
      toast.success("Push notifications disabled.");
    } catch (err) {
      console.error("Push unsubscribe error:", err);
      toast.error("Failed to disable push notifications.");
    } finally {
      setLoading(false);
    }
  }

  if (!supported) return null;

  if (loading) {
    return (
      <Button variant={variant} size={size} className={className} disabled>
        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
        Loading...
      </Button>
    );
  }

  if (subscribed) {
    return (
      <Button variant={variant} size={size} className={className} onClick={() => void unsubscribe()}>
        <BellOff className="mr-2 h-3.5 w-3.5" />
        Disable push notifications
      </Button>
    );
  }

  return (
    <Button variant={variant} size={size} className={className} onClick={() => void subscribe()}>
      <Bell className="mr-2 h-3.5 w-3.5" />
      Enable push notifications
    </Button>
  );
}
