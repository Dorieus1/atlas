import { useEffect, useState } from "react";
import { BarChart3, DollarSign, Hourglass, PiggyBank, Repeat, Award, Wallet } from "lucide-react";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer
} from "recharts";

import { getAnalytics } from "../api/atlasApi";
import StatCard from "../components/dashboard/StatCard";
import { useTheme } from "../context/ThemeContext";

const COLORS = ["#f97316", "#2a3040"];

const PIPELINE_STAGES = [
  { key: "new", label: "New" },
  { key: "contacted", label: "Contacted" },
  { key: "qualified", label: "Qualified" },
  { key: "closed", label: "Closed" }
];

function formatMoney(amount) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount || 0);
}

function formatPercent(value) {
  return `${value || 0}%`;
}

function formatMonth(monthKey) {
  const [year, month] = monthKey.split("-");
  return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString(undefined, { month: "short" });
}

// Job costs (manually-entered quote expenses) and labor cost (from
// clock-in/out) are two genuinely separate sources, so this spells out
// whichever combination is actually present rather than collapsing them
// into one vague "job costs" figure - an owner who's only ever used one
// of the two shouldn't have to wonder which one a single number means.
function marginDescription(stats) {

  const parts = [];

  if (stats.expensesPaid > 0) {
    parts.push(`${formatMoney(stats.expensesPaid)} in job costs`);
  }

  if (stats.laborCost > 0) {
    parts.push(`${formatMoney(stats.laborCost)} in labor (${stats.laborHours}h)`);
  }

  if (parts.length === 0) {
    return "Collected revenue minus job costs and labor";
  }

  return `After ${parts.join(" and ")}`;

}

// Recharts' axis stroke and tooltip contentStyle are inline SVG/style
// props, not Tailwind classes - the theme-token migration that covered
// the rest of the app couldn't reach these, since there's no CSS
// selector for "this JS object property." Left alone, the tooltip's
// hardcoded near-black background+border (matching dark mode's own
// surface/border tokens) would still show a solid dark popup box on an
// otherwise light-themed page - broken-looking, and doubly so since the
// tooltip's TEXT color isn't set here at all and just inherits from the
// page body, which does correctly flip per theme. So only the container
// colors need a manual theme check; matches the exact hex values
// index.css uses for the same tokens in each theme.
const CHART_COLORS = {
  dark: { axisStroke: "#94a3b8", tooltipBg: "#0c0e15", tooltipBorder: "#1f2433" },
  light: { axisStroke: "#64748b", tooltipBg: "#ffffff", tooltipBorder: "#e2e8f0" }
};

function Analytics() {

  const { theme } = useTheme();
  const chartColors = CHART_COLORS[theme] || CHART_COLORS.dark;

  const [stats, setStats] = useState({
    customers: 0,
    leads: 0,
    hotLeads: 0,
    leadsByStatus: { new: 0, contacted: 0, qualified: 0, closed: 0 },
    leadsBySource: [],
    revenuePaid: 0,
    revenueOutstanding: 0,
    paidInvoiceCount: 0,
    outstandingInvoiceCount: 0,
    revenueByMonth: [],
    expensesPaid: 0,
    laborCost: 0,
    laborHours: 0,
    hourlyLaborCost: null,
    totalMargin: 0,
    repeatCustomerRate: 0,
    avgCustomerValue: 0,
    activeServiceAgreements: 0,
    monthlyRecurringRevenue: 0
  });

  const [loadError, setLoadError] = useState("");

  useEffect(() => {

    getAnalytics()
      .then((data) => {
        setStats(data);
        setLoadError("");
      })
      .catch((error) => {
        console.error(error);
        setLoadError("Couldn't load your analytics. Please refresh to try again.");
      });

  }, []);

  const funnelData = PIPELINE_STAGES.map((stage) => ({
    name: stage.label,
    value: stats.leadsByStatus[stage.key] || 0
  }));

  // Recharts' default tick generator picks a "nice" step size for the
  // axis range rather than one tick per integer, so a max value like 4
  // was rendering ticks "0, 1, 2, 4" (silently skipping 3) instead of one
  // tick per whole lead. An explicit list of every integer from 0 to the
  // max fixes that - but only makes sense while the max is small. Past
  // FUNNEL_TICK_CAP, one tick per lead would cram dozens of overlapping
  // labels onto the axis, which is worse than the skip it's meant to
  // fix - so beyond the cap, fall back to Recharts' own auto-ticking
  // (still integer-only via allowDecimals) rather than one tick per unit.
  const FUNNEL_TICK_CAP = 10;
  const funnelMax = Math.max(...funnelData.map((stage) => stage.value), 0);
  const funnelTicks = funnelMax <= FUNNEL_TICK_CAP
    ? Array.from({ length: funnelMax + 1 }, (_, i) => i)
    : undefined;

  const pieData = [
    { name: "Hot Leads", value: stats.hotLeads },
    { name: "Other Leads", value: Math.max(stats.leads - stats.hotLeads, 0) }
  ];

  const sourceData = (stats.leadsBySource || []).map((row) => ({
    name: row.label,
    value: row.count
  }));

  const SOURCE_TICK_CAP = 10;
  const sourceMax = Math.max(...sourceData.map((row) => row.value), 0);
  const sourceTicks = sourceMax <= SOURCE_TICK_CAP
    ? Array.from({ length: sourceMax + 1 }, (_, i) => i)
    : undefined;

  return (

    <div className="p-8">

      <h1 className="text-3xl font-bold flex items-center gap-2">
        <BarChart3 size={28} />
        Analytics
      </h1>

      <p className="mt-1 text-sm text-fg-faint">
        How your business is really doing.
      </p>

      {loadError && (
        <p className="mt-4 text-danger">
          {loadError}
        </p>
      )}

      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">

        <StatCard
          title="Revenue Collected"
          value={stats.revenuePaid}
          format={formatMoney}
          icon={<DollarSign size={20} />}
          description={`${stats.paidInvoiceCount} paid invoice${stats.paidInvoiceCount === 1 ? "" : "s"}`}
        />

        <StatCard
          title="Outstanding"
          value={stats.revenueOutstanding}
          format={formatMoney}
          icon={<Hourglass size={20} />}
          description={`${stats.outstandingInvoiceCount} unpaid invoice${stats.outstandingInvoiceCount === 1 ? "" : "s"}`}
        />

        <StatCard
          title="Profit Margin"
          value={stats.totalMargin}
          format={formatMoney}
          icon={<PiggyBank size={20} />}
          description={marginDescription(stats)}
        />

        <StatCard
          title="Repeat Customer Rate"
          value={stats.repeatCustomerRate}
          format={formatPercent}
          icon={<Repeat size={20} />}
          description="Of customers who've paid, how many paid more than once"
        />

        <StatCard
          title="Avg. Customer Value"
          value={stats.avgCustomerValue}
          format={formatMoney}
          icon={<Award size={20} />}
          description="Average revenue collected per paying customer"
        />

        <StatCard
          title="Monthly Recurring Revenue"
          value={stats.monthlyRecurringRevenue}
          format={formatMoney}
          icon={<Wallet size={20} />}
          description={`${stats.activeServiceAgreements} active plan${stats.activeServiceAgreements === 1 ? "" : "s"}`}
        />

      </div>

      <div className="mt-8 rounded-2xl border border-border bg-surface/60 p-6 transition hover:border-border-strong">

        <h2 className="text-xl font-bold mb-4">
          Revenue, Last 6 Months
        </h2>

        {stats.revenuePaid === 0 ? (

          <p className="text-fg-muted">
            No paid invoices yet — revenue will show up here as customers pay.
          </p>

        ) : (

          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={stats.revenueByMonth.map((m) => ({ name: formatMonth(m.month), value: m.total }))}>
              <XAxis dataKey="name" stroke={chartColors.axisStroke} />
              <YAxis stroke={chartColors.axisStroke} tickFormatter={(v) => formatMoney(v)} width={70} />
              <Tooltip
                formatter={(value) => formatMoney(value)}
                contentStyle={{
                  background: chartColors.tooltipBg,
                  border: `1px solid ${chartColors.tooltipBorder}`,
                  borderRadius: 8
                }}
              />
              <Bar dataKey="value" fill="#f97316" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>

        )}

      </div>

      <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">

        <div className="rounded-2xl border border-border bg-surface/60 p-6 transition hover:border-border-strong">

          <h2 className="text-xl font-bold mb-4">
            Lead Pipeline
          </h2>

          {stats.leads === 0 ? (

            <p className="text-fg-muted">
              No leads yet.
            </p>

          ) : (

            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={funnelData} layout="vertical" margin={{ left: 16 }}>
                <XAxis type="number" stroke={chartColors.axisStroke} allowDecimals={false} domain={[0, funnelMax]} ticks={funnelTicks} />
                <YAxis type="category" dataKey="name" stroke={chartColors.axisStroke} width={90} />
                <Tooltip
                  contentStyle={{
                    background: chartColors.tooltipBg,
                    border: `1px solid ${chartColors.tooltipBorder}`,
                    borderRadius: 8
                  }}
                />
                <Bar dataKey="value" fill="#f97316" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>

          )}

        </div>

        <div className="rounded-2xl border border-border bg-surface/60 p-6 transition hover:border-border-strong">

          <h2 className="text-xl font-bold mb-4">
            Lead Priority Mix
          </h2>

          {stats.leads === 0 ? (

            <p className="text-fg-muted">
              No leads yet.
            </p>

          ) : (

            <div className="relative">

              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={4}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: chartColors.tooltipBg,
                      border: `1px solid ${chartColors.tooltipBorder}`,
                      borderRadius: 8
                    }}
                  />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>

              <div className="pointer-events-none absolute inset-x-0 top-0 flex h-[224px] flex-col items-center justify-center">
                <span className="text-3xl font-bold">{stats.leads}</span>
                <span className="text-xs text-fg-muted">total lead{stats.leads === 1 ? "" : "s"}</span>
              </div>

            </div>

          )}

        </div>

        <div className="rounded-2xl border border-border bg-surface/60 p-6 transition hover:border-border-strong">

          <h2 className="text-xl font-bold mb-4">
            Lead Sources
          </h2>

          {stats.leads === 0 ? (

            <p className="text-fg-muted">
              No leads yet.
            </p>

          ) : (

            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={sourceData} layout="vertical" margin={{ left: 16 }}>
                <XAxis type="number" stroke={chartColors.axisStroke} allowDecimals={false} domain={[0, sourceMax]} ticks={sourceTicks} />
                <YAxis type="category" dataKey="name" stroke={chartColors.axisStroke} width={110} />
                <Tooltip
                  contentStyle={{
                    background: chartColors.tooltipBg,
                    border: `1px solid ${chartColors.tooltipBorder}`,
                    borderRadius: 8
                  }}
                />
                <Bar dataKey="value" fill="#f97316" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>

          )}

        </div>

      </div>

    </div>

  );

}

export default Analytics;
