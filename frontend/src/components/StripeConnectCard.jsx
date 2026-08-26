import { useEffect, useState, useRef } from "react";
import { CreditCard, CheckCircle2 } from "lucide-react";

import { getStripeConnectStatus, startStripeOnboarding } from "../api/atlasApi";
import SettingsCardSkeleton from "./SettingsCardSkeleton";


function StripeConnectCard() {

  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");
  const connectingRef = useRef(false);


  useEffect(() => {

    getStripeConnectStatus()
      .then(setStatus)
      .catch((err) => console.error("STRIPE STATUS ERROR:", err))
      .finally(() => setLoading(false));

  }, []);


  const handleConnect = async () => {

    if (connectingRef.current) {
      return;
    }

    connectingRef.current = true;
    setConnecting(true);
    setError("");

    try {

      const { url } = await startStripeOnboarding();
      window.location.href = url;

    } catch (err) {

      console.error("STRIPE ONBOARDING ERROR:", err);
      setError(err.message || "Couldn't start Stripe setup. Please try again.");
      connectingRef.current = false;
      setConnecting(false);

    }

  };


  if (loading) {
    return <SettingsCardSkeleton />;
  }

  return (

    <div className="rounded-2xl border border-ink-700 bg-ink-900/60 p-6">

      <h2 className="text-xl font-bold flex items-center gap-2">
        <CreditCard size={20} />
        Get Paid Online
      </h2>

      {status?.onboarded ? (

        <>

          <p className="mt-2 flex items-center gap-2 text-sm text-green-400">
            <CheckCircle2 size={16} />
            Connected — customers can pay their invoices online from your portal.
          </p>

          <button
            onClick={handleConnect}
            disabled={connecting}
            className="mt-4 rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold transition hover:bg-ink-800 disabled:opacity-50"
          >
            Manage Stripe account
          </button>

        </>

      ) : (

        <>

          <p className="mt-2 text-sm text-slate-400">
            Connect a free Stripe account so customers can pay invoices right from their portal — the money goes straight to your own bank account, Atlas never touches it.
          </p>

          {error && (
            <p className="mt-3 text-sm text-red-400">
              {error}
            </p>
          )}

          <button
            onClick={handleConnect}
            disabled={connecting}
            className="mt-4 flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-500 disabled:opacity-50"
          >
            <CreditCard size={16} />
            {connecting ? "Redirecting..." : status?.connected ? "Finish connecting Stripe" : "Connect with Stripe"}
          </button>

        </>

      )}

    </div>

  );

}

export default StripeConnectCard;
