"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type Placement = "top" | "bottom" | "center";

interface TourStep {
  /** Navigate here before showing the step (auto-navigate tours). */
  route?: string;
  /** CSS selector to highlight. Omit for a centered, untargeted step. */
  target?: string;
  title: string;
  body: string;
  placement?: Placement;
  /** Optional primary call-to-action that navigates and ends the tour. */
  cta?: { label: string; href: string };
}

type TourId = "guest" | "newuser";

const ACTIVE_KEY = "keyatlas:app-tour";
const seenKey = (id: TourId) => `keyatlas:tour-seen:${id}`;

// Sentinel route: resolved at runtime to the first project card's URL on the
// /projects listing, so the tour can open a real project detail page.
const FIRST_PROJECT = "@firstProject";

// Shared sequence that browses the project list and walks the parts of a single
// project. Used by both tours.
const EXPLORE_PROJECTS: TourStep[] = [
  {
    route: "/projects",
    target: '[data-tour="project-filters"]',
    title: "Browse & filter projects",
    body: "Every project lives here. Filter by status, category, and profile, search, or sort to find exactly what you want.",
  },
  {
    route: "/projects",
    target: '[data-tour="project-grid"]',
    title: "Project cards",
    body: "Each card shows a project at a glance — its status, price, and how long is left. Let's open one.",
  },
  {
    route: FIRST_PROJECT,
    target: '[data-tour="project-hero"]',
    title: "Inside a project",
    body: "The top of a project shows the main render, title, status, and key dates at a glance.",
  },
  {
    route: FIRST_PROJECT,
    target: '[data-tour="project-actions"]',
    title: "Follow & save",
    body: "Follow a project for updates, favourite it, or add it to a collection. (Following needs a free account.)",
  },
  {
    route: FIRST_PROJECT,
    target: '[data-tour="project-specs"]',
    title: "Details & links",
    body: "The description covers specs and what's included, with links out to the Geekhack thread, IC form, and vendors.",
  },
  {
    route: FIRST_PROJECT,
    target: '[data-tour="project-vendors"]',
    title: "Where to buy",
    body: "Vendors are listed by region with direct store links, so you buy from the right place for you.",
  },
];

const TOURS: Record<TourId, TourStep[]> = {
  guest: [
    {
      route: "/",
      placement: "center",
      title: "Welcome to KeyAtlas 👋",
      body: "Your hub for mechanical keyboard group buys, keycaps, and the makers behind them. Here's a 30-second tour of how to find things.",
    },
    {
      route: "/",
      target: '[data-tour="search"]',
      title: "Search anything",
      body: "Find projects, designers, and vendors fast — just start typing a set or maker name here.",
    },
    ...EXPLORE_PROJECTS,
    {
      route: "/calendar",
      target: '[data-tour="calendar-page"]',
      title: "See what's live & ending soon",
      body: "The calendar lays out group buys by date, so you never miss an interest check or a buy that's about to close.",
    },
    {
      route: "/",
      target: '[data-tour="user-menu"]',
      title: "Create a free account",
      body: "Sign up to follow projects, get reminders before group buys end, and submit your own designs.",
      cta: { label: "Sign up", href: "/sign-up" },
    },
    {
      route: "/",
      placement: "center",
      title: "Happy browsing 🎉",
      body: "That's the basics! Explore projects, vendors, forums, and guides from the top nav anytime.",
    },
  ],
  newuser: [
    {
      route: "/",
      placement: "center",
      title: "Welcome aboard 🎉",
      body: "Your account is ready. Here's how to get the most out of KeyAtlas.",
    },
    {
      route: "/",
      target: '[data-tour="submit-project"]',
      title: "Share your own project",
      body: "Got a set or board to list? Click Submit Project — we'll walk you through the editor field by field.",
    },
    ...EXPLORE_PROJECTS,
    {
      route: "/",
      target: '[data-tour="notifications"]',
      title: "Never miss an update",
      body: "Follow projects and designers, then watch this bell for restocks, status changes, and ending-soon alerts.",
    },
    {
      route: "/",
      target: '[data-tour="user-menu"]',
      title: "Your profile & settings",
      body: "Open your avatar menu to manage your profile, collections, watchlist, and account settings.",
    },
    {
      route: "/",
      placement: "center",
      title: "You're all set 🚀",
      body: "Jump in! You can replay this tour anytime from your avatar menu → “Replay tour”.",
    },
  ],
};

// Routes where a tour should never auto-start (auth flows, admin, the project
// editor which has its own dedicated tour).
const BLOCKED_PREFIXES = ["/sign-in", "/sign-up", "/verify-email", "/admin", "/projects/submit"];

const PADDING = 8;
const CARD_WIDTH = 360;
const GAP = 12;
const HEADER_OFFSET = 96;
const CARD_EST_HEIGHT = 220;
// Cap the spotlight height so large sections (a long description, the whole
// project grid) highlight a focused band at the top instead of filling the
// screen — otherwise nothing visibly dims and there's no sense of focus.
const MAX_SPOTLIGHT_HEIGHT = 260;

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function getSeen(id: TourId) {
  try {
    return window.localStorage.getItem(seenKey(id)) === "1";
  } catch {
    return false;
  }
}

export function AppTours() {
  const { status } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  const [mounted, setMounted] = useState(false);
  const [tourId, setTourId] = useState<TourId | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [waiting, setWaiting] = useState(false);

  const decidedRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  // Resolved URL of the project the tour opens (from the first listing card).
  const resolvedProjectPathRef = useRef<string | null>(null);

  const steps = tourId ? TOURS[tourId] : [];
  const step = steps[stepIndex];
  const total = steps.length;
  const isLast = stepIndex >= total - 1;

  useEffect(() => setMounted(true), []);

  const persist = useCallback((id: TourId | null, index: number) => {
    try {
      if (id) window.localStorage.setItem(ACTIVE_KEY, JSON.stringify({ id, step: index }));
      else window.localStorage.removeItem(ACTIVE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const startTour = useCallback(
    (id: TourId) => {
      resolvedProjectPathRef.current = null;
      setTourId(id);
      setStepIndex(0);
      persist(id, 0);
    },
    [persist],
  );

  const endTour = useCallback(
    (markSeen = true) => {
      if (markSeen && tourId) {
        try {
          window.localStorage.setItem(seenKey(tourId), "1");
        } catch {
          /* ignore */
        }
      }
      setTourId(null);
      setRect(null);
      setWaiting(false);
      persist(null, 0);
    },
    [tourId, persist],
  );

  // Resume an in-progress tour after a hard reload, or auto-start a new one.
  useEffect(() => {
    if (!mounted || status === "loading" || decidedRef.current) return;
    decidedRef.current = true;

    // Resume if one was already in progress.
    try {
      const raw = window.localStorage.getItem(ACTIVE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { id: TourId; step: number };
        if (parsed?.id && TOURS[parsed.id]) {
          setTourId(parsed.id);
          setStepIndex(Math.min(parsed.step ?? 0, TOURS[parsed.id].length - 1));
          return;
        }
      }
    } catch {
      /* ignore */
    }

    if (BLOCKED_PREFIXES.some((p) => pathname.startsWith(p))) return;

    if (status === "authenticated" && !getSeen("newuser")) {
      startTour("newuser");
    } else if (status === "unauthenticated" && !getSeen("guest")) {
      startTour("guest");
    }
  }, [mounted, status, pathname, startTour]);

  // Allow other UI (e.g. the avatar menu) to (re)start a tour on demand.
  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent).detail?.id as TourId | undefined;
      if (id && TOURS[id]) startTour(id);
    };
    window.addEventListener("keyatlas:start-tour", handler);
    return () => window.removeEventListener("keyatlas:start-tour", handler);
  }, [startTour]);

  const measure = useCallback(() => {
    if (!step?.target) {
      setRect(null);
      return;
    }
    const el = document.querySelector(step.target);
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [step]);

  // Drive each step: navigate if needed, then wait for the target & measure.
  useEffect(() => {
    if (!tourId || !step) return;
    let cancelled = false;

    // Resolve the step's route, including the @firstProject sentinel which
    // points at the first project card on the /projects listing.
    let effectiveRoute = step.route;
    if (step.route === FIRST_PROJECT) {
      if (resolvedProjectPathRef.current) {
        effectiveRoute = resolvedProjectPathRef.current;
      } else {
        const link = document.querySelector<HTMLAnchorElement>(
          '[data-tour="project-grid"] a[href^="/projects/"]',
        );
        const href = link?.getAttribute("href");
        if (href && !href.startsWith("/projects/submit")) {
          resolvedProjectPathRef.current = href.split("?")[0].split("#")[0];
          effectiveRoute = resolvedProjectPathRef.current;
        } else {
          // Couldn't resolve a project (e.g. empty list) — show centered.
          setRect(null);
          setWaiting(false);
          return;
        }
      }
    }

    // Navigate to the step's route first.
    if (effectiveRoute && pathname !== effectiveRoute) {
      setRect(null);
      setWaiting(true);
      router.push(effectiveRoute);
      return;
    }

    // Centered step — no target to wait for.
    if (!step.target) {
      setRect(null);
      setWaiting(false);
      return;
    }

    // Advance past a step we can't meaningfully show (missing or empty target).
    const skip = () => {
      const ni = stepIndex + 1;
      if (ni < steps.length) {
        setStepIndex(ni);
        persist(tourId, ni);
      } else {
        endTour(true);
      }
    };

    // Poll for the target element (page may still be rendering after nav).
    setWaiting(true);
    let tries = 0;
    const tick = () => {
      if (cancelled) return;
      const el = document.querySelector(step.target!);
      if (el) {
        const r = el.getBoundingClientRect();
        // Optional/empty section (e.g. a project with no vendors): skip it
        // instead of scrolling to a blank strip with an invisible spotlight.
        if (r.height < 16 || r.width < 16) {
          skip();
          return;
        }
        const top = window.scrollY + r.top - HEADER_OFFSET;
        window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
        window.setTimeout(() => {
          if (cancelled) return;
          measure();
          setWaiting(false);
        }, 350);
        return;
      }
      tries += 1;
      if (tries > 40) {
        // Target never appeared — skip rather than showing an empty step.
        skip();
        return;
      }
      window.setTimeout(tick, 100);
    };
    tick();

    return () => {
      cancelled = true;
    };
  }, [tourId, stepIndex, step, pathname, router, measure, steps.length, persist, endTour]);

  // Keep the spotlight glued to the target on scroll/resize.
  useEffect(() => {
    if (!tourId) return;
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
  }, [tourId, measure]);

  const next = useCallback(() => {
    if (isLast) {
      endTour(true);
    } else {
      const n = Math.min(stepIndex + 1, total - 1);
      setStepIndex(n);
      persist(tourId, n);
    }
  }, [isLast, endTour, stepIndex, total, tourId, persist]);

  const prev = useCallback(() => {
    const p = Math.max(stepIndex - 1, 0);
    setStepIndex(p);
    persist(tourId, p);
  }, [stepIndex, tourId, persist]);

  // Keyboard navigation.
  useEffect(() => {
    if (!tourId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") endTour(true);
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tourId, endTour, next, prev]);

  if (!mounted || !tourId || !step || waiting) return null;

  const placement: Placement = step.placement ?? "bottom";

  // Highlight a focused band at the top of large targets.
  const dispHeight = rect ? Math.min(rect.height, MAX_SPOTLIGHT_HEIGHT) : 0;

  let cardStyle: React.CSSProperties;
  if (placement === "center" || !rect) {
    cardStyle = { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
  } else {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = rect.left + rect.width / 2 - CARD_WIDTH / 2;
    left = Math.max(12, Math.min(left, vw - CARD_WIDTH - 12));
    const belowTop = rect.top + dispHeight + GAP;
    if (belowTop + CARD_EST_HEIGHT < vh) {
      cardStyle = { top: belowTop, left };
    } else if (rect.top - GAP - CARD_EST_HEIGHT > 0) {
      cardStyle = { top: rect.top - GAP, left, transform: "translateY(-100%)" };
    } else {
      cardStyle = { bottom: 24, left };
    }
  }

  const overlay = (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label="Guided tour">
      {rect ? (
        <div
          className="pointer-events-none absolute rounded-lg transition-all duration-200"
          style={{
            top: rect.top - PADDING,
            left: rect.left - PADDING,
            width: rect.width + PADDING * 2,
            height: dispHeight + PADDING * 2,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.6)",
            outline: "2px solid var(--primary)",
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-black/60" />
      )}

      <div
        className="bg-popover text-popover-foreground absolute w-[360px] max-w-[calc(100vw-24px)] rounded-xl border p-4 shadow-2xl"
        style={cardStyle}
      >
        <div className="mb-1 flex items-start justify-between gap-2">
          <h3 className="text-base font-semibold leading-tight">{step.title}</h3>
          <button
            type="button"
            onClick={() => endTour(true)}
            aria-label="Skip tour"
            className="text-muted-foreground hover:text-foreground -mr-1 -mt-1 rounded p-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-muted-foreground text-sm leading-relaxed">{step.body}</p>

        <div className="mt-4 flex items-center justify-between gap-2">
          <span className="text-muted-foreground text-xs tabular-nums">
            {stepIndex + 1} / {total}
          </span>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => endTour(true)} className="text-xs">
              Skip
            </Button>
            {stepIndex > 0 && (
              <Button type="button" variant="outline" size="sm" onClick={prev} className="h-8 gap-1 text-xs">
                <ChevronLeft className="h-3.5 w-3.5" />
                Back
              </Button>
            )}
            {step.cta ? (
              <Button
                type="button"
                size="sm"
                className="h-8 text-xs"
                onClick={() => {
                  const href = step.cta!.href;
                  endTour(true);
                  router.push(href);
                }}
              >
                {step.cta.label}
              </Button>
            ) : (
              <Button type="button" size="sm" onClick={next} className="h-8 gap-1 text-xs">
                {isLast ? "Done" : "Next"}
                {!isLast && <ChevronRight className="h-3.5 w-3.5" />}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
