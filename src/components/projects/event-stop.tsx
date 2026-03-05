"use client";

import { useCallback } from "react";

export function EventStop({ children }: { children: React.ReactNode }) {
  const stop = useCallback((e: React.SyntheticEvent) => {
    e.stopPropagation();
  }, []);

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div onClick={stop} onTouchEnd={stop}>
      {children}
    </div>
  );
}
