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
    "w-full bg-ink-800 text-white placeholder:text-slate-500 border border-ink-700 rounded-lg p-3 mb-3";

  return (

    <div className="bg-ink-900/60 border border-ink-700 rounded-2xl p-6 mt-6">

      <h2 className="text-xl font-bold mb-4">
        Business Profile
      </h2>

      {error && (
        <p className="text-red-400 mb-3">
          {error}
        </p>
      )}

      {success && (
        <p className="text-green-400 mb-3">
          {success}
        </p>
      )}

      <input

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


      <input

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


      <input

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


      <input

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


      <input

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


      <textarea

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


      <input

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

      <p className="text-xs text-slate-500 -mt-2 mb-3">
        Customers who get a review request will be sent this link.
      </p>


      <div className="border-t border-ink-700 pt-4 mt-2 mb-3">

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

        <p className="text-xs text-slate-500 mb-3">
          {hoursEnabled
            ? "Customers requesting an appointment through your portal will only be able to pick a time within these hours."
            : "Not set - customers can request an appointment at any time."}
        </p>

        {hoursEnabled && (

          <div className="flex flex-col gap-2">

            {DAYS.map(({ key, label }) => {

              const day = hours && hours[key];
              const open = !!day;

              return (

                <div
                  key={key}
                  className="flex flex-wrap items-center gap-3 bg-ink-800 border border-ink-700 rounded-lg p-3"
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
                        value={day.open}
                        onChange={(e) => setDayTime(key, "open", e.target.value)}
                        className="bg-ink-900 border border-ink-700 rounded-md px-2 py-1"
                      />

                      <span className="text-slate-500">to</span>

                      <input
                        type="time"
                        value={day.close}
                        onChange={(e) => setDayTime(key, "close", e.target.value)}
                        className="bg-ink-900 border border-ink-700 rounded-md px-2 py-1"
                      />

                    </div>

                  ) : (

                    <span className="text-sm text-slate-500">
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