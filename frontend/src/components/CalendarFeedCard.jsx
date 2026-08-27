import { useEffect, useState } from "react";
import { CalendarRange, Copy, Check, RefreshCw } from "lucide-react";

import { getCalendarFeedToken, regenerateCalendarFeed, API_BASE } from "../api/atlasApi";
import SettingsCardSkeleton from "./SettingsCardSkeleton";


// Separate from GoogleCalendarCard/AppleCalendarCard - this isn't a
// two-way connection to a specific provider, it's a plain, read-only
// "subscribe by URL" feed that works in literally any calendar app
// (Apple Calendar, Google Calendar, Outlook, Fantastical, anything),
// without ever asking for a password or an OAuth grant. The tradeoff
// is one-way (Atlas -> calendar app only) and most apps only refresh a
// subscribed feed every so often, not instantly - worth it for anyone
// who just wants their schedule visible somewhere without setting up
// a full two-way sync.
function CalendarFeedCard() {

  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [confirmingRegenerate, setConfirmingRegenerate] = useState(false);
  const [error, setError] = useState("");


  useEffect(() => {

    getCalendarFeedToken()
      .then((data) => setToken(data.token))
      .catch((err) => console.error("CALENDAR FEED TOKEN ERROR:", err))
      .finally(() => setLoading(false));

  }, []);


  const feedUrl = token ? `${API_BASE}/api/calendar/feed/${token}.ics` : "";


  const handleCopy = async () => {

    try {

      await navigator.clipboard.writeText(feedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);

    } catch (err) {

      console.error("COPY FEED URL ERROR:", err);

    }

  };


  const handleRegenerate = async () => {

    setRegenerating(true);
    setError("");

    try {

      const data = await regenerateCalendarFeed();
      setToken(data.token);
      setConfirmingRegenerate(false);

    } catch (err) {

      console.error("CALENDAR FEED REGENERATE ERROR:", err);
      setError(err.message || "Couldn't reset your calendar feed link. Please try again.");

    } finally {

      setRegenerating(false);

    }

  };


  if (loading) {
    return <SettingsCardSkeleton />;
  }

  return (

    <div className="rounded-2xl border border-border bg-surface/60 p-6">

      <h2 className="text-xl font-bold flex items-center gap-2">
        <CalendarRange size={20} />
        Subscribe to Your Schedule
      </h2>

      <p className="mt-2 text-sm text-fg-muted">
        A private link you can paste into any calendar app - Apple Calendar, Google Calendar, Outlook, anything that supports "subscribe by URL" - to see your Atlas appointments there too. One-way and read-only; most apps refresh it every so often rather than instantly.
      </p>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">

        <div className="min-w-0 flex-1 truncate rounded-lg border border-border bg-surface-muted p-3 text-sm text-fg-muted">
          {feedUrl}
        </div>

        <button
          onClick={handleCopy}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-500"
        >
          {copied ? <Check size={15} /> : <Copy size={15} />}
          {copied ? "Copied" : "Copy"}
        </button>

      </div>

      {error && (
        <p className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-4">

        {confirmingRegenerate ? (

          <div className="flex items-center gap-3">

            <span className="text-sm text-fg-muted">
              This breaks the old link everywhere it's already subscribed - reset it anyway?
            </span>

            <button
              onClick={handleRegenerate}
              disabled={regenerating}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-red-500 disabled:opacity-50"
            >
              {regenerating ? "Resetting..." : "Confirm"}
            </button>

            <button
              onClick={() => setConfirmingRegenerate(false)}
              className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold transition hover:bg-surface-muted"
            >
              Cancel
            </button>

          </div>

        ) : (

          <button
            onClick={() => setConfirmingRegenerate(true)}
            className="flex items-center gap-1.5 text-sm font-semibold text-fg-muted transition hover:text-fg"
          >
            <RefreshCw size={14} />
            Reset link
          </button>

        )}

      </div>

    </div>

  );

}

export default CalendarFeedCard;
