import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Circle, X, Sparkles } from "lucide-react";

import { getOnboardingStatus, dismissOnboarding } from "../api/atlasApi";


function GettingStartedChecklist() {

  const [status, setStatus] = useState(null);
  const [dismissing, setDismissing] = useState(false);

  useEffect(() => {

    getOnboardingStatus()
      .then(setStatus)
      .catch((error) => console.error("ONBOARDING STATUS ERROR:", error));

  }, []);


  const handleDismiss = async () => {

    setDismissing(true);

    try {

      await dismissOnboarding();
      setStatus((previous) => ({ ...previous, dismissed: true }));

    } catch (error) {

      console.error("DISMISS ONBOARDING ERROR:", error);
      setDismissing(false);

    }

  };


  // Only the initial fetch (status === null) gets a skeleton - this is
  // the first thing a new user's dashboard renders, so popping in on
  // top of an already-settled layout was the most visible instance of
  // this pattern in the app. Once status has actually loaded and turns
  // out dismissed/complete, hiding entirely (return null) is the
  // correct real state, not a loading state, so that stays as-is.
  if (!status) {

    return (

      <div className="relative overflow-hidden rounded-2xl border border-ink-700 bg-gradient-to-br from-ink-900 to-ink-850 p-6 animate-pulse">

        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-ink-800" />
          <div>
            <div className="h-4 w-24 rounded bg-ink-800" />
            <div className="mt-2 h-3 w-20 rounded bg-ink-800" />
          </div>
        </div>

        <div className="mt-4 h-1.5 w-full rounded-full bg-ink-800" />

        <div className="mt-4 flex flex-col gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-5 w-2/3 rounded bg-ink-800" />
          ))}
        </div>

      </div>

    );

  }

  if (status.dismissed) {
    return null;
  }

  const items = [

    {
      key: "has_customer",
      label: "Add your first customer",
      done: status.has_customer,
      to: "/customers"
    },

    {
      key: "has_knowledge",
      label: "Teach Atlas about your business",
      done: status.has_knowledge,
      to: "/knowledge"
    },

    {
      key: "has_review_link",
      label: "Set your review link",
      done: status.has_review_link,
      to: "/settings"
    },

    {
      key: "has_conversation",
      label: "Have your first conversation",
      done: status.has_conversation,
      to: "/customers"
    }

  ];

  const completedCount = items.filter((item) => item.done).length;

  if (completedCount === items.length) {
    return null;
  }

  return (

    <div className="relative overflow-hidden rounded-2xl border border-ink-700 bg-gradient-to-br from-ink-900 to-ink-850 p-6">

      <div
        className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-brand-600/10 blur-[80px]"
        aria-hidden="true"
      />

      <div className="relative flex items-start justify-between gap-3">

        <div className="flex items-center gap-2.5">

          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600/15 text-brand-400">
            <Sparkles size={17} />
          </div>

          <div>
            <h2 className="font-display text-lg font-bold">Get set up</h2>
            <p className="text-xs text-slate-500">{completedCount} of {items.length} complete</p>
          </div>

        </div>

        <button
          onClick={handleDismiss}
          disabled={dismissing}
          className="rounded-lg p-1.5 text-slate-500 transition hover:bg-ink-800 hover:text-white"
          aria-label="Dismiss checklist"
        >
          <X size={16} />
        </button>

      </div>

      <div className="relative mt-4 h-1.5 w-full overflow-hidden rounded-full bg-ink-800">
        <div
          className="h-full rounded-full bg-brand-500 transition-all"
          style={{ width: `${(completedCount / items.length) * 100}%` }}
        />
      </div>

      <div className="relative mt-4 flex flex-col gap-1">

        {items.map((item) => {

          const content = (

            <>
              {item.done ? (
                <Check size={16} className="shrink-0 text-brand-400" />
              ) : (
                <Circle size={16} className="shrink-0 text-slate-600" />
              )}

              <span className={item.done ? "text-slate-500 line-through" : "text-slate-200"}>
                {item.label}
              </span>
            </>

          );

          return item.done ? (

            <div key={item.key} className="flex items-center gap-2.5 rounded-lg p-2 text-sm">
              {content}
            </div>

          ) : (

            <Link
              key={item.key}
              to={item.to}
              className="flex items-center gap-2.5 rounded-lg p-2 text-sm transition hover:bg-ink-800"
            >
              {content}
            </Link>

          );

        })}

      </div>

    </div>

  );

}

export default GettingStartedChecklist;
