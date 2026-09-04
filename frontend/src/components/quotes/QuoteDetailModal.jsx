import { useEffect, useState } from "react";
import {
  X,
  Trash2,
  ArrowRightLeft,
  Download,
  Pencil,
  Send,
  Receipt,
  Wallet,
  PenLine
} from "lucide-react";

import {
  getQuote,
  updateQuote,
  sendQuote,
  addQuoteExpense,
  deleteQuoteExpense,
  addQuotePayment,
  deleteQuotePayment,
  deleteQuote,
  downloadQuotePdf
} from "../../api/atlasApi";

import Skeleton from "../Skeleton";
import { formatMoney } from "../../utils/serviceAgreements";
import { quoteDisplayNumber } from "../../utils/quoteNumber";
import { STATUS_STYLES, STATUS_OPTIONS, PAYMENT_METHOD_LABELS } from "../../utils/quoteHelpers";
import SignOnSiteModal from "./SignOnSiteModal";


// Split out of the old single Quotes.jsx - everything about looking at
// and acting on ONE quote/invoice (status, PDF, send, sign, job costs,
// payments, delete) now lives here instead of inline in the list page.
// Only needs the id to load - the list page (Quotes.jsx) never has to
// hand over its own quote data, and doesn't need to know anything about
// what happens inside here beyond the three callbacks below.
function QuoteDetailModal({ quoteId, onClose, onEdit, onChanged }) {

  const [quote, setQuote] = useState({ id: quoteId });
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [detailSuccess, setDetailSuccess] = useState("");
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
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

  const [signingOnSite, setSigningOnSite] = useState(false);


  const loadDetail = async () => {

    setDetailError("");
    setDetailLoading(true);

    try {

      const data = await getQuote(quoteId);
      setQuote(data);

    } catch (error) {

      console.error("QUOTE DETAIL ERROR:", error);
      setDetailError("Couldn't load this quote. Please try again.");

    } finally {

      setDetailLoading(false);

    }

  };

  useEffect(() => {

    loadDetail();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteId]);


  const handleStatusChange = async (status) => {

    try {

      setDetailError("");
      setDetailSuccess("");

      const result = await updateQuote(quote.id, { status });

      if (result?.review_request_sent) {
        setDetailSuccess("Marked paid — a review request was automatically sent to this customer.");
      }

      setQuote((previous) => ({ ...previous, status }));
      onChanged();

    } catch (error) {

      console.error("UPDATE QUOTE ERROR:", error);
      setDetailError("Couldn't update this quote. Please try again.");

    }

  };


  const handleConvertToInvoice = async () => {

    try {

      setDetailError("");
      await updateQuote(quote.id, { type: "invoice", status: "sent" });
      setQuote((previous) => ({ ...previous, type: "invoice", status: "sent" }));
      onChanged();

    } catch (error) {

      console.error("CONVERT QUOTE ERROR:", error);
      setDetailError("Couldn't convert this to an invoice. Please try again.");

    }

  };


  const handleDownloadPdf = async () => {

    setDownloadingPdf(true);
    setDetailError("");

    try {

      await downloadQuotePdf(quote.id);

    } catch (error) {

      console.error("DOWNLOAD PDF ERROR:", error);
      setDetailError("Couldn't download the PDF. Please try again.");

    } finally {

      setDownloadingPdf(false);

    }

  };


  const handleSendToCustomer = async () => {

    setSendingToCustomer(true);
    setDetailError("");
    setDetailSuccess("");

    try {

      await sendQuote(quote.id);
      setDetailSuccess(`Emailed to ${quote.customer_name || "the customer"}.`);
      onChanged();
      const data = await getQuote(quote.id);
      setQuote(data);

    } catch (error) {

      console.error("SEND QUOTE ERROR:", error);
      setDetailError(error.message || "Couldn't send this to the customer. Please try again.");

    } finally {

      setSendingToCustomer(false);

    }

  };


  const handleSigned = async () => {

    setSigningOnSite(false);
    setDetailSuccess("Signed and marked accepted.");
    onChanged();

    const data = await getQuote(quote.id);
    setQuote(data);

  };


  const handleAddExpense = async () => {

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

      await addQuoteExpense(quote.id, expenseDescription.trim(), amount);
      setExpenseDescription("");
      setExpenseAmount("");

      const data = await getQuote(quote.id);
      setQuote(data);

    } catch (error) {

      console.error("ADD EXPENSE ERROR:", error);
      setExpenseError(error.message || "Couldn't add that expense. Please try again.");

    } finally {

      setAddingExpense(false);

    }

  };


  const handleDeleteExpense = async (expenseId) => {

    setDeletingExpenseId(expenseId);

    try {

      await deleteQuoteExpense(quote.id, expenseId);

      const data = await getQuote(quote.id);
      setQuote(data);

    } catch (error) {

      console.error("DELETE EXPENSE ERROR:", error);
      setExpenseError("Couldn't remove that expense. Please try again.");

    } finally {

      setDeletingExpenseId(null);

    }

  };


  const handleAddPayment = async () => {

    const amount = Number(paymentAmount);

    if (!Number.isFinite(amount) || amount <= 0) {
      setPaymentError("Enter a valid, positive amount.");
      return;
    }

    setAddingPayment(true);
    setPaymentError("");

    try {

      await addQuotePayment(quote.id, amount, paymentMethod, paymentNote.trim() || null);
      setPaymentAmount("");
      setPaymentNote("");

      const data = await getQuote(quote.id);
      setQuote(data);
      onChanged();

    } catch (error) {

      console.error("ADD PAYMENT ERROR:", error);
      setPaymentError(error.message || "Couldn't record that payment. Please try again.");

    } finally {

      setAddingPayment(false);

    }

  };


  const handleDeletePayment = async (paymentId) => {

    setDeletingPaymentId(paymentId);
    setPaymentError("");

    try {

      await deleteQuotePayment(quote.id, paymentId);

      const data = await getQuote(quote.id);
      setQuote(data);
      onChanged();

    } catch (error) {

      console.error("DELETE PAYMENT ERROR:", error);
      setPaymentError("Couldn't remove that payment. Please try again.");

    } finally {

      setDeletingPaymentId(null);

    }

  };


  const handleDelete = async () => {

    setDeleting(true);

    try {

      await deleteQuote(quote.id);
      onChanged();
      onClose();

    } catch (error) {

      console.error("DELETE QUOTE ERROR:", error);
      setDetailError("Couldn't delete this. Please try again.");
      setDeleting(false);

    }

  };


  return (

    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >

      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-surface p-6"
        onClick={(e) => e.stopPropagation()}
      >

        <div className="flex items-center justify-between">

          <div>
            <h3 className="font-display text-lg font-bold">
              {quote.customer_name || "Quote"}
            </h3>
            {quoteDisplayNumber(quote) && (
              <p className="text-xs font-medium text-fg-faint">
                {quoteDisplayNumber(quote)}
              </p>
            )}
            {quote.created_by_name && (
              <p className="mt-0.5 text-xs text-fg-faint">
                Added by {quote.created_by_name}
              </p>
            )}
            {quote.status === "accepted" && quote.accepted_by_name && (
              <p className="mt-0.5 text-xs text-success">
                Approved by {quote.accepted_by_name} on {new Date(quote.accepted_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                {quote.signature_method === "in_person" ? " (in person)" : ""}
              </p>
            )}

            {quote.signature && (

              <>

                <img
                  src={quote.signature}
                  alt={`${quote.accepted_by_name || "Customer"}'s signature`}
                  className="mt-1.5 h-10 rounded border border-border bg-white px-1"
                />

                {quote.signed_ip_address && (

                  // A basic audit trail - the same kind of thing a
                  // mainstream e-signature tool (DocuSign, etc.)
                  // records by default, kept around in case a
                  // signature is ever disputed.
                  <p className="mt-1 text-[11px] text-fg-faint" title={quote.signed_user_agent || ""}>
                    Signed from {quote.signed_ip_address}
                  </p>

                )}

              </>

            )}
            {quote.status === "declined" && quote.declined_at && (
              <p className="mt-0.5 text-xs text-danger">
                Declined on {new Date(quote.declined_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
              </p>
            )}
          </div>

          <button
            onClick={onClose}
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
                {quote.type}
              </span>

              <select
                value={quote.status}
                onChange={(e) => handleStatusChange(e.target.value)}
                className={`rounded-full border-0 px-2.5 py-1 text-[11px] font-medium ${STATUS_STYLES[quote.status]}`}
              >
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>

            </div>

            {Array.isArray(quote.tiers) && quote.tiers.length > 0 && !quote.accepted_tier_id ? (

              // Nobody's decided yet - show every option side by side
              // instead of one flat item list, same reasoning as the
              // PDF's own drawTierSection.
              <div className="mt-4 flex flex-col gap-3">

                {(quote.shared_items || []).length > 0 && (

                  <div className="rounded-xl border border-border">

                    <p className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-fg-faint">
                      Included with every option
                    </p>

                    {quote.shared_items.map((item) => (
                      <div key={item.id} className="flex items-center justify-between gap-3 border-b border-border p-3 last:border-b-0">
                        <p className="truncate text-sm">{item.description}</p>
                        <span className="shrink-0 text-sm font-semibold">{formatMoney(item.quantity * item.unit_price)}</span>
                      </div>
                    ))}

                  </div>

                )}

                {quote.tiers.map((tier) => (

                  <div key={tier.id} className={`rounded-xl border p-3 ${tier.is_recommended ? "border-brand-500 bg-brand-600/5" : "border-border"}`}>

                    <div className="flex items-center justify-between">
                      <span className="font-display text-lg font-bold">
                        {tier.name}
                        {tier.is_recommended && (
                          <span className="ml-2 rounded-full bg-brand-600/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-text">
                            Recommended
                          </span>
                        )}
                      </span>
                      <span className="font-display text-lg font-bold text-accent-text">
                        {formatMoney(tier.total)}
                      </span>
                    </div>

                    {tier.items.length > 0 && (

                      <div className="mt-2 flex flex-col gap-1">
                        {tier.items.map((item) => (
                          <div key={item.id} className="flex items-center justify-between text-sm text-fg-muted">
                            <span className="truncate">{item.description}</span>
                            <span className="shrink-0">{formatMoney(item.quantity * item.unit_price)}</span>
                          </div>
                        ))}
                      </div>

                    )}

                  </div>

                ))}

              </div>

            ) : (

              <div className="mt-4 flex flex-col divide-y divide-border rounded-xl border border-border">

                {(Array.isArray(quote.tiers) && quote.tiers.length > 0
                  ? [
                      ...(quote.shared_items || []),
                      ...((quote.tiers.find((tier) => tier.id === quote.accepted_tier_id) || quote.tiers[0]).items)
                    ]
                  : (quote.items || [])
                ).map((item) => (

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

            )}

            {Array.isArray(quote.tiers) && quote.tiers.length > 0 && quote.accepted_tier_id && (

              <p className="mt-3 flex items-center gap-1.5 text-sm text-fg-muted">
                <span className="font-medium text-accent-text">
                  {(quote.tiers.find((tier) => tier.id === quote.accepted_tier_id) || {}).name}
                </span>
                was the option chosen.
              </p>

            )}

            {quote.notes && (
              <p className="mt-3 text-sm text-fg-muted">
                {quote.notes}
              </p>
            )}

            {(!Array.isArray(quote.tiers) || quote.tiers.length === 0 || quote.accepted_tier_id) && (

            <div className="mt-4 flex flex-col gap-1 rounded-lg bg-surface-muted px-4 py-3">

              {(quote.discount_type || quote.tax_amount > 0) && (

                <div className="flex items-center justify-between text-sm text-fg-muted">
                  <span>Subtotal</span>
                  <span>{formatMoney(quote.subtotal)}</span>
                </div>

              )}

              {quote.discount_type && (

                <div className="flex items-center justify-between text-sm text-fg-muted">
                  <span>
                    Discount
                    {quote.discount_type === "percent"
                      ? ` (${quote.discount_value}%)`
                      : ` (${formatMoney(quote.discount_value)} off)`}
                  </span>
                  <span>-{formatMoney(quote.discount_amount)}</span>
                </div>

              )}

              {quote.tax_amount > 0 && (

                <div className="flex items-center justify-between text-sm text-fg-muted">
                  <span>
                    Tax
                    {quote.tax_rate ? ` (${quote.tax_rate}%)` : ""}
                  </span>
                  <span>{formatMoney(quote.tax_amount)}</span>
                </div>

              )}

              <div className="flex items-center justify-between">
                <span className="text-sm text-fg-muted">Total</span>
                <span className="font-display text-xl font-bold">
                  {formatMoney(quote.total)}
                </span>
              </div>

              {quote.deposit_type && (
                <div className="flex items-center justify-between text-sm text-fg-muted">
                  <span>
                    Deposit
                    {quote.deposit_type === "percent"
                      ? ` (${quote.deposit_value}%)`
                      : ` (${formatMoney(quote.deposit_value)})`}
                  </span>
                  <span className={quote.deposit_paid_at ? "text-success" : ""}>
                    {formatMoney(quote.deposit_amount)}
                    {quote.deposit_paid_at
                      ? ` · paid ${new Date(quote.deposit_paid_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`
                      : " · not yet paid"}
                  </span>
                </div>
              )}

              {quote.type === "invoice" && quote.amount_paid > 0 && (

                <>
                  <div className="flex items-center justify-between text-sm text-success">
                    <span>Paid</span>
                    <span>{formatMoney(quote.amount_paid)}</span>
                  </div>

                  <div className="flex items-center justify-between text-sm font-semibold text-fg-muted">
                    <span>Balance Due</span>
                    <span>{formatMoney(quote.balance_due)}</span>
                  </div>
                </>

              )}

            </div>

            )}

            <div className="mt-4 rounded-lg border border-border p-4">

              <div className="flex items-center gap-2">
                <Receipt size={16} className="text-fg-muted" />
                <h4 className="text-sm font-semibold">Job Costs</h4>
              </div>

              {quote.expenses?.length > 0 && (

                <div className="mt-3 flex flex-col divide-y divide-border rounded-lg border border-border">

                  {quote.expenses.map((expense) => (

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

              {quote.expenses?.length > 0 && (

                <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                  <span className="text-sm font-medium text-fg-muted">Margin</span>
                  <span className={`font-display text-lg font-bold ${quote.margin < 0 ? "text-danger" : "text-success"}`}>
                    {formatMoney(quote.margin)}
                  </span>
                </div>

              )}

            </div>

            {quote.type === "invoice" && quote.status !== "draft" && quote.status !== "declined" && (

              <div className="mt-4 rounded-lg border border-border p-4">

                <div className="flex items-center gap-2">
                  <Wallet size={16} className="text-fg-muted" />
                  <h4 className="text-sm font-semibold">Payments</h4>
                </div>

                {quote.payments?.length > 0 && (

                  <div className="mt-3 flex flex-col divide-y divide-border rounded-lg border border-border">

                    {quote.payments.map((payment) => (

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

                          {quote.status !== "paid" && (
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

                {quote.status !== "paid" && (

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
                        placeholder={`Amount (up to ${formatMoney(quote.balance_due)})`}
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

              {quote.status !== "paid" && !quote.deposit_paid_at && (
                <button
                  onClick={() => onEdit(quote)}
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

              {quote.status === "sent" && (
                <button
                  onClick={() => setSigningOnSite(true)}
                  className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-brand-500"
                >
                  <PenLine size={14} />
                  Sign On-Site
                </button>
              )}

              <button
                onClick={handleDownloadPdf}
                disabled={downloadingPdf}
                className="flex items-center gap-1.5 rounded-lg bg-border px-3 py-2 text-sm font-medium transition hover:bg-border-strong disabled:opacity-50"
              >
                <Download size={14} />
                {downloadingPdf ? "Downloading..." : "Download PDF"}
              </button>

              {quote.type === "quote" && (
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
                    onClick={handleDelete}
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

      {signingOnSite && (

        <SignOnSiteModal
          quote={quote}
          onClose={() => setSigningOnSite(false)}
          onSigned={handleSigned}
        />

      )}

    </div>

  );

}

export default QuoteDetailModal;
