import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getBusinesses } from "../api/atlasApi";
import BusinessProfile from "../components/BusinessProfile";

function Settings() {

  const [business, setBusiness] = useState(null);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  const navigate = useNavigate();

  useEffect(() => {

    async function loadBusiness() {

      try {

        const businesses = await getBusinesses();

        setBusiness(businesses[0] || null);

      } catch (err) {

        console.error("Failed to load business:", err);

        if (err.status === 401) {

          localStorage.removeItem("token");
          localStorage.removeItem("business_id");
          localStorage.removeItem("user");

          navigate("/login");

          return;

        }

        setError("Couldn't load your business settings. Please try again.");

      } finally {

        setLoading(false);

      }

    }

    loadBusiness();

  }, [navigate]);

  return (

    <div className="p-8">

      <h1 className="text-3xl font-bold">
        ⚙️ Settings
      </h1>

      {loading && (
        <p className="mt-6 text-slate-400">
          Loading...
        </p>
      )}

      {!loading && error && (
        <p className="mt-6 text-red-400">
          {error}
        </p>
      )}

      {!loading && !error && !business && (
        <p className="mt-6 text-slate-400">
          No business profile found yet.
        </p>
      )}

      <BusinessProfile business={business} />

    </div>

  );

}

export default Settings;
