import { useEffect, useRef, useState } from "react";
import { X, PenLine } from "lucide-react";

import { signQuoteInPerson } from "../../api/atlasApi";
import { formatMoney } from "../../utils/serviceAgreements";
import SignaturePad from "../SignaturePad";


// Split out of the old single Quotes.jsx - a self-contained "hand your
// device to the customer" flow. Only ever rendered by QuoteDetailModal,
// which owns the actual quote data; this component just needs the one
// quote to sign and a way to report back that it succeeded.
function SignOnSiteModal({ quote, onClose, onSigned }) {

  const [signName, setSignName] = useState(quote.customer_name || "");
  const [signError, setSignError] = useState("");
  const [signSubmitting, setSignSubmitting] = useState(false);

  // Pre-select the recommended option (or the first, if none is marked)
  // - the customer can still change their mind before signing, this
  // just saves a tap in the common case where they're going with what
  // was suggested.
  const [signTierId, setSignTierId] = useState(
    Array.isArray(quote.tiers) && quote.tiers.length > 0
      ? (quote.tiers.find((tier) => tier.is_recommended) || quote.tiers[0]).id
      : ""
  );

  const signaturePadRef = useRef(null);

  // The pad isn't mounted until this modal is, so there's nothing to
  // clear on an earlier render - this just makes sure it starts blank
  // the moment it does mount, same as the portal's own accept modal.
  useEffect(() => {

    requestAnimationFrame(() => signaturePadRef.current?.clear());

  }, []);

  const handleSignOnSite = async () => {

    if (!signName.trim()) {
      setSignError("The customer's name is required.");
      return;
    }

    if (Array.isArray(quote.tiers) && quote.tiers.length > 0 && !signTierId) {
      setSignError("Choose which option the customer picked.");
      return;
    }

    const signature = signaturePadRef.current?.getSignature();

    if (!signature) {
      setSignError("Have the customer sign above first.");
      return;
    }

    setSignSubmitting(true);
    setSignError("");

    try {

      await signQuoteInPerson(quote.id, signName.trim(), signature, signTierId || undefined);

      onSigned();

    } catch (error) {

      console.error("SIGN ON-SITE ERROR:", error);
      setSignError(error.message || "Couldn't save that signature. Please try again.");

    } finally {

      setSignSubmitting(false);

    }

  };

  return (

    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >

      <div
        className="w-full max-w-md rounded-2xl border border-border bg-surface p-6"
        onClick={(e) => e.stopPropagation()}
      >

        <div className="flex items-center justify-between">

          <h3 className="font-display text-lg font-bold">
            Sign On-Site
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
          Hand your device to the customer to sign. This marks the {quote.type} accepted immediately.
        </p>

        {signError && (
          <p className="mt-3 text-sm text-danger">
            {signError}
          </p>
        )}

        <div className="mt-4 flex flex-col gap-3">

          <input
            placeholder="Customer's full name"
            value={signName}
            onChange={(e) => setSignName(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface-muted p-3 text-fg placeholder:text-fg-faint focus:border-border-strong focus:outline-none"
          />

          {Array.isArray(quote.tiers) && quote.tiers.length > 0 && (

            <div className="flex flex-col gap-1.5">

              <p className="text-xs font-medium uppercase tracking-wide text-fg-faint">
                Which option did they choose?
              </p>

              {quote.tiers.map((tier) => (

                <label
                  key={tier.id}
                  className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg border p-2.5 text-sm ${signTierId === tier.id ? "border-brand-500 bg-brand-600/10" : "border-border"}`}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="sign-on-site-tier"
                      checked={signTierId === tier.id}
                      onChange={() => setSignTierId(tier.id)}
                      className="h-4 w-4 accent-brand-600"
                    />
                    {tier.name}
                  </span>
                  <span className="font-semibold">{formatMoney(tier.total)}</span>
                </label>

              ))}

            </div>

          )}

          <SignaturePad ref={signaturePadRef} />

          <button
            onClick={handleSignOnSite}
            disabled={signSubmitting}
            className="mt-1 flex items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-5 py-3 font-semibold text-white transition hover:bg-brand-500 disabled:opacity-50"
          >
            <PenLine size={16} />
            {signSubmitting ? "Saving..." : "Save Signature"}
          </button>

        </div>

      </div>

    </div>

  );

}

export default SignOnSiteModal;
