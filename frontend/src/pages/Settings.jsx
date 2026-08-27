import { useEffect, useState } from "react";
import { Settings as SettingsIcon, Key } from "lucide-react";
import { getBusinesses } from "../api/atlasApi";
import BusinessProfile from "../components/BusinessProfile";
import PublicLinkCard from "../components/PublicLinkCard";
import StripeConnectCard from "../components/StripeConnectCard";
import GoogleCalendarCard from "../components/GoogleCalendarCard";
import AppleCalendarCard from "../components/AppleCalendarCard";
import CalendarFeedCard from "../components/CalendarFeedCard";
import TeamPanel from "../components/TeamPanel";
import ChangePasswordPanel from "../components/ChangePasswordPanel";
import SavedServicesPanel from "../components/SavedServicesPanel";
import TagManagerPanel from "../components/TagManagerPanel";
import Skeleton from "../components/Skeleton";
import SettingsCardSkeleton from "../components/SettingsCardSkeleton";

// Settings grew, one feature at a time, into nine stacked cards on a
// single flat page - functional, but not the kind of first impression
// a business owner should get from their own settings screen. Grouping
// them into a small set of named tabs (matching how Stripe/Linear/
// Notion organize their own settings) keeps every existing panel
// exactly as-is - only where it lives changed, nothing about how it
// works.
const TABS = [
  { key: "general", label: "General" },
  { key: "integrations", label: "Integrations" },
  { key: "customization", label: "Customization" },
  { key: "team", label: "Team & Account" }
];

function Settings() {

  const [business, setBusiness] = useState(null);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  const [activeTab, setActiveTab] = useState("general");

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

      <h1 className="text-3xl font-bold flex items-center gap-2">
        <SettingsIcon size={28} />
        Settings
      </h1>

      <p className="mt-1 text-sm text-slate-500">
        Your business, your team, your account.
      </p>

      {loading && (

        // Matches the structure of the loaded page below (a tab bar, then
        // a couple of cards) instead of a bare "Loading..." sentence - the
        // individual Integrations cards already use this same
        // SettingsCardSkeleton while they fetch their own connection
        // status, so this keeps the whole page consistent about how it
        // shows "still fetching" rather than mixing a plain text state in
        // at the top level.
        <div className="mt-6">

          <div className="flex flex-wrap gap-1.5 border-b border-ink-800 pb-2.5">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-8 w-28" />
          </div>

          <div className="mt-6 flex flex-col gap-6">
            <SettingsCardSkeleton />
            <SettingsCardSkeleton />
          </div>

        </div>

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

        <>

          <div className="mt-6 flex flex-wrap gap-1.5 border-b border-ink-800">

            {TABS.map((tab) => (

              <button

                key={tab.key}

                onClick={() => setActiveTab(tab.key)}

                className={`
                  -mb-px
                  rounded-t-lg
                  border-b-2
                  px-4
                  py-2.5
                  text-sm
                  transition
                  ${
                    activeTab === tab.key
                      ? "border-brand-500 bg-brand-600/10 font-semibold text-brand-400"
                      : "border-transparent text-slate-400 hover:text-white"
                  }
                `}

              >

                {tab.label}

              </button>

            ))}

          </div>

          <div className="mt-6 flex flex-col gap-6">

            {activeTab === "general" && (
              <BusinessProfile business={business} />
            )}

            {activeTab === "integrations" && (

              <>
                <PublicLinkCard business={business} />
                <PublicLinkCard
                  business={business}
                  path="/portal"
                  title={<><Key size={20} /> Your Customer Portal</>}
                  description="Share this link with customers so they can log in with their email and see their own appointments, quotes, invoices, and photos."
                />
                <StripeConnectCard />
                <GoogleCalendarCard />
                <AppleCalendarCard />
                <CalendarFeedCard />
              </>

            )}

            {activeTab === "customization" && (

              <>
                <SavedServicesPanel />
                <TagManagerPanel />
              </>

            )}

            {activeTab === "team" && (

              <>
                <TeamPanel />
                <ChangePasswordPanel />
              </>

            )}

          </div>

        </>

      )}

    </div>

  );

}

export default Settings;
