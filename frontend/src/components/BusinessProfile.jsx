import { useEffect, useState, useRef } from "react";
import { API_BASE, handleSessionExpired } from "../api/atlasApi";

const DAYS = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
];

const DEFAULT_OPEN = "09:00";
const DEFAULT_CLOSE = "17:00";

// A practical, not-exhaustive list of IANA zones - the major US/Canada
// zones plus a handful of other common ones. Matches this product's
// existing US-centric assumptions elsewhere (e.g. Stripe identity is
// hardcoded to country "us"). "" means "not set" (defaults to UTC).
const TIMEZONE_OPTIONS = [
  { value: "", label: "Not set (UTC)" },
  { value: "America/New_York", label: "Eastern Time (US & Canada)" },
  { value: "America/Chicago", label: "Central Time (US & Canada)" },
  { value: "America/Denver", label: "Mountain Time (US & Canada)" },
  { value: "America/Phoenix", label: "Arizona (no DST)" },
  { value: "America/Los_Angeles", label: "Pacific Time (US & Canada)" },
  { value: "America/Anchorage", label: "Alaska Time" },
  { value: "Pacific/Honolulu", label: "Hawaii Time" },
  { value: "America/Toronto", label: "Eastern Time (Toronto)" },
  { value: "America/Vancouver", label: "Pacific Time (Vancouver)" },
  { value: "Europe/London", label: "London" },
  { value: "UTC", label: "UTC" },
];

// business.business_hours comes back from the API as a JSON string (or
// null if the business hasn't configured hours yet). Parsed into a plain
// { mon: {open, close} | null, ... } object for the form to edit.
function parseBusinessHours(raw) {

  if (!raw) {
    return null;
  }

  try {

    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;

  } catch (err) {

    return null;

  }

}

function BusinessProfile({ business }) {

  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    industry: "",
    services: "",
    review_link: "",
    timezone: "",
    default_tax_rate: "",
    default_hourly_labor_cost: "",
  });

  // null means "hours not configured" (nothing enforced). Once the owner
  // toggles any day on, this becomes an object with all seven day keys.
  const [hours, setHours] = useState(null);

  const [hoursEnabled, setHoursEnabled] = useState(false);

  const [error, setError] = useState("");

  const [success, setSuccess] = useState("");

  const [saving, setSaving] = useState(false);

  const savingRef = useRef(false);


  useEffect(() => {

    if (business) {

      setForm({

        name: business.name || "",
        phone: business.phone || "",
        email: business.email || "",
        address: business.address || "",
        industry: business.industry || "",
        services: business.services || "",
        review_link: business.review_link || "",
        timezone: business.timezone || "",
        default_tax_rate: business.default_tax_rate === null || business.default_tax_rate === undefined
          ? ""
          : String(business.default_tax_rate),
        default_hourly_labor_cost: business.default_hourly_labor_cost === null || business.default_hourly_labor_cost === undefined
          ? ""
          : String(business.default_hourly_labor_cost),

      });

      const parsedHours = parseBusinessHours(business.business_hours);

      if (parsedHours) {

        setHoursEnabled(true);
        setHours(parsedHours);

      } else {

        setHoursEnabled(false);
        setHours(null);

      }

    }

  }, [business]);



  const toggleDay = (dayKey, open) => {

    setHours((prev) => ({

      ...(prev || {}),

      [dayKey]: open
        ? { open: DEFAULT_OPEN, close: DEFAULT_CLOSE }
        : null

    }));

  };



  const setDayTime = (dayKey, field, value) => {

    setHours((prev) => ({

      ...(prev || {}),

      [dayKey]: {
        ...(prev && prev[dayKey] ? prev[dayKey] : { open: DEFAULT_OPEN, close: DEFAULT_CLOSE }),
        [field]: value
      }

    }));

  };



  const toggleHoursEnabled = (enabled) => {

    setHoursEnabled(enabled);

    if (enabled && !hours) {

      // Sensible default: open Mon-Fri 9-5, closed weekends. The owner
      // can adjust or turn any day off from here.
      setHours({
        mon: { open: DEFAULT_OPEN, close: DEFAULT_CLOSE },
        tue: { open: DEFAULT_OPEN, close: DEFAULT_CLOSE },
        wed: { open: DEFAULT_OPEN, close: DEFAULT_CLOSE },
        thu: { open: DEFAULT_OPEN, close: DEFAULT_CLOSE },
        fri: { open: DEFAULT_OPEN, close: DEFAULT_CLOSE },
        sat: null,
        sun: null,
      });

    }

  };



  const updateBusiness = async () => {

    if (!form.name.trim()) {

      setError("Business name is required.");

      setSuccess("");

      return;

    }

    if (savingRef.current) {

      return;

    }

    savingRef.current = true;

    setError("");

    setSuccess("");

    setSaving(true);

    try {

      const token = localStorage.getItem("token");

      const res = await fetch(
        `${API_BASE}/api/business`,
        {

          method: "PUT",

          headers: {
            "Content-Type": "application/json",
            ...(token
              ? { Authorization: `Bearer ${token}` }
              : {})
          },

          body: JSON.stringify({

            id: business.id,

            ...form,

            name: form.name.trim(),

            business_hours: hoursEnabled ? hours : null

          }),

        }
      );

      if (!res.ok) {

        if (handleSessionExpired(res)) {

          return;

        }

        const data = await res.json().catch(() => ({}));

        throw new Error(data.error || "Failed to update business");

      }

      setSuccess("Business updated");

    } catch (err) {

      setError(err.message);

    } finally {

      savingRef.current = false;

      setSaving(false);

    }

  };



  if (!business) {

    return null;

  }



  const inputClass =
    "w-full bg-surface-muted text-fg placeholder:text-fg-faint border border-border rounded-lg p-3 mb-3";

  return (

    <div className="bg-surface/60 border border-border rounded-2xl p-6 mt-6">

      <h2 className="text-xl font-bold mb-4">
        Business Profile
      </h2>

      {error && (
        <p className="text-danger mb-3">
          {error}
        </p>
      )}

      {success && (
        <p className="text-success mb-3">
          {success}
        </p>
      )}

      <label htmlFor="business-name" className="mb-1 block text-xs font-medium uppercase tracking-wide text-fg-faint">
        Business Name
      </label>

      <input

        id="business-name"

        value={form.name}

        placeholder="Business name"

        className={inputClass}

        onChange={(e) =>
          setForm({
            ...form,
            name: e.target.value
          })
        }

      />


      <label htmlFor="business-phone" className="mb-1 block text-xs font-medium uppercase tracking-wide text-fg-faint">
        Phone
      </label>

      <input

        id="business-phone"

        value={form.phone}

        placeholder="Phone"

        className={inputClass}

        onChange={(e) =>
          setForm({
            ...form,
            phone: e.target.value
          })
        }

      />


      <label htmlFor="business-email" className="mb-1 block text-xs font-medium uppercase tracking-wide text-fg-faint">
        Email
      </label>

      <input

        id="business-email"

        value={form.email}

        placeholder="Email"

        className={inputClass}

        onChange={(e) =>
          setForm({
            ...form,
            email: e.target.value
          })
        }

      />


      <label htmlFor="business-address" className="mb-1 block text-xs font-medium uppercase tracking-wide text-fg-faint">
        Address
      </label>

      <input

        id="business-address"

        value={form.address}

        placeholder="Address"

        className={inputClass}

        onChange={(e) =>
          setForm({
            ...form,
            address: e.target.value
          })
        }

      />


      <label htmlFor="business-industry" className="mb-1 block text-xs font-medium uppercase tracking-wide text-fg-faint">
        Industry
      </label>

      <input

        id="business-industry"

        value={form.industry}

        placeholder="Industry"

        className={inputClass}

        onChange={(e) =>
          setForm({
            ...form,
            industry: e.target.value
          })
        }

      />


      <label htmlFor="business-services" className="mb-1 block text-xs font-medium uppercase tracking-wide text-fg-faint">
        Services
      </label>

      <textarea

        id="business-services"

        value={form.services}

        placeholder="Services"

        className={`${inputClass} h-24`}

        onChange={(e) =>
          setForm({
            ...form,
            services: e.target.value
          })
        }

      />


      <label htmlFor="business-review-link" className="mb-1 block text-xs font-medium uppercase tracking-wide text-fg-faint">
        Review Link
      </label>

      <input

        id="business-review-link"

        value={form.review_link}

        placeholder="Review link (e.g. your Google Business review URL)"

        className={inputClass}

        onChange={(e) =>
          setForm({
            ...form,
            review_link: e.target.value
          })
        }

      />

      <p className="text-xs text-fg-faint -mt-2 mb-3">
        Customers who get a review request will be sent this link.
      </p>

      <label htmlFor="business-tax-rate" className="mb-1 block text-xs font-medium uppercase tracking-wide text-fg-faint">
        Default Tax Rate
      </label>

      <input

        id="business-tax-rate"

        type="number"
        min="0"
        max="100"
        step="0.01"

        value={form.default_tax_rate}

        placeholder="e.g. 8.5 for 8.5%"

        className={inputClass}

        onChange={(e) =>
          setForm({
            ...form,
            default_tax_rate: e.target.value
          })
        }

      />

      <p className="text-xs text-fg-faint -mt-2 mb-3">
        Applied automatically to new quotes and invoices - leave blank if you don't collect sales tax. You can still override it on any individual quote.
      </p>

      <label htmlFor="business-labor-cost" className="mb-1 block text-xs font-medium uppercase tracking-wide text-fg-faint">
        Average Hourly Labor Cost
      </label>

      <input

        id="business-labor-cost"

        type="number"
        min="0"
        step="0.01"

        value={form.default_hourly_labor_cost}

        placeholder="e.g. 25 for $25/hour"

        className={inputClass}

        onChange={(e) =>
          setForm({
            ...form,
            default_hourly_labor_cost: e.target.value
          })
        }

      />

      <p className="text-xs text-fg-faint -mt-2 mb-3">
        Used with clock-in/out on appointments to work out real labor cost for the Profit Margin report - leave blank to leave labor out of that number.
      </p>


      <div className="border-t border-border pt-4 mt-2 mb-3">

        <label className="flex items-center gap-2 mb-3 cursor-pointer select-none">

          <input
            type="checkbox"
            checked={hoursEnabled}
            onChange={(e) => toggleHoursEnabled(e.target.checked)}
            className="h-4 w-4 accent-brand-600"
          />

          <span className="font-semibold">
            Business Hours
          </span>

        </label>

        <p className="text-xs text-fg-faint mb-3">
          {hoursEnabled
            ? "Customers requesting an appointment through your portal will only be able to pick a time within these hours."
            : "Not set - customers can request an appointment at any time."}
        </p>

        <div className="mb-3">

          <label className="block text-sm text-fg-muted mb-1">
            Timezone
          </label>

          <select
            value={form.timezone}
            onChange={(e) =>
              setForm({
                ...form,
                timezone: e.target.value
              })
            }
            className="w-full bg-surface-muted text-fg border border-border rounded-lg p-3"
          >

            {TIMEZONE_OPTIONS.map(({ value, label }) => (
              <option key={value || "unset"} value={value}>
                {label}
              </option>
            ))}

          </select>

          <p className="text-xs text-fg-faint mt-1">
            Business hours above are enforced in this timezone.
          </p>

        </div>

        {hoursEnabled && (

          <div className="flex flex-col gap-2">

            {DAYS.map(({ key, label }) => {

              const day = hours && hours[key];
              const open = !!day;

              return (

                <div
                  key={key}
                  className="flex flex-wrap items-center gap-3 bg-surface-muted border border-border rounded-lg p-3"
                >

                  <label className="flex items-center gap-2 w-32 shrink-0 cursor-pointer select-none">

                    <input
                      type="checkbox"
                      checked={open}
                      onChange={(e) => toggleDay(key, e.target.checked)}
                      className="h-4 w-4 accent-brand-600"
                    />

                    <span>{label}</span>

                  </label>

                  {open ? (

                    <div className="flex items-center gap-2 text-sm">

                      <input
                        type="time"
                        aria-label={`${label} opening time`}
                        value={day.open}
                        onChange={(e) => setDayTime(key, "open", e.target.value)}
                        className="bg-surface border border-border rounded-md px-2 py-1"
                      />

                      <span className="text-fg-faint">to</span>

                      <input
                        type="time"
                        aria-label={`${label} closing time`}
                        value={day.close}
                        onChange={(e) => setDayTime(key, "close", e.target.value)}
                        className="bg-surface border border-border rounded-md px-2 py-1"
                      />

                    </div>

                  ) : (

                    <span className="text-sm text-fg-faint">
                      Closed
                    </span>

                  )}

                </div>

              );

            })}

          </div>

        )}

      </div>


      <button

        onClick={updateBusiness}

        disabled={saving}

        className="mt-2 bg-brand-600 hover:bg-brand-500 px-5 py-2 rounded-lg disabled:opacity-50"

      >

        {saving ? "Saving..." : "Save Business"}

      </button>


    </div>

  );

}


export default BusinessProfile;