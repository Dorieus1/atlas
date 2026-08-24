import { useEffect, useState } from "react";
import { getBusinesses } from "../api/atlasApi";
import BusinessProfile from "../components/BusinessProfile";
import TeamPanel from "../components/TeamPanel";
import ChangePasswordPanel from "../components/ChangePasswordPanel";

function Settings() {

  const [business, setBusiness] = useState(null);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  useEffect(() => {

    async function loadBusiness() {

      try {

        const businesses = await getBusinesses();

        setBusiness(businesses[0] || null);

      } catch (err) {

        // A 401 here already triggers a redirect to login inside the
        // shared request() helper, so there's nothing further to do -
        // this branch only runs for genuine unexpected failures.
        if (err.status !== 401) {

          console.error("Failed to load business:", err);

          setError("Couldn't load your business settings. Please try again.");

        }

      } finally {

        setLoading(false);

      }

    }

    loadBusiness();

  }, []);

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

      {!loading && !error && business && (
        <>
          <TeamPanel />
          <ChangePasswordPanel />
        </>
      )}

    </div>

  );

}

export default Settings;
