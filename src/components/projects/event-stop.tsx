"use client";

export function EventStop({ children }: { children: React.ReactNode }) {
  return (
    <div
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
      onTouchEnd={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}
