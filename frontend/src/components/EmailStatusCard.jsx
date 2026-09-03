import { useEffect, useState } from "react";
import { Mail, AlertTriangle, CheckCircle2 } from "lucide-react";

import { getEmailStatus } from "../api/atlasApi";
import SettingsCardSkeleton from "./SettingsCardSkeleton";

// This is a server-wide setting (it lives in an environment variable,
// not anything per-business), so there's nothing here for an owner to
// click or configure - just an honest status, since the alternative is
// a business's real customers silently never receiving a quote,
// invoice, or reminder email with no visible sign anything went wrong.
function EmailStatusCard() {

  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {

    getEmailStatus()
      .then(setStatus)
      .catch((err) => console.error("EMAIL STATUS ERROR:", err))
      .finally(() => setLoading(false));

  }, []);

  if (loading) {
    return <SettingsCardSkeleton />;
  }

  // Nothing to show once real sending is on - a working integration
  // shouldn't take up permanent space in Settings once it's just working.
  if (!status || status.real_sending_enabled) {
    return null;
  }

  return (

    <div className="rounded-2xl border border-warning/40 bg-warning/5 p-6">

      <h2 className="text-xl font-bold flex items-center gap-2">
        <Mail size={20} />
        Email Sending
      </h2>

      <p className="mt-2 flex items-start gap-2 text-sm text-fg-muted">
        <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warning" />
        <span>
          Quotes, invoices, reminders, and review requests are set up correctly, but the emails
          themselves can't reach your customers yet - your outgoing email address hasn't been
          verified with a real domain. Right now those emails only actually deliver to your own
          inbox, with no error shown when a real customer doesn't get one.
        </span>
      </p>

      <p className="mt-3 text-sm text-fg-muted">
        This is a one-time, free setup (you just need a domain name - even one you already own
        for your business) - ask whoever's helping you build Atlas to walk you through it before
        a real customer is relying on these emails.
      </p>

    </div>

  );

}

export default EmailStatusCard;
