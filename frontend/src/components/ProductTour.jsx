import { useEffect, useState } from "react";
import { Sparkles, X, ArrowRight, ArrowLeft } from "lucide-react";
import { getTourStatus, completeTour } from "../api/atlasApi";

// Scripted, not a live AI conversation - the tour has to be instant and
// reliable for every new signup, and a real OpenAI call per step would
// mean paying to show the same fixed content over and over. It's
// written in Atlas's own voice (first person) so it still reads as the
// AI introducing itself, not a generic product-tour widget.
//
// mobileTarget lets a step point at the hamburger menu button instead of
// a specific sidebar link on narrow screens, where the sidebar itself is
// off-canvas until opened - rather than trying to force the drawer open
// during the tour (which would mean lifting Layout.jsx's sidebar-open
// state into a shared place just for this), the mobile version of these
// steps just says where to find the feature instead of spotlighting it
// directly.
const TOUR_STEPS = [

  {
    target: null,
    title: "Welcome to Atlas",
    body: "Hi, I'm Atlas — I'll be your AI receptionist, answering your customers and keeping track of your business around the clock. Give me about a minute and I'll show you around."
  },

  {
    target: '[data-tour="stats"]',
    title: "Your business, at a glance",
    body: "This is your Dashboard - your customers, leads, hot leads, and conversion rate, always up to date."
  },

  {
    target: '[data-tour="briefing"]',
    title: "Your daily briefing",
    body: "Every morning I write you a plain-English summary of what needs your attention. You can also ask me anything about your business right here, anytime."
  },

  {
    target: '[data-tour="nav-customers"]',
    mobileTarget: '[data-tour="mobile-menu"]',
    title: "Customers",
    body: "Every person who's talked to me, or that you've added yourself, lives here — their full history, notes, and quotes, all in one place."
  },

  {
    target: '[data-tour="nav-leads"]',
    mobileTarget: '[data-tour="mobile-menu"]',
    title: "Leads",
    body: "When a conversation shows real buying intent, I automatically create a lead here and rank how urgent it is, so you know exactly who to call first."
  },

  {
    target: '[data-tour="nav-schedule"]',
    mobileTarget: '[data-tour="mobile-menu"]',
    title: "Schedule",
    body: "Book jobs, see your week at a glance, and I'll flag scheduling conflicts before they become a problem."
  },

  {
    target: '[data-tour="nav-quotes"]',
    mobileTarget: '[data-tour="mobile-menu"]',
    title: "Quotes & Invoices",
    body: "Price a job and send it - a quote becomes an invoice in a couple of clicks, and your customer can pay it straight from there."
  },

  {
    target: '[data-tour="nav-knowledge"]',
    mobileTarget: '[data-tour="mobile-menu"]',
    title: "Knowledge Base",
    body: "This is how you teach me about your business - your prices, policies, and hours - so I answer your customers accurately instead of guessing."
  },

  {
    target: '[data-tour="nav-analytics"]',
    mobileTarget: '[data-tour="mobile-menu"]',
    title: "Analytics",
    body: "And here's the real numbers: revenue, conversion, repeat customers — the actual health of your business, whenever you want to check."
  },

  {
    target: '[data-tour="checklist"]',
    title: "One more thing",
    body: "When you get a chance, finish the setup steps below - especially teaching me about your business. The more I know, the better I represent you."
  },

  {
    target: null,
    title: "That's it!",
    body: "That's the tour. I'm always here in the sidebar if you need me - let's get to work."
  }

];


function useTargetRect(selector) {

  const [rect, setRect] = useState(null);

  useEffect(() => {

    if (!selector) {
      setRect(null);
      return;
    }

    const update = () => {

      const el = document.querySelector(selector);
      setRect(el ? el.getBoundingClientRect() : null);

    };

    update();

    // A step whose target is below the fold (common on a phone, where
    // "Your daily briefing" and the closing checklist step both sit
    // well past the initial viewport) used to leave the user staring at
    // a dark scrim with a callout describing something nowhere on
    // screen - nothing here ever scrolled. "nearest" rather than
    // "center" so a target that's already fully visible is never
    // nudged, only one that's genuinely out of view.
    const el = document.querySelector(selector);

    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    window.addEventListener("resize", update);

    // A short poll rather than a MutationObserver - the targets here
    // (stat cards, sidebar links) can shift size once their own data
    // finishes loading a beat after mount, and the tour is only ever
    // on screen for a few seconds, so a cheap interval is simpler than
    // wiring real change detection for something this short-lived.
    const interval = setInterval(update, 300);

    return () => {

      window.removeEventListener("resize", update);
      clearInterval(interval);

    };

  }, [selector]);

  return rect;

}


function ProductTour() {

  const [loaded, setLoaded] = useState(false);
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {

    let cancelled = false;

    getTourStatus()
      .then((status) => {

        if (!cancelled && !status.completed) {
          setActive(true);
        }

      })
      .catch((error) => console.error("TOUR STATUS ERROR:", error))
      .finally(() => {

        if (!cancelled) {
          setLoaded(true);
        }

      });

    return () => {
      cancelled = true;
    };

  }, []);

  useEffect(() => {

    if (!active) {
      return;
    }

    const handleKeyDown = (e) => {

      if (e.key === "Escape") {
        finish();
      }

    };

    document.addEventListener("keydown", handleKeyDown);

    return () => document.removeEventListener("keydown", handleKeyDown);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const step = TOUR_STEPS[stepIndex];
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  const targetSelector = step ? (isMobile && step.mobileTarget ? step.mobileTarget : step.target) : null;
  const rect = useTargetRect(active ? targetSelector : null);

  const finish = () => {

    setActive(false);

    completeTour().catch((error) => console.error("TOUR COMPLETE ERROR:", error));

  };

  const goNext = () => {

    if (stepIndex >= TOUR_STEPS.length - 1) {
      finish();
      return;
    }

    setStepIndex((i) => i + 1);

  };

  const goBack = () => {

    setStepIndex((i) => Math.max(0, i - 1));

  };

  if (!loaded || !active) {
    return null;
  }

  return (

    <div className="fixed inset-0 z-[200]">

      <div
        className="absolute inset-0 transition-colors"
        style={{ background: rect ? "transparent" : "rgba(8, 9, 13, 0.75)" }}
      />

      {rect && (

        <div
          className="pointer-events-none absolute rounded-xl ring-2 ring-brand-500 transition-all duration-200"
          style={{
            top: rect.top - 8,
            left: rect.left - 8,
            width: rect.width + 16,
            height: rect.height + 16,
            boxShadow: "0 0 0 9999px rgba(8, 9, 13, 0.75)"
          }}
        />

      )}

      <div className="absolute inset-x-4 bottom-4 sm:inset-x-auto sm:bottom-8 sm:right-8 sm:w-full sm:max-w-sm">

        <div className="rounded-2xl border border-border bg-surface p-6 shadow-2xl">

          <div className="flex items-start justify-between gap-3">

            <div className="flex items-center gap-2 text-accent-text">
              <Sparkles size={18} />
              <span className="text-xs font-semibold uppercase tracking-wide">Atlas</span>
            </div>

            <button
              onClick={finish}
              className="rounded-lg p-1 text-fg-faint transition hover:bg-surface-muted hover:text-fg"
              aria-label="Skip tour"
            >
              <X size={16} />
            </button>

          </div>

          <h3 className="mt-3 text-lg font-bold text-fg">
            {step.title}
          </h3>

          <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">
            {step.body}
          </p>

          <div className="mt-5 flex items-center justify-between gap-3">

            <span className="text-xs text-fg-faint">
              {stepIndex + 1} of {TOUR_STEPS.length}
            </span>

            <div className="flex items-center gap-2">

              {stepIndex > 0 && (

                <button
                  onClick={goBack}
                  className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-fg-muted transition hover:bg-surface-muted hover:text-fg"
                >
                  <ArrowLeft size={14} />
                  Back
                </button>

              )}

              <button
                onClick={goNext}
                className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-500"
              >
                {stepIndex >= TOUR_STEPS.length - 1 ? "Finish" : "Next"}
                <ArrowRight size={14} />
              </button>

            </div>

          </div>

        </div>

      </div>

    </div>

  );

}

export default ProductTour;
