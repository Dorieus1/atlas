// Shared placeholder for the Settings > Integrations cards
// (StripeConnectCard, GoogleCalendarCard, AppleCalendarCard,
// CalendarFeedCard) while each independently fetches its own
// connection status. They used to each return null during that fetch,
// which meant the whole page popped its content in piecemeal and
// unevenly as each card's own request resolved - jarring rather than a
// deliberate loading state. This matches each real card's outer
// container exactly (same classes, same approximate content height),
// so swapping from skeleton to real content causes no layout shift.
function SettingsCardSkeleton() {

  return (

    <div className="rounded-2xl border border-ink-700 bg-ink-900/60 p-6 animate-pulse">

      <div className="flex items-center gap-2">
        <div className="h-5 w-5 rounded bg-ink-700" />
        <div className="h-5 w-48 rounded bg-ink-700" />
      </div>

      <div className="mt-3 h-3.5 w-full max-w-md rounded bg-ink-800" />
      <div className="mt-2 h-3.5 w-3/4 max-w-sm rounded bg-ink-800" />

      <div className="mt-4 h-9 w-44 rounded-lg bg-ink-800" />

    </div>

  );

}

export default SettingsCardSkeleton;
