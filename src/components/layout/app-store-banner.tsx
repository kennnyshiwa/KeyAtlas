"use client";

import { useState, useEffect } from "react";
import { X, Smartphone } from "lucide-react";

const APP_STORE_URL = "https://apps.apple.com/us/app/keyatlas/id6760237387";
const DISMISS_KEY = "keyatlas:app-store-banner-dismissed";

export function AppStoreBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Don't show if already dismissed or if on iOS (they're already on mobile)
    const dismissed = localStorage.getItem(DISMISS_KEY);
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    if (!dismissed && !isIOS) {
      setVisible(true);
    }
  }, []);

  const dismiss = () => {
    setVisible(false);
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
  };

  if (!visible) return null;

  return (
    <div className="bg-primary text-primary-foreground relative">
      <div className="container flex items-center justify-center gap-2 py-2 text-sm">
        <Smartphone className="h-4 w-4 shrink-0" />
        <span>
          KeyAtlas is now on the App Store!{" "}
          <a
            href={APP_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold underline underline-offset-2 hover:opacity-90"
          >
            Download for iOS →
          </a>
        </span>
        <button
          onClick={dismiss}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 hover:bg-primary-foreground/20"
          aria-label="Dismiss banner"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
