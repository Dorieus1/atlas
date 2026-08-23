import { useEffect, useState } from "react";
import { API_BASE } from "../api/atlasApi";

function BusinessProfile({ business }) {

  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    industry: "",
    services: "",
  });

  const [error, setError] = useState("");

  const [success, setSuccess] = useState("");

  const [saving, setSaving] = useState(false);


  useEffect(() => {

    if (business) {

      setForm({

        name: business.name || "",
        phone: business.phone || "",
        email: business.email || "",
        address: business.address || "",
        industry: business.industry || "",
        services: business.services || "",

      });

    }

  }, [business]);



  const updateBusiness = async () => {

    if (!form.name.trim()) {

      setError("Business name is required.");

      setSuccess("");

      return;

    }

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

            name: form.name.trim()

          }),

        }
      );

      if (!res.ok) {

        const data = await res.json().catch(() => ({}));

        throw new Error(data.error || "Failed to update business");

      }

      setSuccess("Business updated");

    } catch (err) {

      setError(err.message);

    } finally {

      setSaving(false);

    }

  };



  if (!business) {

    return null;

  }



  const inputClass =
    "w-full bg-slate-900 text-white placeholder:text-slate-500 border border-slate-700 rounded-lg p-3 mb-3";

  return (

    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mt-6">

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


      <button

        onClick={updateBusiness}

        disabled={saving}

        className="mt-2 bg-blue-600 hover:bg-blue-700 px-5 py-2 rounded-lg disabled:opacity-50"

      >

        {saving ? "Saving..." : "Save Business"}

      </button>


    </div>

  );

}


export default BusinessProfile;