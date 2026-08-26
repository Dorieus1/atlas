import { useEffect, useState } from "react";
import { BarChart3, DollarSign, Hourglass, PiggyBank, Repeat, Award } from "lucide-react";
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

function Analytics() {

  const [stats, setStats] = useState({
    customers: 0,
    leads: 0,
    hotLeads: 0,
    leadsByStatus: { new: 0, contacted: 0, qualified: 0, closed: 0 },
    revenuePaid: 0,
    revenueOutstanding: 0,
    paidInvoiceCount: 0,
    outstandingInvoiceCount: 0,
    revenueByMonth: [],
    expensesPaid: 0,
    totalMargin: 0,
    repeatCustomerRate: 0,
    avgCustomerValue: 0
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

  return (

    <div className="p-8">

      <h1 className="text-3xl font-bold flex items-center gap-2">
        <BarChart3 size={28} />
        Analytics
      </h1>

      <p className="mt-1 text-sm text-slate-500">
        How your business is really doing.
      </p>

      {loadError && (
        <p className="mt-4 text-red-400">
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
          description={stats.expensesPaid > 0 ? `After ${formatMoney(stats.expensesPaid)} in job costs` : "Collected revenue minus job costs"}
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

      </div>

      <div className="mt-8 rounded-2xl border border-ink-700 bg-ink-900/60 p-6 transition hover:border-ink-600">

        <h2 className="text-xl font-bold mb-4">
          Revenue, Last 6 Months
        </h2>

        {stats.revenuePaid === 0 ? (

          <p className="text-slate-400">
            No paid invoices yet — revenue will show up here as customers pay.
          </p>

        ) : (

          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={stats.revenueByMonth.map((m) => ({ name: formatMonth(m.month), value: m.total }))}>
              <XAxis dataKey="name" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" tickFormatter={(v) => formatMoney(v)} width={70} />
              <Tooltip
                formatter={(value) => formatMoney(value)}
                contentStyle={{
                  background: "#0c0e15",
                  border: "1px solid #1f2433",
                  borderRadius: 8
                }}
              />
              <Bar dataKey="value" fill="#f97316" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>

        )}

      </div>

      <div className="mt-8 grid gap-5 md:grid-cols-2">

        <div className="rounded-2xl border border-ink-700 bg-ink-900/60 p-6 transition hover:border-ink-600">

          <h2 className="text-xl font-bold mb-4">
            Lead Pipeline
          </h2>

          {stats.leads === 0 ? (

            <p className="text-slate-400">
              No leads yet.
            </p>

          ) : (

            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={funnelData} layout="vertical" margin={{ left: 16 }}>
                <XAxis type="number" stroke="#94a3b8" allowDecimals={false} domain={[0, funnelMax]} ticks={funnelTicks} />
                <YAxis type="category" dataKey="name" stroke="#94a3b8" width={90} />
                <Tooltip
                  contentStyle={{
                    background: "#0c0e15",
                    border: "1px solid #1f2433",
                    borderRadius: 8
                  }}
                />
                <Bar dataKey="value" fill="#f97316" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>

          )}

        </div>

        <div className="rounded-2xl border border-ink-700 bg-ink-900/60 p-6 transition hover:border-ink-600">

          <h2 className="text-xl font-bold mb-4">
            Lead Priority Mix
          </h2>

          {stats.leads === 0 ? (

            <p className="text-slate-400">
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
                      background: "#0c0e15",
                      border: "1px solid #1f2433",
                      borderRadius: 8
                    }}
                  />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>

              <div className="pointer-events-none absolute inset-x-0 top-0 flex h-[224px] flex-col items-center justify-center">
                <span className="text-3xl font-bold">{stats.leads}</span>
                <span className="text-xs text-slate-400">total lead{stats.leads === 1 ? "" : "s"}</span>
              </div>

            </div>

          )}

        </div>

      </div>

    </div>

  );

}

export default Analytics;
