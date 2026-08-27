import { useEffect, useState, useRef } from "react";
import { useSearchParams, useLocation, useNavigate } from "react-router-dom";
import {
  Plus,
  X,
  Trash2,
  FileText,
  ArrowRightLeft,
  Download,
  Sparkles,
  Pencil,
  Send,
  Receipt,
  Wallet
} from "lucide-react";

import {
  getQuotes,
  getQuote,
  createQuote,
  updateQuote,
  sendQuote,
  addQuoteExpense,
  deleteQuoteExpense,
  addQuotePayment,
  deleteQuotePayment,
  deleteQuote,
  downloadQuotePdf,
  exportQuotesCsv,
  getCustomers,
  getSavedLineItems,
  getBusinesses
} from "../api/atlasApi";

import EmptyState from "../components/EmptyState";
import Skeleton from "../components/Skeleton";
import { quoteDisplayNumber } from "../utils/quoteNumber";


const STATUS_STYLES = {
  draft: "bg-slate-500/20 text-fg-muted",
  sent: "bg-brand-500/20 text-brand-400",
  accepted: "bg-green-500/20 text-green-400",
  declined: "bg-red-500/20 text-red-400",
  paid: "bg-green-500/20 text-green-400"
};

const STATUS_OPTIONS = ["draft", "sent", "accepted", "declined", "paid"];

// Matches invoiceReminderService's own "first reminder 3 days after
// sent_at" cadence on the backend, so an invoice only gets flagged here
// exactly when the owner's first real reminder email is also going out
// - not a separate, disconnected definition of "overdue".
const OVERDUE_AFTER_DAYS = 3;

function isOverdueInvoice(quote) {

  return (
    quote.type === "invoice" &&
    quote.status === "sent" &&
    quote.sent_at &&
    Date.now() - new Date(quote.sent_at).getTime() > OVERDUE_AFTER_DAYS * 24 * 60 * 60 * 1000
  );

}

const emptyItem = () => ({ description: "", quantity: 1, unit_price: 0 });

function formatMoney(amount) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(amount || 0);
}

// Mirrors the backend's percent-or-fixed arithmetic (backend/services/
// quoteService.js's calculatePercentOrFixed(), shared by applyDiscount()
// and calculateDeposit()) so the form can show a live preview as the user
// types - the actual, authoritative numbers still come back from the
// server on save/reload, this is just for preview.
function calculatePercentOrFixed(base, type, value) {

  const numericValue = Number(value);

  if (type === "percent" && Number.isFinite(numericValue)) {
    return base * (numericValue / 100);
  }

  if (type === "fixed" && Number.isFinite(numericValue)) {
    return numericValue;
  }

  return 0;

}

// Mirrors the backend's calculateQuoteTotals() (backend/services/
// quoteService.js) so the form can show a live Subtotal/Discount/Tax/
// Deposit/Total breakdown as the user types. Tax is computed on the
// discounted amount, not the raw subtotal - same order the backend
// applies it in.
function calculateTotals(items, discountType, discountValue, taxRate, depositType, depositValue) {

  const subtotal = items.reduce(
    (sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unit_price) || 0),
    0
  );

  const discount_amount = calculatePercentOrFixed(subtotal, discountType, discountValue);
  const taxable_amount = subtotal - discount_amount;
  const numericTaxRate = Number(taxRate);
  const tax_amount = Number.isFinite(numericTaxRate) && numericTaxRate > 0 ? taxable_amount * (numericTaxRate / 100) : 0;
  const total = taxable_amount + tax_amount;
  const deposit_amount = calculatePercentOrFixed(total, depositType, depositValue);

  return { subtotal, discount_amount, tax_amount, total, deposit_amount };

}


const PAYMENT_METHOD_LABELS = {
  cash: "Cash",
  check: "Check",
  bank_transfer: "Bank transfer",
  other: "Other"
};


function Quotes() {

  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  const [draftSummary, setDraftSummary] = useState("");

  const [quotes, setQuotes] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [savedItems, setSavedItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingQuoteId, setEditingQuoteId] = useState(null);
  const [formCustomerId, setFormCustomerId] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formItems, setFormItems] = useState([emptyItem()]);
  const [formDiscountType, setFormDiscountType] = useState("");
  const [formDiscountValue, setFormDiscountValue] = useState("");
  const [formTaxRate, setFormTaxRate] = useState("");
  const [businessDefaultTaxRate, setBusinessDefaultTaxRate] = useState(null);
  const [formDepositType, setFormDepositType] = useState("");
  const [formDepositValue, setFormDepositValue] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const [activeQuote, setActiveQuote] = useState(null);
  const [detailError, setDetailError] = useState("");
  const [detailSuccess, setDetailSuccess] = useState("");
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportError, setExportError] = useState("");
  const [sendingToCustomer, setSendingToCustomer] = useState(false);
  const [expenseDescription, setExpenseDescription] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [addingExpense, setAddingExpense] = useState(false);
  const [expenseError, setExpenseError] = useState("");
  const [deletingExpenseId, setDeletingExpenseId] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentNote, setPaymentNote] = useState("");
  const [addingPayment, setAddingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [deletingPaymentId, setDeletingPaymentId] = useState(null);


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
      openDetail(openId);
    }

    // PhotoGallery's "Draft Estimate with AI" hands off a draft this way
    // instead of the URL - a whole line-item array doesn't belong in a
    // query string. Pre-fills the create form instead of auto-saving,
    // since an AI-drafted estimate from a photo is a starting point the
    // owner is expected to review, not something that should land as a
    // real quote untouched.
    if (location.state?.draftItems?.length > 0) {

      setFormCustomerId(location.state.draftCustomerId || "");
      setFormItems(location.state.draftItems);
      setFormNotes("");
      setFormError("");
      setDraftSummary(location.state.draftSummary || "");
      setShowForm(true);

      navigate(location.pathname, { replace: true });

    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const openCreateForm = () => {

    setEditingQuoteId(null);
    setFormCustomerId("");
    setFormNotes("");
    setFormItems([emptyItem()]);
    setFormDiscountType("");
    setFormDiscountValue("");
    // Pre-filled from the business's own default so the owner doesn't
    // have to remember to type it in on every quote - still just a
    // starting value in the form state, freely editable per quote.
    setFormTaxRate(businessDefaultTaxRate === null || businessDefaultTaxRate === undefined ? "" : String(businessDefaultTaxRate));
    setFormDepositType("");
    setFormDepositValue("");
    setFormError("");
    setDraftSummary("");
    setShowForm(true);

  };


  // Pre-fills the same form used for creating, so editing a quote's line
  // items/notes/discount/deposit reuses one UI instead of a second one.
  // Only reachable from the detail view, so `quote` is always a full
  // detail payload (with items) - never the summary shape from the list.
  const openEditForm = (quote) => {

    setActiveQuote(null);
    setEditingQuoteId(quote.id);
    setFormCustomerId(quote.customer_id || "");
    setFormNotes(quote.notes || "");
    setFormItems(
      (quote.items || []).map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price
      }))
    );
    setFormDiscountType(quote.discount_type || "");
    setFormDiscountValue(quote.discount_type ? String(quote.discount_value) : "");
    setFormTaxRate(quote.tax_rate === null || quote.tax_rate === undefined ? "" : String(quote.tax_rate));
    setFormDepositType(quote.deposit_type || "");
    setFormDepositValue(quote.deposit_type ? String(quote.deposit_value) : "");
    setFormError("");
    setDraftSummary("");
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


  const handleQuickAdd = (savedItemId) => {

    const savedItem = savedItems.find((item) => item.id === savedItemId);

    if (!savedItem) {
      return;
    }

    // Quick-add only ever copies the saved item's description/price into a
    // brand-new line item - quantity defaults to 1, and the result is a
    // normal, independent line item the user can still edit or remove like
    // any manually-typed one. Nothing here links back to the saved item,
    // so later editing/deleting the saved template can't affect this quote.
    const newItem = {
      description: savedItem.description,
      quantity: 1,
      unit_price: savedItem.unit_price
    };

    setFormItems((previous) => {

      // A fresh, still-blank form starts with one empty placeholder row -
      // quick-adding into that state should fill it in rather than leave
      // an empty row dangling above the picked service.
      if (previous.length === 1 && !previous[0].description.trim() && Number(previous[0].unit_price) === 0) {
        return [newItem];
      }

      return [...previous, newItem];

    });

  };


  const removeFormItem = (index) => {

    setFormItems((previous) =>
      previous.length === 1 ? previous : previous.filter((_, i) => i !== index)
    );

  };


  const formTotals = calculateTotals(formItems, formDiscountType, formDiscountValue, formTaxRate, formDepositType, formDepositValue);


  const handleSaveQuote = async () => {

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

    const cleanSubtotal = cleanItems.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);

    if (formDiscountType) {

      const value = Number(formDiscountValue);

      if (!Number.isFinite(value) || value < 0) {
        setFormError("Enter a valid discount amount.");
        return;
      }

      if (formDiscountType === "percent" && value > 100) {
        setFormError("A percent discount can't be more than 100%.");
        return;
      }

      if (formDiscountType === "fixed" && value > cleanSubtotal) {
        setFormError("The discount can't be more than the subtotal.");
        return;
      }

    }

    if (formTaxRate !== "" && formTaxRate !== null && formTaxRate !== undefined) {

      const value = Number(formTaxRate);

      if (!Number.isFinite(value) || value < 0 || value > 100) {
        setFormError("Enter a valid tax rate between 0 and 100.");
        return;
      }

    }

    if (formDepositType) {

      const value = Number(formDepositValue);

      if (!Number.isFinite(value) || value < 0) {
        setFormError("Enter a valid deposit amount.");
        return;
      }

      if (formDepositType === "percent" && value > 100) {
        setFormError("A percent deposit can't be more than 100%.");
        return;
      }

      // Checked against the TOTAL (after any discount and tax), not the
      // raw subtotal - a deposit is up-front money toward what the
      // customer will actually owe. Mirrors the backend's
      // calculateTotals() above.
      const cleanDiscountAmount = calculatePercentOrFixed(cleanSubtotal, formDiscountType, formDiscountValue);
      const cleanTaxableAmount = cleanSubtotal - cleanDiscountAmount;
      const cleanTaxRate = Number(formTaxRate);
      const cleanTaxAmount = Number.isFinite(cleanTaxRate) && cleanTaxRate > 0 ? cleanTaxableAmount * (cleanTaxRate / 100) : 0;
      const cleanTotal = cleanTaxableAmount + cleanTaxAmount;

      if (formDepositType === "fixed" && value > cleanTotal) {
        setFormError("The deposit can't be more than the total.");
        return;
      }

    }

    if (savingRef.current) {
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setFormError("");

    try {

      if (editingQuoteId) {

        await updateQuote(editingQuoteId, {
          notes: formNotes.trim() || null,
          items: cleanItems,
          discount_type: formDiscountType || null,
          discount_value: formDiscountType ? Number(formDiscountValue) : null,
          tax_rate: formTaxRate === "" ? null : Number(formTaxRate),
          deposit_type: formDepositType || null,
          deposit_value: formDepositType ? Number(formDepositValue) : null
        });

        setShowForm(false);
        await loadQuotes();
        await openDetail(editingQuoteId);

      } else {

        await createQuote(
          formCustomerId,
          "quote",
          formNotes.trim() || null,
          cleanItems,
          formDiscountType || null,
          formDiscountType ? Number(formDiscountValue) : null,
          formDepositType || null,
          formDepositType ? Number(formDepositValue) : null,
          formTaxRate === "" ? null : Number(formTaxRate)
        );

        setShowForm(false);
        await loadQuotes();

      }

    } catch (error) {

      console.error("SAVE QUOTE ERROR:", error);
      setFormError(error.message || "Couldn't save that quote. Please try again.");

    } finally {

      savingRef.current = false;
      setSaving(false);

    }

  };


  const openDetail = async (id) => {

    setDetailError("");
    setDetailSuccess("");
    setDetailLoading(true);
    setConfirmingDelete(false);
    setExpenseDescription("");
    setExpenseAmount("");
    setExpenseError("");
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


  const handleSendToCustomer = async () => {

    if (!activeQuote) return;

    setSendingToCustomer(true);
    setDetailError("");
    setDetailSuccess("");

    try {

      await sendQuote(activeQuote.id);
      setDetailSuccess(`Emailed to ${activeQuote.customer_name || "the customer"}.`);
      await loadQuotes();
      const data = await getQuote(activeQuote.id);
      setActiveQuote(data);

    } catch (error) {

      console.error("SEND QUOTE ERROR:", error);
      setDetailError(error.message || "Couldn't send this to the customer. Please try again.");

    } finally {

      setSendingToCustomer(false);

    }

  };


  const handleAddExpense = async () => {

    if (!activeQuote) return;

    if (!expenseDescription.trim()) {
      setExpenseError("Enter a description.");
      return;
    }

    const amount = Number(expenseAmount);

    if (!Number.isFinite(amount) || amount < 0) {
      setExpenseError("Enter a valid, non-negative amount.");
      return;
    }

    setAddingExpense(true);
    setExpenseError("");

    try {

      await addQuoteExpense(activeQuote.id, expenseDescription.trim(), amount);
      setExpenseDescription("");
      setExpenseAmount("");

      const data = await getQuote(activeQuote.id);
      setActiveQuote(data);

    } catch (error) {

      console.error("ADD EXPENSE ERROR:", error);
      setExpenseError(error.message || "Couldn't add that expense. Please try again.");

    } finally {

      setAddingExpense(false);

    }

  };


  const handleDeleteExpense = async (expenseId) => {

    if (!activeQuote) return;

    setDeletingExpenseId(expenseId);

    try {

      await deleteQuoteExpense(activeQuote.id, expenseId);

      const data = await getQuote(activeQuote.id);
      setActiveQuote(data);

    } catch (error) {

      console.error("DELETE EXPENSE ERROR:", error);
      setExpenseError("Couldn't remove that expense. Please try again.");

    } finally {

      setDeletingExpenseId(null);

    }

  };


  const handleAddPayment = async () => {

    if (!activeQuote) return;

    const amount = Number(paymentAmount);

    if (!Number.isFinite(amount) || amount <= 0) {
      setPaymentError("Enter a valid, positive amount.");
      return;
    }

    setAddingPayment(true);
    setPaymentError("");

    try {

      await addQuotePayment(activeQuote.id, amount, paymentMethod, paymentNote.trim() || null);
      setPaymentAmount("");
      setPaymentNote("");

      const data = await getQuote(activeQuote.id);
      setActiveQuote(data);
      await loadQuotes();

    } catch (error) {

      console.error("ADD PAYMENT ERROR:", error);
      setPaymentError(error.message || "Couldn't record that payment. Please try again.");

    } finally {

      setAddingPayment(false);

    }

  };


  const handleDeletePayment = async (paymentId) => {

    if (!activeQuote) return;

    setDeletingPaymentId(paymentId);
    setPaymentError("");

    try {

      await deleteQuotePayment(activeQuote.id, paymentId);

      const data = await getQuote(activeQuote.id);
      setActiveQuote(data);
      await loadQuotes();

    } catch (error) {

      console.error("DELETE PAYMENT ERROR:", error);
      setPaymentError(error.message || "Couldn't remove that payment. Please try again.");

    } finally {

      setDeletingPaymentId(null);

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


  const handleDelete = async (id) => {

    setDeleting(true);

    try {

      await deleteQuote(id);
      setActiveQuote(null);
      setConfirmingDelete(false);
      await loadQuotes();

    } catch (error) {

      console.error("DELETE QUOTE ERROR:", error);
      setDetailError("Couldn't delete this. Please try again.");

    } finally {

      setDeleting(false);

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
            onClick={openCreateForm}
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
            onAction={openCreateForm}
          />

        ) : (

          <div className="flex flex-col gap-2">

            {quotes.map((quote) => (

              <button
                key={quote.id}
                onClick={() => openDetail(quote.id)}
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

      {showForm && (

        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setShowForm(false)}
        >

          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-surface p-6"
            onClick={(e) => e.stopPropagation()}
          >

            <div className="flex items-center justify-between">

              <h3 className="font-display text-lg font-bold">
                {editingQuoteId ? "Edit Quote" : draftSummary ? "AI-Drafted Quote" : "New Quote"}
              </h3>

              <button
                onClick={() => setShowForm(false)}
                className="rounded-lg p-1 text-fg-muted hover:bg-surface-muted hover:text-fg"
                aria-label="Close"
              >
                <X size={18} />
              </button>

            </div>

            {draftSummary && (
              <div className="mt-3 flex items-start gap-2 rounded-lg bg-brand-600/10 p-3 text-sm text-brand-300">
                <Sparkles size={15} className="mt-0.5 shrink-0" />
                <p>{draftSummary} Review the line items below before saving — this is a starting point, not a final price.</p>
              </div>
            )}

            {formError && (
              <p className="mt-3 text-sm text-danger">
                {formError}
              </p>
            )}

            <div className="mt-4 flex flex-col gap-3">

              <select
                value={formCustomerId}
                onChange={(e) => setFormCustomerId(e.target.value)}
                disabled={!!editingQuoteId}
                title={editingQuoteId ? "The customer on a quote can't be changed after it's created" : undefined}
                className="w-full rounded-lg border border-border bg-surface-muted p-3 text-fg focus:border-border-strong focus:outline-none disabled:opacity-60"
              >
                <option value="">Choose a customer</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>

              {savedItems.length > 0 && (

                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) {
                      handleQuickAdd(e.target.value);
                    }
                  }}
                  className="w-full rounded-lg border border-border bg-surface-muted p-2.5 text-sm text-fg-muted focus:border-border-strong focus:outline-none"
                >
                  <option value="">⚡ Quick add a saved service...</option>
                  {savedItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.description} — {formatMoney(item.unit_price)}
                    </option>
                  ))}
                </select>

              )}

              <div className="flex flex-col gap-2">

                <div className="flex items-center gap-2 px-0.5 text-xs font-medium uppercase tracking-wide text-fg-faint">
                  <span className="min-w-0 flex-1">Description</span>
                  <span className="w-16">Qty</span>
                  <span className="w-24">Price</span>
                  <span className="w-[27px] shrink-0" aria-hidden="true" />
                </div>

                {formItems.map((item, index) => (

                  <div key={index} className="flex items-center gap-2">

                    <input
                      placeholder="Description"
                      value={item.description}
                      onChange={(e) => updateFormItem(index, "description", e.target.value)}
                      className="min-w-0 flex-1 rounded-lg border border-border bg-surface-muted p-2.5 text-sm text-fg placeholder:text-fg-faint focus:border-border-strong focus:outline-none"
                    />

                    <input
                      type="number"
                      min="0"
                      placeholder="Qty"
                      value={item.quantity}
                      onChange={(e) => updateFormItem(index, "quantity", e.target.value)}
                      className="w-16 rounded-lg border border-border bg-surface-muted p-2.5 text-sm text-fg focus:border-border-strong focus:outline-none"
                    />

                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Price"
                      value={item.unit_price}
                      onChange={(e) => updateFormItem(index, "unit_price", e.target.value)}
                      className="w-24 rounded-lg border border-border bg-surface-muted p-2.5 text-sm text-fg focus:border-border-strong focus:outline-none"
                    />

                    <button
                      onClick={() => removeFormItem(index)}
                      className="shrink-0 rounded-lg p-2 text-fg-faint transition hover:bg-danger/10 hover:text-danger"
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
                className="h-16 w-full rounded-lg border border-border bg-surface-muted p-3 text-fg placeholder:text-fg-faint focus:border-border-strong focus:outline-none"
              />

              <div className="flex items-center gap-2">

                <select
                  value={formDiscountType}
                  onChange={(e) => {
                    setFormDiscountType(e.target.value);
                    if (!e.target.value) setFormDiscountValue("");
                  }}
                  className="rounded-lg border border-border bg-surface-muted p-2.5 text-sm text-fg focus:border-border-strong focus:outline-none"
                >
                  <option value="">No discount</option>
                  <option value="percent">% off</option>
                  <option value="fixed">$ off</option>
                </select>

                {formDiscountType && (
                  <input
                    type="number"
                    min="0"
                    max={formDiscountType === "percent" ? 100 : undefined}
                    step="0.01"
                    placeholder={formDiscountType === "percent" ? "e.g. 15" : "e.g. 20.00"}
                    value={formDiscountValue}
                    onChange={(e) => setFormDiscountValue(e.target.value)}
                    className="w-28 rounded-lg border border-border bg-surface-muted p-2.5 text-sm text-fg focus:border-border-strong focus:outline-none"
                  />
                )}

              </div>

              <div className="flex items-center gap-2">

                <label className="text-sm text-fg-muted">
                  Tax rate
                </label>

                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  placeholder="e.g. 8.5"
                  value={formTaxRate}
                  onChange={(e) => setFormTaxRate(e.target.value)}
                  className="w-28 rounded-lg border border-border bg-surface-muted p-2.5 text-sm text-fg focus:border-border-strong focus:outline-none"
                />

                <span className="text-sm text-fg-faint">%</span>

              </div>

              <div className="flex items-center gap-2">

                <select
                  value={formDepositType}
                  onChange={(e) => {
                    setFormDepositType(e.target.value);
                    if (!e.target.value) setFormDepositValue("");
                  }}
                  className="rounded-lg border border-border bg-surface-muted p-2.5 text-sm text-fg focus:border-border-strong focus:outline-none"
                >
                  <option value="">No deposit</option>
                  <option value="percent">% deposit</option>
                  <option value="fixed">$ deposit</option>
                </select>

                {formDepositType && (
                  <input
                    type="number"
                    min="0"
                    max={formDepositType === "percent" ? 100 : undefined}
                    step="0.01"
                    placeholder={formDepositType === "percent" ? "e.g. 25" : "e.g. 100.00"}
                    value={formDepositValue}
                    onChange={(e) => setFormDepositValue(e.target.value)}
                    className="w-28 rounded-lg border border-border bg-surface-muted p-2.5 text-sm text-fg focus:border-border-strong focus:outline-none"
                  />
                )}

              </div>

              <div className="flex flex-col gap-1 rounded-lg bg-surface-muted px-4 py-3">

                {(formDiscountType || formTotals.tax_amount > 0) && (

                  <div className="flex items-center justify-between text-sm text-fg-muted">
                    <span>Subtotal</span>
                    <span>{formatMoney(formTotals.subtotal)}</span>
                  </div>

                )}

                {formDiscountType && (

                  <div className="flex items-center justify-between text-sm text-fg-muted">
                    <span>
                      Discount
                      {formDiscountType === "percent" && formDiscountValue ? ` (${formDiscountValue}%)` : ""}
                    </span>
                    <span>-{formatMoney(formTotals.discount_amount)}</span>
                  </div>

                )}

                {formTotals.tax_amount > 0 && (

                  <div className="flex items-center justify-between text-sm text-fg-muted">
                    <span>
                      Tax
                      {formTaxRate ? ` (${formTaxRate}%)` : ""}
                    </span>
                    <span>{formatMoney(formTotals.tax_amount)}</span>
                  </div>

                )}

                <div className="flex items-center justify-between">
                  <span className="text-sm text-fg-muted">Total</span>
                  <span className="font-display text-xl font-bold">
                    {formatMoney(formTotals.total)}
                  </span>
                </div>

                {formDepositType && (
                  <div className="flex items-center justify-between text-sm text-fg-muted">
                    <span>
                      Deposit due on approval
                      {formDepositType === "percent" && formDepositValue ? ` (${formDepositValue}%)` : ""}
                    </span>
                    <span>{formatMoney(formTotals.deposit_amount)}</span>
                  </div>
                )}

              </div>

              <button
                onClick={handleSaveQuote}
                disabled={saving}
                className="mt-1 rounded-lg bg-brand-600 px-5 py-3 font-semibold text-white transition hover:bg-brand-500 disabled:opacity-50"
              >
                {saving
                  ? (editingQuoteId ? "Saving..." : "Creating...")
                  : (editingQuoteId ? "Save Changes" : "Create Quote")}
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
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-surface p-6"
            onClick={(e) => e.stopPropagation()}
          >

            <div className="flex items-center justify-between">

              <div>
                <h3 className="font-display text-lg font-bold">
                  {activeQuote.customer_name || "Quote"}
                </h3>
                {quoteDisplayNumber(activeQuote) && (
                  <p className="text-xs font-medium text-fg-faint">
                    {quoteDisplayNumber(activeQuote)}
                  </p>
                )}
                {activeQuote.created_by_name && (
                  <p className="mt-0.5 text-xs text-fg-faint">
                    Added by {activeQuote.created_by_name}
                  </p>
                )}
                {activeQuote.status === "accepted" && activeQuote.accepted_by_name && (
                  <p className="mt-0.5 text-xs text-success">
                    Approved by {activeQuote.accepted_by_name} on {new Date(activeQuote.accepted_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                  </p>
                )}
                {activeQuote.status === "declined" && activeQuote.declined_at && (
                  <p className="mt-0.5 text-xs text-danger">
                    Declined on {new Date(activeQuote.declined_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                  </p>
                )}
              </div>

              <button
                onClick={() => setActiveQuote(null)}
                className="rounded-lg p-1 text-fg-muted hover:bg-surface-muted hover:text-fg"
                aria-label="Close"
              >
                <X size={18} />
              </button>

            </div>

            {detailError && (
              <p className="mt-3 text-sm text-danger">
                {detailError}
              </p>
            )}

            {detailSuccess && (
              <p className="mt-3 text-sm text-success">
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

                  <span className="rounded-full bg-surface-muted px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-fg-muted">
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

                <div className="mt-4 flex flex-col divide-y divide-border rounded-xl border border-border">

                  {(activeQuote.items || []).map((item) => (

                    <div key={item.id} className="flex items-center justify-between gap-3 p-3">

                      <div className="min-w-0">
                        <p className="truncate text-sm">{item.description}</p>
                        <p className="text-xs text-fg-faint">
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
                  <p className="mt-3 text-sm text-fg-muted">
                    {activeQuote.notes}
                  </p>
                )}

                <div className="mt-4 flex flex-col gap-1 rounded-lg bg-surface-muted px-4 py-3">

                  {(activeQuote.discount_type || activeQuote.tax_amount > 0) && (

                    <div className="flex items-center justify-between text-sm text-fg-muted">
                      <span>Subtotal</span>
                      <span>{formatMoney(activeQuote.subtotal)}</span>
                    </div>

                  )}

                  {activeQuote.discount_type && (

                    <div className="flex items-center justify-between text-sm text-fg-muted">
                      <span>
                        Discount
                        {activeQuote.discount_type === "percent"
                          ? ` (${activeQuote.discount_value}%)`
                          : ` (${formatMoney(activeQuote.discount_value)} off)`}
                      </span>
                      <span>-{formatMoney(activeQuote.discount_amount)}</span>
                    </div>

                  )}

                  {activeQuote.tax_amount > 0 && (

                    <div className="flex items-center justify-between text-sm text-fg-muted">
                      <span>
                        Tax
                        {activeQuote.tax_rate ? ` (${activeQuote.tax_rate}%)` : ""}
                      </span>
                      <span>{formatMoney(activeQuote.tax_amount)}</span>
                    </div>

                  )}

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-fg-muted">Total</span>
                    <span className="font-display text-xl font-bold">
                      {formatMoney(activeQuote.total)}
                    </span>
                  </div>

                  {activeQuote.deposit_type && (
                    <div className="flex items-center justify-between text-sm text-fg-muted">
                      <span>
                        Deposit
                        {activeQuote.deposit_type === "percent"
                          ? ` (${activeQuote.deposit_value}%)`
                          : ` (${formatMoney(activeQuote.deposit_value)})`}
                      </span>
                      <span className={activeQuote.deposit_paid_at ? "text-success" : ""}>
                        {formatMoney(activeQuote.deposit_amount)}
                        {activeQuote.deposit_paid_at
                          ? ` · paid ${new Date(activeQuote.deposit_paid_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`
                          : " · not yet paid"}
                      </span>
                    </div>
                  )}

                  {activeQuote.type === "invoice" && activeQuote.amount_paid > 0 && (

                    <>
                      <div className="flex items-center justify-between text-sm text-success">
                        <span>Paid</span>
                        <span>{formatMoney(activeQuote.amount_paid)}</span>
                      </div>

                      <div className="flex items-center justify-between text-sm font-semibold text-fg-muted">
                        <span>Balance Due</span>
                        <span>{formatMoney(activeQuote.balance_due)}</span>
                      </div>
                    </>

                  )}

                </div>

                <div className="mt-4 rounded-lg border border-border p-4">

                  <div className="flex items-center gap-2">
                    <Receipt size={16} className="text-fg-muted" />
                    <h4 className="text-sm font-semibold">Job Costs</h4>
                  </div>

                  {activeQuote.expenses?.length > 0 && (

                    <div className="mt-3 flex flex-col divide-y divide-border rounded-lg border border-border">

                      {activeQuote.expenses.map((expense) => (

                        <div key={expense.id} className="flex items-center justify-between gap-3 p-2.5">

                          <span className="min-w-0 truncate text-sm text-fg-muted">
                            {expense.description}
                          </span>

                          <div className="flex shrink-0 items-center gap-2">

                            <span className="text-sm text-fg-muted">
                              {formatMoney(expense.amount)}
                            </span>

                            <button
                              onClick={() => handleDeleteExpense(expense.id)}
                              disabled={deletingExpenseId === expense.id}
                              className="rounded p-1 text-fg-faint transition hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                              aria-label="Remove expense"
                            >
                              <Trash2 size={13} />
                            </button>

                          </div>

                        </div>

                      ))}

                    </div>

                  )}

                  <div className="mt-3 flex items-center gap-2">

                    <input
                      placeholder="Materials, labor, subcontractor..."
                      value={expenseDescription}
                      onChange={(e) => setExpenseDescription(e.target.value)}
                      className="min-w-0 flex-1 rounded-lg border border-border bg-surface-muted p-2 text-sm text-fg placeholder:text-fg-faint focus:border-border-strong focus:outline-none"
                    />

                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Amount"
                      value={expenseAmount}
                      onChange={(e) => setExpenseAmount(e.target.value)}
                      className="w-24 rounded-lg border border-border bg-surface-muted p-2 text-sm text-fg focus:border-border-strong focus:outline-none"
                    />

                    <button
                      onClick={handleAddExpense}
                      disabled={addingExpense}
                      className="shrink-0 rounded-lg bg-border px-3 py-2 text-sm font-medium transition hover:bg-border-strong disabled:opacity-50"
                    >
                      {addingExpense ? "Adding..." : "Add"}
                    </button>

                  </div>

                  {expenseError && (
                    <p className="mt-2 text-xs text-danger">{expenseError}</p>
                  )}

                  {activeQuote.expenses?.length > 0 && (

                    <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                      <span className="text-sm font-medium text-fg-muted">Margin</span>
                      <span className={`font-display text-lg font-bold ${activeQuote.margin < 0 ? "text-danger" : "text-success"}`}>
                        {formatMoney(activeQuote.margin)}
                      </span>
                    </div>

                  )}

                </div>

                {activeQuote.type === "invoice" && activeQuote.status !== "draft" && activeQuote.status !== "declined" && (

                  <div className="mt-4 rounded-lg border border-border p-4">

                    <div className="flex items-center gap-2">
                      <Wallet size={16} className="text-fg-muted" />
                      <h4 className="text-sm font-semibold">Payments</h4>
                    </div>

                    {activeQuote.payments?.length > 0 && (

                      <div className="mt-3 flex flex-col divide-y divide-border rounded-lg border border-border">

                        {activeQuote.payments.map((payment) => (

                          <div key={payment.id} className="flex items-center justify-between gap-3 p-2.5">

                            <div className="min-w-0">
                              <span className="text-sm text-fg-muted">
                                {PAYMENT_METHOD_LABELS[payment.method] || payment.method}
                              </span>
                              <span className="ml-2 text-xs text-fg-faint">
                                {new Date(payment.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                              </span>
                              {payment.note && (
                                <p className="truncate text-xs text-fg-faint">{payment.note}</p>
                              )}
                            </div>

                            <div className="flex shrink-0 items-center gap-2">

                              <span className="text-sm text-success">
                                {formatMoney(payment.amount)}
                              </span>

                              {activeQuote.status !== "paid" && (
                                <button
                                  onClick={() => handleDeletePayment(payment.id)}
                                  disabled={deletingPaymentId === payment.id}
                                  className="rounded p-1 text-fg-faint transition hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                                  aria-label="Remove payment"
                                >
                                  <Trash2 size={13} />
                                </button>
                              )}

                            </div>

                          </div>

                        ))}

                      </div>

                    )}

                    {activeQuote.status !== "paid" && (

                      <>
                        <div className="mt-3 flex items-center gap-2">

                          <select
                            value={paymentMethod}
                            onChange={(e) => setPaymentMethod(e.target.value)}
                            className="rounded-lg border border-border bg-surface-muted p-2 text-sm text-fg focus:border-border-strong focus:outline-none"
                          >
                            <option value="cash">Cash</option>
                            <option value="check">Check</option>
                            <option value="bank_transfer">Bank transfer</option>
                            <option value="other">Other</option>
                          </select>

                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder={`Amount (up to ${formatMoney(activeQuote.balance_due)})`}
                            value={paymentAmount}
                            onChange={(e) => setPaymentAmount(e.target.value)}
                            className="w-40 rounded-lg border border-border bg-surface-muted p-2 text-sm text-fg placeholder:text-fg-faint focus:border-border-strong focus:outline-none"
                          />

                          <button
                            onClick={handleAddPayment}
                            disabled={addingPayment}
                            className="shrink-0 rounded-lg bg-border px-3 py-2 text-sm font-medium transition hover:bg-border-strong disabled:opacity-50"
                          >
                            {addingPayment ? "Recording..." : "Record Payment"}
                          </button>

                        </div>

                        <input
                          placeholder="Note (optional)"
                          value={paymentNote}
                          onChange={(e) => setPaymentNote(e.target.value)}
                          className="mt-2 w-full rounded-lg border border-border bg-surface-muted p-2 text-sm text-fg placeholder:text-fg-faint focus:border-border-strong focus:outline-none"
                        />
                      </>

                    )}

                    {paymentError && (
                      <p className="mt-2 text-xs text-danger">{paymentError}</p>
                    )}

                  </div>

                )}

                <div className="mt-4 flex flex-wrap items-center gap-2">

                  {activeQuote.status !== "paid" && !activeQuote.deposit_paid_at && (
                    <button
                      onClick={() => openEditForm(activeQuote)}
                      className="flex items-center gap-1.5 rounded-lg bg-border px-3 py-2 text-sm font-medium transition hover:bg-border-strong"
                    >
                      <Pencil size={14} />
                      Edit
                    </button>
                  )}

                  <button
                    onClick={handleSendToCustomer}
                    disabled={sendingToCustomer}
                    className="flex items-center gap-1.5 rounded-lg bg-border px-3 py-2 text-sm font-medium transition hover:bg-border-strong disabled:opacity-50"
                  >
                    <Send size={14} />
                    {sendingToCustomer ? "Sending..." : "Send to Customer"}
                  </button>

                  <button
                    onClick={handleDownloadPdf}
                    disabled={downloadingPdf}
                    className="flex items-center gap-1.5 rounded-lg bg-border px-3 py-2 text-sm font-medium transition hover:bg-border-strong disabled:opacity-50"
                  >
                    <Download size={14} />
                    {downloadingPdf ? "Downloading..." : "Download PDF"}
                  </button>

                  {activeQuote.type === "quote" && (
                    <button
                      onClick={handleConvertToInvoice}
                      className="flex items-center gap-1.5 rounded-lg bg-border px-3 py-2 text-sm font-medium transition hover:bg-border-strong"
                    >
                      <ArrowRightLeft size={14} />
                      Convert to Invoice
                    </button>
                  )}

                  {confirmingDelete ? (

                    <div className="ml-auto flex items-center gap-2">

                      <span className="text-xs text-fg-muted">Delete this?</span>

                      <button
                        onClick={() => handleDelete(activeQuote.id)}
                        disabled={deleting}
                        className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium transition hover:bg-red-500 disabled:opacity-50"
                      >
                        {deleting ? "Deleting..." : "Confirm"}
                      </button>

                      <button
                        onClick={() => setConfirmingDelete(false)}
                        disabled={deleting}
                        className="rounded-lg bg-border px-3 py-1.5 text-sm font-medium transition hover:bg-border-strong disabled:opacity-50"
                      >
                        Cancel
                      </button>

                    </div>

                  ) : (

                    <button
                      onClick={() => setConfirmingDelete(true)}
                      className="ml-auto flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-danger transition hover:bg-danger/10"
                    >
                      <Trash2 size={14} />
                      Delete
                    </button>

                  )}

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
