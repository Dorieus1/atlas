import { useEffect, useState, useRef } from "react";
import { Star, Send } from "lucide-react";

import {
  getCustomerReviewRequests,
  sendReviewRequest
} from "../api/atlasApi";


function ReviewRequestPanel({ customerId }) {

  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [sendError, setSendError] = useState("");
  const [sendSuccess, setSendSuccess] = useState("");
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);


  const loadRequests = async () => {

    try {

      const data = await getCustomerReviewRequests(customerId);
      setRequests(data);
      setLoadError("");

    } catch (error) {

      console.error("REVIEW REQUESTS LOAD ERROR:", error);
      setLoadError("Couldn't load review request history.");

    } finally {

      setLoading(false);

    }

  };


  useEffect(() => {

    loadRequests();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);


  const handleSend = async () => {

    if (sendingRef.current) {
      return;
    }

    sendingRef.current = true;
    setSending(true);
    setSendError("");
    setSendSuccess("");

    try {

      await sendReviewRequest(customerId);
      setSendSuccess("Review request sent!");
      await loadRequests();

    } catch (error) {

      console.error("SEND REVIEW REQUEST ERROR:", error);
      setSendError(error.message || "Couldn't send that review request. Please try again.");

    } finally {

      sendingRef.current = false;
      setSending(false);

    }

  };


  const lastSent = requests[0];

  return (

    <div className="rounded-2xl border border-ink-700 bg-ink-900/60 p-6">

      <div className="flex items-center justify-between gap-3">

        <h2 className="text-xl font-bold">
          ⭐ Reviews
        </h2>

        <button
          onClick={handleSend}
          disabled={sending}
          className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-brand-500 disabled:opacity-50"
        >
          <Send size={14} />
          {sending ? "Sending..." : "Request Review"}
        </button>

      </div>

      {loadError && (
        <p className="mt-3 text-sm text-red-400">
          {loadError}
        </p>
      )}

      {sendError && (
        <p className="mt-3 text-sm text-red-400">
          {sendError}
        </p>
      )}

      {sendSuccess && (
        <p className="mt-3 text-sm text-green-400">
          {sendSuccess}
        </p>
      )}

      {!loading && !loadError && (

        lastSent ? (

          <p className="mt-3 flex items-center gap-1.5 text-sm text-slate-400">
            <Star size={14} className="text-brand-400" />
            Last requested {new Date(lastSent.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
          </p>

        ) : (

          <p className="mt-3 text-sm text-slate-500">
            No review request sent yet.
          </p>

        )

      )}

    </div>

  );

}

export default ReviewRequestPanel;
