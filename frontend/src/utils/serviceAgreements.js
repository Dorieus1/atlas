// Shared between the per-customer card (components/ServiceAgreements.jsx)
// and the business-wide list (pages/Plans.jsx) - both render the exact
// same plan shape, and there's no reason for their frequency labels,
// status colors, or "running low" threshold to ever drift apart.

export const FREQUENCY_OPTIONS = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Every 3 months" },
  { value: "annually", label: "Annually" }
];

export const FREQUENCY_LABELS = Object.fromEntries(FREQUENCY_OPTIONS.map((f) => [f.value, f.label]));

export const STATUS_STYLES = {
  active: "bg-success/20 text-success",
  paused: "bg-warning/20 text-warning",
  cancelled: "bg-slate-500/20 text-fg-muted"
};

// Below this many scheduled visits left, an active plan is flagged as
// running low - a real gap found in review: renewal is 100% manual (the
// "Add More Visits" button), so a plan that quietly runs out just stops
// existing with no warning to anyone. 3 is arbitrary but deliberately
// low relative to the 12-visit batch renewServiceAgreement adds, so the
// flag reads as "renew soon," not "already overdue."
export const LOW_VISITS_THRESHOLD = 3;

export function formatMoney(amount) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(amount || 0);
}

export function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString(undefined, { dateStyle: "medium" });
}
