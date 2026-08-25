import { useEffect, useState } from "react";
import { getBusinesses } from "../api/atlasApi";
import BusinessProfile from "../components/BusinessProfile";
import PublicLinkCard from "../components/PublicLinkCard";
import StripeConnectCard from "../components/StripeConnectCard";
import GoogleCalendarCard from "../components/GoogleCalendarCard";
import TeamPanel from "../components/TeamPanel";
import ChangePasswordPanel from "../components/ChangePasswordPanel";
import SavedServicesPanel from "../components/SavedServicesPanel";
import TagManagerPanel from "../components/TagManagerPanel";

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

      <p className="mt-1 text-sm text-slate-500">
        Your business, your team, your account.
      </p>

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

      {!loading && !error && business && (
        <div className="mt-6 flex flex-col gap-6">
          <PublicLinkCard business={business} />
          <PublicLinkCard
            business={business}
            path="/portal"
            title="🔑 Your Customer Portal"
            description="Share this link with customers so they can log in with their email and see their own appointments, quotes, invoices, and photos."
          />
          <StripeConnectCard />
          <GoogleCalendarCard />
        </div>
      )}

      <BusinessProfile business={business} />

      {!loading && !error && business && (
        <>
          <SavedServicesPanel />
          <TagManagerPanel />
          <TeamPanel />
          <ChangePasswordPanel />
        </>
      )}

    </div>

  );

}

export default Settings;
