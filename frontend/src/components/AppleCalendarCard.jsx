import { useEffect, useState } from "react";
import { CalendarDays, CheckCircle2 } from "lucide-react";

import { getAppleCalendarStatus, connectAppleCalendar, disconnectAppleCalendar } from "../api/atlasApi";
import SettingsCardSkeleton from "./SettingsCardSkeleton";


// Apple has no OAuth consent screen for Calendar the way Google does -
// connecting means the owner types their Apple ID email and an
// app-specific password (generated at appleid.apple.com, never their
// real Apple ID password) directly into this form, which Atlas then
// uses to talk to iCloud's calendar over CalDAV.
function AppleCalendarCard() {

  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState("");


  useEffect(() => {

    getAppleCalendarStatus()
      .then(setStatus)
      .catch((err) => console.error("APPLE CALENDAR STATUS ERROR:", err))
      .finally(() => setLoading(false));

  }, []);


  const handleConnect = async (e) => {

    e.preventDefault();

    setConnecting(true);
    setError("");

    try {

      const result = await connectAppleCalendar(email.trim(), appPassword.trim());
      setStatus({ connected: true, email: result.email });
      setAppPassword("");

    } catch (err) {

      console.error("APPLE CALENDAR CONNECT ERROR:", err);
      setError(err.message || "Couldn't connect to Apple Calendar. Please try again.");

    } finally {

      setConnecting(false);

    }

  };


  const handleDisconnect = async () => {

    setDisconnecting(true);
    setError("");

    try {

      await disconnectAppleCalendar();
      setStatus({ connected: false, email: null });
      setEmail("");

    } catch (err) {

      console.error("APPLE CALENDAR DISCONNECT ERROR:", err);
      setError(err.message || "Couldn't disconnect Apple Calendar. Please try again.");

    } finally {

      setDisconnecting(false);

    }

  };


  if (loading) {
    return <SettingsCardSkeleton />;
  }

  return (

    <div className="rounded-2xl border border-border bg-surface/60 p-6">

      <h2 className="text-xl font-bold flex items-center gap-2">
        <CalendarDays size={20} />
        Sync Your Apple Calendar
      </h2>

      {status?.connected ? (

        <>

          <p className="mt-2 flex items-center gap-2 text-sm text-success">
            <CheckCircle2 size={16} />
            Connected{status.email ? ` as ${status.email}` : ""} — new and updated appointments show up on this calendar automatically.
          </p>

          {error && (
            <p className="mt-3 text-sm text-danger">
              {error}
            </p>
          )}

          <button
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="mt-4 rounded-lg border border-border px-4 py-2 text-sm font-semibold transition hover:bg-surface-muted disabled:opacity-50"
          >
            {disconnecting ? "Disconnecting..." : "Disconnect"}
          </button>

        </>

      ) : (

        <>

          <p className="mt-2 text-sm text-fg-muted">
            Connect Apple Calendar so every appointment scheduled in Atlas shows up on your iPhone, iPad, and Mac calendars too.
          </p>

          <p className="mt-2 text-sm text-fg-muted">
            Apple doesn't let apps sign in with your real Apple ID password - generate a free{" "}
            <strong className="text-fg">app-specific password</strong> instead at{" "}
            <a
              href="https://appleid.apple.com/account/manage"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-text underline hover:opacity-80"
            >
              appleid.apple.com
            </a>
            {" "}under Sign-In and Security → App-Specific Passwords, then enter it below along with your Apple ID email.
          </p>

          <form onSubmit={handleConnect} className="mt-4 flex flex-col gap-3 max-w-sm">

            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@icloud.com"
              className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm text-fg placeholder:text-fg-faint focus:border-brand-500 focus:outline-none"
            />

            <input
              type="password"
              required
              value={appPassword}
              onChange={(e) => setAppPassword(e.target.value)}
              placeholder="app-specific password (xxxx-xxxx-xxxx-xxxx)"
              className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm text-fg placeholder:text-fg-faint focus:border-brand-500 focus:outline-none"
            />

            {error && (
              <p className="text-sm text-danger">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={connecting}
              className="flex w-fit items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-500 disabled:opacity-50"
            >
              <CalendarDays size={16} />
              {connecting ? "Connecting..." : "Connect Apple Calendar"}
            </button>

          </form>

        </>

      )}

    </div>

  );

}

export default AppleCalendarCard;
