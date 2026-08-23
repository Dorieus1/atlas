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



  return (

    <div className="card">

      <h2>
        Business Profile
      </h2>

      {error && (
        <p style={{ color: "#f87171" }}>
          {error}
        </p>
      )}

      {success && (
        <p style={{ color: "#4ade80" }}>
          {success}
        </p>
      )}

      <input

        value={form.name}

        placeholder="Business name"

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

        onChange={(e) =>
          setForm({
            ...form,
            services: e.target.value
          })
        }

      />


      <button onClick={updateBusiness} disabled={saving}>
        {saving ? "Saving..." : "Save Business"}
      </button>


    </div>

  );

}


export default BusinessProfile;