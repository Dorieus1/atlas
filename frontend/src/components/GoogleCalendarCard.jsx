import { useEffect, useState, useRef } from "react";
import { CalendarDays, CheckCircle2 } from "lucide-react";

import { getGoogleCalendarStatus, startGoogleCalendarConnect, disconnectGoogleCalendar } from "../api/atlasApi";
import SettingsCardSkeleton from "./SettingsCardSkeleton";


function GoogleCalendarCard() {

  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState("");
  const connectingRef = useRef(false);


  useEffect(() => {

    getGoogleCalendarStatus()
      .then(setStatus)
      .catch((err) => console.error("GOOGLE CALENDAR STATUS ERROR:", err))
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

      const { url } = await startGoogleCalendarConnect();
      window.location.href = url;

    } catch (err) {

      console.error("GOOGLE CALENDAR CONNECT ERROR:", err);
      setError(err.message || "Couldn't start connecting Google Calendar. Please try again.");
      connectingRef.current = false;
      setConnecting(false);

    }

  };


  const handleDisconnect = async () => {

    setDisconnecting(true);
    setError("");

    try {

      await disconnectGoogleCalendar();
      setStatus({ connected: false, email: null });

    } catch (err) {

      console.error("GOOGLE CALENDAR DISCONNECT ERROR:", err);
      setError(err.message || "Couldn't disconnect Google Calendar. Please try again.");

    } finally {

      setDisconnecting(false);

    }

  };


  if (loading) {
    return <SettingsCardSkeleton />;
  }

  return (

    <div className="rounded-2xl border border-ink-700 bg-ink-900/60 p-6">

      <h2 className="text-xl font-bold flex items-center gap-2">
        <CalendarDays size={20} />
        Sync Your Google Calendar
      </h2>

      {status?.connected ? (

        <>

          <p className="mt-2 flex items-center gap-2 text-sm text-green-400">
            <CheckCircle2 size={16} />
            Connected{status.email ? ` as ${status.email}` : ""} — new and updated appointments show up on this calendar automatically.
          </p>

          {error && (
            <p className="mt-3 text-sm text-red-400">
              {error}
            </p>
          )}

          <button
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="mt-4 rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold transition hover:bg-ink-800 disabled:opacity-50"
          >
            {disconnecting ? "Disconnecting..." : "Disconnect"}
          </button>

        </>

      ) : (

        <>

          <p className="mt-2 text-sm text-slate-400">
            Connect Google Calendar so every appointment scheduled in Atlas shows up on your calendar too — wherever you actually look at your day.
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
            <CalendarDays size={16} />
            {connecting ? "Redirecting..." : "Connect Google Calendar"}
          </button>

        </>

      )}

    </div>

  );

}

export default GoogleCalendarCard;
