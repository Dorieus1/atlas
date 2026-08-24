import { useEffect, useState, useRef } from "react";
import {
  Plus,
  X,
  Trash2,
  FileText,
  ArrowRightLeft,
  Download
} from "lucide-react";

import {
  getQuotes,
  getQuote,
  createQuote,
  updateQuote,
  deleteQuote,
  downloadQuotePdf,
  getCustomers
} from "../api/atlasApi";

import EmptyState from "../components/EmptyState";
import Skeleton from "../components/Skeleton";


const STATUS_STYLES = {
  draft: "bg-slate-500/20 text-slate-300",
  sent: "bg-brand-500/20 text-brand-400",
  accepted: "bg-green-500/20 text-green-400",
  declined: "bg-red-500/20 text-red-400",
  paid: "bg-green-500/20 text-green-400"
};

const STATUS_OPTIONS = ["draft", "sent", "accepted", "declined", "paid"];

const emptyItem = () => ({ description: "", quantity: 1, unit_price: 0 });

function formatMoney(amount) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(amount || 0);
}


function Quotes() {

  const [quotes, setQuotes] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [formCustomerId, setFormCustomerId] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formItems, setFormItems] = useState([emptyItem()]);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const [activeQuote, setActiveQuote] = useState(null);
  const [detailError, setDetailError] = useState("");
  const [detailSuccess, setDetailSuccess] = useState("");
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);


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

  }, []);


  const openCreateForm = () => {

    setFormCustomerId("");
    setFormNotes("");
    setFormItems([emptyItem()]);
    setFormError("");
    setShowForm(true);

  };


  const updateFormItem = (index, field, value) => {

    setFormItems((previous) =>
      previous.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );

  };


  const addFormItem = () => {
    setFormItems((previous) => [...previous, emptyItem()]);
  };


  const removeFormItem = (index) => {

    setFormItems((previous) =>
      previous.length === 1 ? previous : previous.filter((_, i) => i !== index)
    );

  };


  const formTotal = formItems.reduce(
    (sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unit_price) || 0),
    0
  );


  const handleCreate = async () => {

    if (!formCustomerId) {
      setFormError("Choose a customer.");
      return;
    }

    const cleanItems = formItems
      .map((item) => ({
        description: item.description.trim(),
        quantity: Number(item.quantity),
        unit_price: Number(item.unit_price)
      }))
      .filter((item) => item.description);

    if (cleanItems.length === 0) {
      setFormError("Add at least one line item with a description.");
      return;
    }

    if (cleanItems.some((item) => !(item.quantity > 0) || !(item.unit_price >= 0))) {
      setFormError("Every line item needs a positive quantity and a valid price.");
      return;
    }

    if (savingRef.current) {
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setFormError("");

    try {

      await createQuote(formCustomerId, "quote", formNotes.trim() || null, cleanItems);
      setShowForm(false);
      await loadQuotes();

    } catch (error) {

      console.error("CREATE QUOTE ERROR:", error);
      setFormError(error.message || "Couldn't create that quote. Please try again.");

    } finally {

      savingRef.current = false;
      setSaving(false);

    }

  };


  const openDetail = async (id) => {

    setDetailError("");
    setDetailSuccess("");
    setDetailLoading(true);
    setActiveQuote({ id });

    try {

      const data = await getQuote(id);
      setActiveQuote(data);

    } catch (error) {

      console.error("QUOTE DETAIL ERROR:", error);
      setDetailError("Couldn't load this quote. Please try again.");

    } finally {

      setDetailLoading(false);

    }

  };


  const handleStatusChange = async (status) => {

    if (!activeQuote) return;

    try {

      setDetailError("");
      setDetailSuccess("");

      const result = await updateQuote(activeQuote.id, { status });

      if (result?.review_request_sent) {
        setDetailSuccess("Marked paid — a review request was automatically sent to this customer.");
      }

      setActiveQuote((previous) => ({ ...previous, status }));
      await loadQuotes();

    } catch (error) {

      console.error("UPDATE QUOTE ERROR:", error);
      setDetailError("Couldn't update this quote. Please try again.");

    }

  };


  const handleConvertToInvoice = async () => {

    if (!activeQuote) return;

    try {

      setDetailError("");
      await updateQuote(activeQuote.id, { type: "invoice", status: "sent" });
      setActiveQuote((previous) => ({ ...previous, type: "invoice", status: "sent" }));
      await loadQuotes();

    } catch (error) {

      console.error("CONVERT QUOTE ERROR:", error);
      setDetailError("Couldn't convert this to an invoice. Please try again.");

    }

  };


  const handleDownloadPdf = async () => {

    if (!activeQuote) return;

    setDownloadingPdf(true);
    setDetailError("");

    try {

      await downloadQuotePdf(activeQuote.id);

    } catch (error) {

      console.error("DOWNLOAD PDF ERROR:", error);
      setDetailError("Couldn't download the PDF. Please try again.");

    } finally {

      setDownloadingPdf(false);

    }

  };


  const handleDelete = async (id) => {

    try {

      await deleteQuote(id);
      setActiveQuote(null);
      await loadQuotes();

    } catch (error) {

      console.error("DELETE QUOTE ERROR:", error);
      setDetailError("Couldn't delete this. Please try again.");

    }

  };


  return (

    <div className="p-8">

      <div className="flex flex-wrap items-center justify-between gap-3">

        <div>
          <h1 className="text-3xl font-bold">
            🧾 Quotes &amp; Invoices
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Price the job, then bill it — all in one place.
          </p>
        </div>

        <button
          onClick={openCreateForm}
          className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-500"
        >
          <Plus size={17} />
          New Quote
        </button>

      </div>

      {loadError && (
        <p className="mt-4 text-red-400">
          {loadError}
        </p>
      )}

      <div className="mt-6 rounded-2xl border border-ink-700 bg-ink-900/60 p-5">

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
          />

        ) : (

          <div className="flex flex-col gap-2">

            {quotes.map((quote) => (

              <button
                key={quote.id}
                onClick={() => openDetail(quote.id)}
                className="flex items-center justify-between gap-4 rounded-xl border border-ink-700 bg-ink-800 p-4 text-left transition hover:border-ink-600 hover:bg-ink-900"
              >

                <div className="min-w-0">

                  <div className="flex items-center gap-2">
                    <p className="truncate font-semibold">
                      {quote.customer_name || "Unknown customer"}
                    </p>
                    <span className="shrink-0 rounded-full bg-ink-700 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                      {quote.type}
                    </span>
                  </div>

                  <p className="mt-0.5 text-xs text-slate-500">
                    {new Date(quote.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                  </p>

                </div>

                <div className="flex shrink-0 items-center gap-4">

                  <span className="font-display text-lg font-bold">
                    {formatMoney(quote.total)}
                  </span>

                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${STATUS_STYLES[quote.status]}`}>
                    {quote.status}
                  </span>

                </div>

              </button>

            ))}

          </div>

        )}

      </div>

      {showForm && (

        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setShowForm(false)}
        >

          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-ink-700 bg-ink-900 p-6"
            onClick={(e) => e.stopPropagation()}
          >

            <div className="flex items-center justify-between">

              <h3 className="font-display text-lg font-bold">
                New Quote
              </h3>

              <button
                onClick={() => setShowForm(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-ink-800 hover:text-white"
                aria-label="Close"
              >
                <X size={18} />
              </button>

            </div>

            {formError && (
              <p className="mt-3 text-sm text-red-400">
                {formError}
              </p>
            )}

            <div className="mt-4 flex flex-col gap-3">

              <select
                value={formCustomerId}
                onChange={(e) => setFormCustomerId(e.target.value)}
                className="w-full rounded-lg border border-ink-700 bg-ink-800 p-3 text-white focus:border-ink-600 focus:outline-none"
              >
                <option value="">Choose a customer</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>

              <div className="flex flex-col gap-2">

                {formItems.map((item, index) => (

                  <div key={index} className="flex items-center gap-2">

                    <input
                      placeholder="Description"
                      value={item.description}
                      onChange={(e) => updateFormItem(index, "description", e.target.value)}
                      className="min-w-0 flex-1 rounded-lg border border-ink-700 bg-ink-800 p-2.5 text-sm text-white placeholder:text-slate-500 focus:border-ink-600 focus:outline-none"
                    />

                    <input
                      type="number"
                      min="0"
                      placeholder="Qty"
                      value={item.quantity}
                      onChange={(e) => updateFormItem(index, "quantity", e.target.value)}
                      className="w-16 rounded-lg border border-ink-700 bg-ink-800 p-2.5 text-sm text-white focus:border-ink-600 focus:outline-none"
                    />

                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Price"
                      value={item.unit_price}
                      onChange={(e) => updateFormItem(index, "unit_price", e.target.value)}
                      className="w-24 rounded-lg border border-ink-700 bg-ink-800 p-2.5 text-sm text-white focus:border-ink-600 focus:outline-none"
                    />

                    <button
                      onClick={() => removeFormItem(index)}
                      className="shrink-0 rounded-lg p-2 text-slate-500 transition hover:bg-red-500/10 hover:text-red-400"
                      aria-label="Remove line item"
                    >
                      <Trash2 size={15} />
                    </button>

                  </div>

                ))}

                <button
                  onClick={addFormItem}
                  className="flex items-center gap-1.5 self-start rounded-lg px-2 py-1.5 text-sm font-medium text-brand-400 transition hover:bg-brand-600/10"
                >
                  <Plus size={15} />
                  Add line item
                </button>

              </div>

              <textarea
                placeholder="Notes (optional)"
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                className="h-16 w-full rounded-lg border border-ink-700 bg-ink-800 p-3 text-white placeholder:text-slate-500 focus:border-ink-600 focus:outline-none"
              />

              <div className="flex items-center justify-between rounded-lg bg-ink-800 px-4 py-3">
                <span className="text-sm text-slate-400">Total</span>
                <span className="font-display text-xl font-bold">
                  {formatMoney(formTotal)}
                </span>
              </div>

              <button
                onClick={handleCreate}
                disabled={saving}
                className="mt-1 rounded-lg bg-brand-600 px-5 py-3 font-semibold text-white transition hover:bg-brand-500 disabled:opacity-50"
              >
                {saving ? "Creating..." : "Create Quote"}
              </button>

            </div>

          </div>

        </div>

      )}

      {activeQuote && (

        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setActiveQuote(null)}
        >

          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-ink-700 bg-ink-900 p-6"
            onClick={(e) => e.stopPropagation()}
          >

            <div className="flex items-center justify-between">

              <h3 className="font-display text-lg font-bold">
                {activeQuote.customer_name || "Quote"}
              </h3>

              <button
                onClick={() => setActiveQuote(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-ink-800 hover:text-white"
                aria-label="Close"
              >
                <X size={18} />
              </button>

            </div>

            {detailError && (
              <p className="mt-3 text-sm text-red-400">
                {detailError}
              </p>
            )}

            {detailSuccess && (
              <p className="mt-3 text-sm text-green-400">
                {detailSuccess}
              </p>
            )}

            {detailLoading ? (

              <div className="mt-4 flex flex-col gap-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>

            ) : (

              <>

                <div className="mt-4 flex items-center gap-2">

                  <span className="rounded-full bg-ink-700 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                    {activeQuote.type}
                  </span>

                  <select
                    value={activeQuote.status}
                    onChange={(e) => handleStatusChange(e.target.value)}
                    className={`rounded-full border-0 px-2.5 py-1 text-[11px] font-medium ${STATUS_STYLES[activeQuote.status]}`}
                  >
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>

                </div>

                <div className="mt-4 flex flex-col divide-y divide-ink-800 rounded-xl border border-ink-700">

                  {(activeQuote.items || []).map((item) => (

                    <div key={item.id} className="flex items-center justify-between gap-3 p-3">

                      <div className="min-w-0">
                        <p className="truncate text-sm">{item.description}</p>
                        <p className="text-xs text-slate-500">
                          {item.quantity} &times; {formatMoney(item.unit_price)}
                        </p>
                      </div>

                      <span className="shrink-0 text-sm font-semibold">
                        {formatMoney(item.quantity * item.unit_price)}
                      </span>

                    </div>

                  ))}

                </div>

                {activeQuote.notes && (
                  <p className="mt-3 text-sm text-slate-400">
                    {activeQuote.notes}
                  </p>
                )}

                <div className="mt-4 flex items-center justify-between rounded-lg bg-ink-800 px-4 py-3">
                  <span className="text-sm text-slate-400">Total</span>
                  <span className="font-display text-xl font-bold">
                    {formatMoney(activeQuote.total)}
                  </span>
                </div>

                <div className="mt-4 flex items-center gap-2">

                  <button
                    onClick={handleDownloadPdf}
                    disabled={downloadingPdf}
                    className="flex items-center gap-1.5 rounded-lg bg-ink-700 px-3 py-2 text-sm font-medium transition hover:bg-ink-600 disabled:opacity-50"
                  >
                    <Download size={14} />
                    {downloadingPdf ? "Downloading..." : "Download PDF"}
                  </button>

                  {activeQuote.type === "quote" && (
                    <button
                      onClick={handleConvertToInvoice}
                      className="flex items-center gap-1.5 rounded-lg bg-ink-700 px-3 py-2 text-sm font-medium transition hover:bg-ink-600"
                    >
                      <ArrowRightLeft size={14} />
                      Convert to Invoice
                    </button>
                  )}

                  <button
                    onClick={() => handleDelete(activeQuote.id)}
                    className="ml-auto flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-red-400 transition hover:bg-red-500/10"
                  >
                    <Trash2 size={14} />
                    Delete
                  </button>

                </div>

              </>

            )}

          </div>

        </div>

      )}

    </div>

  );

}

export default Quotes;
