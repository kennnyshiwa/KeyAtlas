"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, HelpCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type Placement = "top" | "bottom" | "center";

interface TourStep {
  /** CSS selector for the element to highlight. Omit for a centered, untargeted step. */
  target?: string;
  title: string;
  body: string;
  placement?: Placement;
}

const STORAGE_KEY = "keyatlas:project-editor-tour:v1";

const STEPS: TourStep[] = [
  {
    title: "Welcome to the project editor 👋",
    body: "A quick tour of how to create and edit your project — title, description, vendors, pricing and more. You can skip anytime and replay later with the “Editor tour” button.",
    placement: "center",
  },
  {
    target: "#import-url",
    title: "Start fast with a link",
    body: "Paste a Geekhack topic or vendor page and we’ll prefill the title, description, dates and links. Nothing is published automatically — you just polish.",
  },
  {
    target: "#basic-info",
    title: "The basics",
    body: "Give your project a title, choose a category, and set its status (Interest Check, Group Buy, and so on). The status controls which other fields are required.",
  },
  {
    target: '[data-field="description"]',
    title: "Write the description",
    body: "Use the toolbar to format text, add headings, images and links — hover any button for a tip. The “Spoiler” button hides long sections behind a click-to-reveal “More”.",
  },
  {
    target: "#pricing",
    title: "Set pricing",
    body: "Enter a price or a price range plus the currency so shoppers know what to expect.",
  },
  {
    target: "#vendors",
    title: "Add vendors",
    body: "List each vendor selling this set, their region, and a direct store link. Group buys need at least one vendor.",
  },
  {
    target: "#timeline",
    title: "Key dates",
    body: "Add the interest-check date and the group-buy start/end dates. These drive reminders and the “ending soon” badges.",
  },
  {
    target: "#hero-image",
    title: "Hero image",
    body: "Upload the main render that represents your project across listings and cards.",
  },
  {
    target: "#gallery",
    title: "Gallery",
    body: "Add extra renders and photos. You can also drop these images straight into the description.",
  },
  {
    target: "#tags",
    title: "Tags",
    body: "Tag the profile, materials and themes so people can find your project in search and filters.",
  },
  {
    target: "#links",
    title: "Links",
    body: "Add the Geekhack thread, IC form, vendor pages and any other relevant links — you can paste several at once.",
  },
  {
    target: "#sound-tests",
    title: "Sound tests",
    body: "Embed sound-test videos so people can hear the switches and build.",
  },
  {
    title: "You’re all set 🎉",
    body: "Your work autosaves as a draft — hit Save/Submit when you’re ready. Replay this tour anytime with the “Editor tour” button.",
    placement: "center",
  },
];

const PADDING = 8; // spotlight padding around the target
const CARD_WIDTH = 360;
const GAP = 12; // gap between spotlight and card
const HEADER_OFFSET = 100; // leave room for the sticky site header / editor toolbar
const CARD_EST_HEIGHT = 210; // approximate card height for placement math

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function ProjectEditorTour({ autoStart = true }: { autoStart?: boolean }) {
  const [mounted, setMounted] = useState(false);
  const [running, setRunning] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const rafRef = useRef<number | null>(null);

  // Only steps whose target exists right now (untargeted steps always qualify).
  const visibleSteps = useRef<TourStep[]>(STEPS);
  const computeSteps = useCallback(() => {
    visibleSteps.current = STEPS.filter(
      (s) => !s.target || document.querySelector(s.target),
    );
  }, []);

  const step = visibleSteps.current[stepIndex];

  useEffect(() => setMounted(true), []);

  const finish = useCallback(() => {
    setRunning(false);
    setRect(null);
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
  }, []);

  const start = useCallback(() => {
    computeSteps();
    setStepIndex(0);
    setRunning(true);
  }, [computeSteps]);

  // Auto-start on first visit.
  useEffect(() => {
    if (!autoStart) return;
    let seen = false;
    try {
      seen = window.localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      seen = false;
    }
    if (seen) return;
    // Wait for the form to be laid out before measuring.
    const t = window.setTimeout(start, 600);
    return () => window.clearTimeout(t);
  }, [autoStart, start]);

  // Measure (and keep measuring) the current target.
  const measure = useCallback(() => {
    if (!running) return;
    const current = visibleSteps.current[stepIndex];
    if (!current?.target) {
      setRect(null);
      return;
    }
    const el = document.querySelector(current.target);
    if (!el) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [running, stepIndex]);

  // On step change: scroll the target's TOP into view (not centered, which
  // pushes the top of a tall field — like a long description — off-screen),
  // then measure.
  useLayoutEffect(() => {
    if (!running) return;
    const current = visibleSteps.current[stepIndex];
    if (current?.target) {
      const el = document.querySelector(current.target);
      if (el) {
        const r = el.getBoundingClientRect();
        const top = window.scrollY + r.top - HEADER_OFFSET;
        window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
      }
    }
    const t = window.setTimeout(measure, 350);
    return () => window.clearTimeout(t);
  }, [running, stepIndex, measure]);

  // Keep the spotlight glued to the target during scroll/resize.
  useEffect(() => {
    if (!running) return;
    const onMove = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(measure);
    };
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [running, measure]);

  // Keyboard: Esc to skip, arrows to navigate.
  useEffect(() => {
    if (!running) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, stepIndex]);

  const total = visibleSteps.current.length;
  const isLast = stepIndex >= total - 1;

  const next = useCallback(() => {
    if (isLast) finish();
    else setStepIndex((i) => Math.min(i + 1, total - 1));
  }, [isLast, finish, total]);

  const prev = useCallback(() => setStepIndex((i) => Math.max(i - 1, 0)), []);

  // The replay trigger is always rendered so users can re-run the tour.
  const trigger = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-8 gap-1.5 text-xs"
      onClick={start}
    >
      <HelpCircle className="h-3.5 w-3.5" />
      Editor tour
    </Button>
  );

  if (!mounted || !running || !step) return trigger;

  const placement: Placement = step.placement ?? "bottom";

  // Position the instruction card.
  let cardStyle: React.CSSProperties;
  if (placement === "center" || !rect) {
    cardStyle = {
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
    };
  } else {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = rect.left + rect.width / 2 - CARD_WIDTH / 2;
    left = Math.max(12, Math.min(left, vw - CARD_WIDTH - 12));

    const belowTop = rect.top + rect.height + GAP;
    if (belowTop + CARD_EST_HEIGHT < vh) {
      // Fits below the target.
      cardStyle = { top: belowTop, left };
    } else if (rect.top - GAP - CARD_EST_HEIGHT > 0) {
      // Fits above the target.
      cardStyle = { top: rect.top - GAP, left, transform: "translateY(-100%)" };
    } else {
      // Target is taller than the viewport (e.g. a long description) — pin the
      // card to the bottom so it's always visible regardless of target height.
      cardStyle = { bottom: 24, left };
    }
  }

  const overlay = (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label="Project editor tour">
      {/* Dim backdrop with a spotlight cut-out over the target */}
      {rect ? (
        <div
          className="pointer-events-none absolute rounded-lg transition-all duration-200"
          style={{
            top: rect.top - PADDING,
            left: rect.left - PADDING,
            width: rect.width + PADDING * 2,
            height: rect.height + PADDING * 2,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.6)",
            outline: "2px solid var(--primary)",
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-black/60" />
      )}

      {/* Instruction card */}
      <div
        className="bg-popover text-popover-foreground absolute w-[360px] max-w-[calc(100vw-24px)] rounded-xl border p-4 shadow-2xl"
        style={cardStyle}
      >
        <div className="mb-1 flex items-start justify-between gap-2">
          <h3 className="text-base font-semibold leading-tight">{step.title}</h3>
          <button
            type="button"
            onClick={finish}
            aria-label="Skip tour"
            className="text-muted-foreground hover:text-foreground -mr-1 -mt-1 rounded p-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-muted-foreground text-sm leading-relaxed">{step.body}</p>

        <div className="mt-4 flex items-center justify-between">
          <span className="text-muted-foreground text-xs tabular-nums">
            {stepIndex + 1} / {total}
          </span>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={finish} className="text-xs">
              Skip
            </Button>
            {stepIndex > 0 && (
              <Button type="button" variant="outline" size="sm" onClick={prev} className="h-8 gap-1 text-xs">
                <ChevronLeft className="h-3.5 w-3.5" />
                Back
              </Button>
            )}
            <Button type="button" size="sm" onClick={next} className="h-8 gap-1 text-xs">
              {isLast ? "Done" : "Next"}
              {!isLast && <ChevronRight className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {trigger}
      {createPortal(overlay, document.body)}
    </>
  );
}
