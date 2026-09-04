import { useEffect, useState } from "react";
import { useSearchParams, useLocation, useNavigate } from "react-router-dom";
import { Plus, FileText, Download } from "lucide-react";

import {
  getQuotes,
  exportQuotesCsv,
  getCustomers,
  getSavedLineItems,
  getBusinesses
} from "../api/atlasApi";

import EmptyState from "../components/EmptyState";
import Skeleton from "../components/Skeleton";
import { quoteDisplayNumber } from "../utils/quoteNumber";
import { formatMoney } from "../utils/serviceAgreements";
import { STATUS_STYLES, isOverdueInvoice } from "../utils/quoteHelpers";
import QuoteFormModal from "../components/quotes/QuoteFormModal";
import QuoteDetailModal from "../components/quotes/QuoteDetailModal";


// This page used to be one 2,400-line file - the list view, the full
// create/edit form (including Good/Better/Best tiers), and the entire
// detail view (status, PDF, send, sign-on-site, job costs, payments,
// delete) all inline together. That made it the hardest screen in the
// app to safely change, despite being the most commercially important
// one. It's now three pieces: this file is just the list and the two
// modals it can open (QuoteFormModal, QuoteDetailModal - which owns
// SignOnSiteModal itself), each a normal, independently readable
// component with its own state. Nothing about how any of it actually
// behaves changed in this split.
function Quotes() {

  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  const [quotes, setQuotes] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [savedItems, setSavedItems] = useState([]);
  const [businessDefaultTaxRate, setBusinessDefaultTaxRate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportError, setExportError] = useState("");

  // null = closed. Otherwise an object describing what to pre-fill:
  // { quote } to edit an existing one, { draftItems, draftCustomerId,
  // draftSummary } for the AI-photo-estimate handoff, or {} for a
  // blank new quote.
  const [formModal, setFormModal] = useState(null);

  const [activeQuoteId, setActiveQuoteId] = useState(null);


  const loadQuotes = async () => {

    try {

      const data = await getQuotes();
      setQuotes(data);
      setLoadError("");

    } catch (error) {

      console.error("QUOTES LOAD ERROR:", error);
      setLoadError("Couldn't load your quotes. Please refresh to try again.");

    } finally {

      setLoading(false);

    }

  };


  useEffect(() => {

    loadQuotes();

    getCustomers()
      .then(setCustomers)
      .catch((error) => console.error("CUSTOMERS LOAD ERROR:", error));

    getSavedLineItems()
      .then(setSavedItems)
      .catch((error) => console.error("SAVED LINE ITEMS LOAD ERROR:", error));

    getBusinesses()
      .then((businesses) => {

        const rate = businesses?.[0]?.default_tax_rate;
        setBusinessDefaultTaxRate(rate === null || rate === undefined ? null : rate);

      })
      .catch((error) => console.error("BUSINESS LOAD ERROR:", error));

    // A search result (or any other deep link) can land here with
    // ?open=id to jump straight into that quote's detail view.
    const openId = searchParams.get("open");

    if (openId) {
      setActiveQuoteId(openId);
    }

    // PhotoGallery's "Draft Estimate with AI" hands off a draft this way
    // instead of the URL - a whole line-item array doesn't belong in a
    // query string. Pre-fills the create form instead of auto-saving,
    // since an AI-drafted estimate from a photo is a starting point the
    // owner is expected to review, not something that should land as a
    // real quote untouched.
    if (location.state?.draftItems?.length > 0) {

      setFormModal({
        draftItems: location.state.draftItems,
        draftCustomerId: location.state.draftCustomerId || "",
        draftSummary: location.state.draftSummary || ""
      });

      navigate(location.pathname, { replace: true });

    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const handleFormSaved = async () => {

    // Editing re-opens the same quote's detail view afterward - creating
    // just returns to the list, matching the page's old behavior exactly.
    const editedId = formModal?.quote?.id;

    setFormModal(null);

    await loadQuotes();

    if (editedId) {
      setActiveQuoteId(editedId);
    }

  };


  const handleExportCsv = async () => {

    setExportingCsv(true);
    setExportError("");

    try {

      await exportQuotesCsv();

    } catch (error) {

      console.error("EXPORT QUOTES CSV ERROR:", error);
      setExportError("Couldn't export your quotes. Please try again.");

    } finally {

      setExportingCsv(false);

    }

  };


  return (

    <div className="p-8">

      <div className="flex flex-wrap items-center justify-between gap-3">

        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <FileText size={28} />
            Quotes &amp; Invoices
          </h1>
          <p className="mt-1 text-sm text-fg-faint">
            Price the job, then bill it — all in one place.
          </p>
        </div>

        <div className="flex items-center gap-2">

          <button
            onClick={handleExportCsv}
            disabled={exportingCsv}
            className="flex items-center gap-2 rounded-lg border border-border bg-surface-muted px-4 py-2.5 text-sm font-semibold text-fg transition hover:border-border-strong hover:bg-surface disabled:opacity-50"
          >
            <Download size={17} />
            {exportingCsv ? "Exporting..." : "Export CSV"}
          </button>

          <button
            onClick={() => setFormModal({})}
            className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-500"
          >
            <Plus size={17} />
            New Quote
          </button>

        </div>

      </div>

      {loadError && (
        <p className="mt-4 text-danger">
          {loadError}
        </p>
      )}

      {exportError && (
        <p className="mt-4 text-danger">
          {exportError}
        </p>
      )}

      <div className="mt-6 rounded-2xl border border-border bg-surface/60 p-6">

        {loading ? (

          <div className="flex flex-col gap-3">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>

        ) : quotes.length === 0 ? (

          <EmptyState
            icon={FileText}
            title="No quotes yet"
            description="Create your first quote to send a customer a price for the job."
            actionLabel="New Quote"
            onAction={() => setFormModal({})}
          />

        ) : (

          <div className="flex flex-col gap-2">

            {quotes.map((quote) => (

              <button
                key={quote.id}
                onClick={() => setActiveQuoteId(quote.id)}
                className="flex flex-col items-stretch gap-3 rounded-xl border border-border bg-surface-muted p-4 text-left transition hover:border-border-strong hover:bg-surface sm:flex-row sm:items-center sm:justify-between sm:gap-4"
              >

                <div className="min-w-0">

                  <div className="flex items-center gap-2">
                    <p className="truncate font-semibold">
                      {quote.customer_name || "Unknown customer"}
                    </p>
                    <span className="shrink-0 rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-fg-muted">
                      {quote.type}
                    </span>
                  </div>

                  <p className="mt-0.5 text-xs text-fg-faint">
                    {quoteDisplayNumber(quote)}
                    {quoteDisplayNumber(quote) ? " · " : ""}
                    {new Date(quote.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                  </p>

                </div>

                <div className="flex shrink-0 items-center gap-4">

                  <span className="font-display text-lg font-bold">
                    {formatMoney(quote.total)}
                  </span>

                  {isOverdueInvoice(quote) && (
                    <span className="rounded-full bg-danger/20 px-2.5 py-1 text-[11px] font-medium text-danger">
                      Overdue
                    </span>
                  )}

                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${STATUS_STYLES[quote.status]}`}>
                    {quote.status}
                  </span>

                </div>

              </button>

            ))}

          </div>

        )}

      </div>

      {formModal && (

        <QuoteFormModal
          quote={formModal.quote}
          draftItems={formModal.draftItems}
          draftCustomerId={formModal.draftCustomerId}
          draftSummary={formModal.draftSummary}
          customers={customers}
          savedItems={savedItems}
          businessDefaultTaxRate={businessDefaultTaxRate}
          onClose={() => setFormModal(null)}
          onSaved={handleFormSaved}
        />

      )}

      {activeQuoteId && (

        <QuoteDetailModal
          quoteId={activeQuoteId}
          onClose={() => setActiveQuoteId(null)}
          onEdit={(quote) => {
            setActiveQuoteId(null);
            setFormModal({ quote });
          }}
          onChanged={loadQuotes}
        />

      )}

    </div>

  );

}

export default Quotes;
