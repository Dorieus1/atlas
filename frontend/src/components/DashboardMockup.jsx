// Static, presentational recreation of the Atlas dashboard for marketing use
// (Landing page hero). No state, no data fetching, no real components —
// purely decorative markup styled to match the real dashboard at a glance.

const MOCK_STATS = [
  { title: "Customers", value: "128", icon: "👥", description: "Total customers" },
  { title: "Total Leads", value: "34", icon: "📈", description: "Captured opportunities" },
  { title: "Hot Leads", value: "9", icon: "🔥", description: "Needs attention" },
  { title: "Conversion", value: "26%", icon: "🎯", description: "Lead quality score" }
];

const MOCK_LEADS = [
  { name: "Priya Shah", interest: "Kitchen remodel quote", priority: "hot" },
  { name: "Marcus Webb", interest: "Follow-up on estimate", priority: "warm" },
  { name: "Dana Ruiz", interest: "Asked about scheduling", priority: "new" }
];

const PRIORITY_STYLES = {
  hot: "bg-red-500/20 text-red-400",
  warm: "bg-brand-500/20 text-brand-400",
  new: "bg-slate-500/20 text-slate-300"
};

function MockStatCard({ title, value, icon, description }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-ink-700 bg-ink-900/60 p-4">
      <div
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-500/60 to-transparent"
        aria-hidden="true"
      />
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-400">{title}</p>
          <h3 className="font-display mt-1.5 text-2xl font-bold tracking-tight">
            {value}
          </h3>
        </div>
        <div className="rounded-lg border border-brand-500/20 bg-gradient-to-br from-brand-500/20 to-brand-600/10 p-2 text-sm">
          {icon}
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-500">{description}</p>
    </div>
  );
}

function DashboardMockup({ className = "" }) {
  return (
    <div className={`w-full ${className}`} aria-hidden="true">
      <div className="overflow-hidden rounded-2xl border border-ink-700 bg-ink-900 shadow-2xl shadow-black/50">
        {/* Browser chrome */}
        <div className="flex items-center gap-3 border-b border-ink-700 bg-ink-850 px-4 py-3">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500/40" />
            <span className="h-2.5 w-2.5 rounded-full bg-yellow-500/40" />
            <span className="h-2.5 w-2.5 rounded-full bg-green-500/40" />
          </div>
          <div className="flex-1">
            <div className="mx-auto flex max-w-xs items-center justify-center rounded-full border border-ink-700 bg-ink-900 px-3 py-1 text-[11px] text-slate-500">
              app.atlas.com/dashboard
            </div>
          </div>
        </div>

        {/* Dashboard content */}
        <div className="bg-ink-950 p-5 sm:p-7">
          <p className="text-xs font-medium text-brand-400">Thursday, August 20</p>
          <h2 className="font-display mb-5 mt-1 text-xl font-bold tracking-tight sm:text-2xl">
            Good morning, Alex
          </h2>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {MOCK_STATS.map((stat) => (
              <MockStatCard key={stat.title} {...stat} />
            ))}
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-12">
            <div className="rounded-2xl border border-ink-700 bg-ink-900/60 p-5 lg:col-span-7">
              <h3 className="text-base font-bold">☀️ Atlas Daily Briefing</h3>
              <div className="mt-4 space-y-2.5 rounded-xl bg-ink-800 p-4">
                <p className="text-sm leading-relaxed text-slate-300">
                  You have 3 hot leads waiting on a reply — Priya Shah asked about
                  kitchen remodel pricing yesterday.
                </p>
                <p className="text-sm leading-relaxed text-slate-400">
                  2 follow-ups are due today, and 1 quote is ready to send.
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-ink-700 bg-ink-900/60 p-5 lg:col-span-5">
              <h3 className="text-base font-bold">🔥 Lead Pipeline</h3>
              <div className="mt-4 space-y-2.5">
                {MOCK_LEADS.map((lead) => (
                  <div
                    key={lead.name}
                    className="flex items-center justify-between gap-3 rounded-lg bg-ink-800 p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{lead.name}</p>
                      <p className="truncate text-xs text-slate-400">{lead.interest}</p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${PRIORITY_STYLES[lead.priority]}`}
                    >
                      {lead.priority}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DashboardMockup;
