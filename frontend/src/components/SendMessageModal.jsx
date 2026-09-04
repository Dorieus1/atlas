import { useState } from "react";
import { X, Mail } from "lucide-react";

import { sendCustomerMessage } from "../api/atlasApi";


// The real "message this customer" feature a design review flagged as
// missing - the only thing in the app that looked like it before this
// (the "Test Atlas" chat box on the customer profile) actually let the
// owner impersonate the CUSTOMER talking to the AI, not send the
// customer anything themselves. This sends a real email and records it
// in customer_messages (see customerMessageService.js), so it shows up
// afterward in CustomerTimeline right alongside notes and appointments -
// not a fire-and-forget action with no trace it ever happened.
function SendMessageModal({ customerId, customerName, customerEmail, onClose, onSent }) {

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  const handleSend = async () => {

    if (!subject.trim() || !body.trim()) {
      setError("A subject and message are both required.");
      return;
    }

    setSending(true);
    setError("");

    try {

      await sendCustomerMessage(customerId, subject.trim(), body.trim());

      onSent();

    } catch (err) {

      console.error("SEND CUSTOMER MESSAGE ERROR:", err);
      setError(err.message || "Couldn't send that email. Please try again.");

    } finally {

      setSending(false);

    }

  };

  return (

    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >

      <div
        className="w-full max-w-lg rounded-2xl border border-border bg-surface p-6"
        onClick={(e) => e.stopPropagation()}
      >

        <div className="flex items-center justify-between">

          <h3 className="flex items-center gap-2 font-display text-lg font-bold">
            <Mail size={19} />
            Message {customerName || "Customer"}
          </h3>

          <button
            onClick={onClose}
            className="rounded-lg p-1 text-fg-muted hover:bg-surface-muted hover:text-fg"
            aria-label="Close"
          >
            <X size={18} />
          </button>

        </div>

        <p className="mt-1 text-sm text-fg-faint">
          Sends a real email to {customerEmail} from you. This isn't Atlas talking - it's you.
        </p>

        {error && (
          <p className="mt-3 text-sm text-danger">
            {error}
          </p>
        )}

        <div className="mt-4 flex flex-col gap-3">

          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            maxLength={200}
            className="w-full rounded-lg border border-border bg-surface-muted p-3 text-fg placeholder:text-fg-faint focus:border-border-strong focus:outline-none"
          />

          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Type your message..."
            rows={7}
            maxLength={10000}
            className="w-full resize-none rounded-lg border border-border bg-surface-muted p-3 text-fg placeholder:text-fg-faint focus:border-border-strong focus:outline-none"
          />

          <button
            onClick={handleSend}
            disabled={sending}
            className="mt-1 flex items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-5 py-3 font-semibold text-white transition hover:bg-brand-500 disabled:opacity-50"
          >
            <Mail size={16} />
            {sending ? "Sending..." : "Send Email"}
          </button>

        </div>

      </div>

    </div>

  );

}

export default SendMessageModal;
