const PDFDocument = require("pdfkit");

const BRAND_COLOR = "#f97316";
const INK_COLOR = "#0f1117";
const MUTED_COLOR = "#6b7280";
const BORDER_COLOR = "#e5e7eb";

const STATUS_LABELS = {
  draft: "DRAFT",
  sent: "SENT",
  accepted: "ACCEPTED",
  declined: "DECLINED",
  paid: "PAID"
};

function formatMoney(amount) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount || 0);
}

function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}


// Streams a one-page PDF straight to res (an Express response, or any
// writable stream) - the caller sets headers and pipes this in, nothing
// gets buffered in memory for what's normally a short document.
function streamQuotePdf(res, quote, business) {

  const doc = new PDFDocument({ size: "A4", margin: 50 });

  doc.pipe(res);

  const documentLabel = quote.type === "invoice" ? "Invoice" : "Quote";

  doc
    .font("Helvetica-Bold")
    .fontSize(22)
    .fillColor(INK_COLOR)
    .text(business.name || "Your Business", 50, 50);

  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor(MUTED_COLOR)
    .text([business.phone, business.email, business.address].filter(Boolean).join("  ·  "), 50, 78);

  doc
    .font("Helvetica-Bold")
    .fontSize(18)
    .fillColor(BRAND_COLOR)
    .text(documentLabel.toUpperCase(), 50, 115);

  const statusLabel = STATUS_LABELS[quote.status] || quote.status.toUpperCase();

  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor(quote.status === "paid" ? "#16a34a" : MUTED_COLOR)
    .text(statusLabel, 400, 50, { width: 145, align: "right" });

  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(MUTED_COLOR)
    .text(`Date: ${formatDate(quote.created_at)}`, 400, 68, { width: 145, align: "right" });

  if (quote.status === "paid" && quote.paid_at) {

    doc.text(`Paid: ${formatDate(quote.paid_at)}`, 400, 82, { width: 145, align: "right" });

  }

  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor(MUTED_COLOR)
    .text("BILL TO", 50, 150);

  doc
    .font("Helvetica")
    .fontSize(12)
    .fillColor(INK_COLOR)
    .text(quote.customer_name || "Customer", 50, 166);

  const tableTop = 210;
  const col = { description: 50, quantity: 320, unitPrice: 390, amount: 470 };

  doc
    .rect(50, tableTop, 495, 24)
    .fill("#f9fafb");

  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor(MUTED_COLOR)
    .text("DESCRIPTION", col.description + 10, tableTop + 8)
    .text("QTY", col.quantity, tableTop + 8, { width: 50, align: "right" })
    .text("UNIT PRICE", col.unitPrice, tableTop + 8, { width: 70, align: "right" })
    .text("AMOUNT", col.amount, tableTop + 8, { width: 65, align: "right" });

  let y = tableTop + 24;

  (quote.items || []).forEach((item) => {

    const rowHeight = 26;

    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor(INK_COLOR)
      .text(item.description, col.description + 10, y + 8, { width: 260 })
      .text(String(item.quantity), col.quantity, y + 8, { width: 50, align: "right" })
      .text(formatMoney(item.unit_price), col.unitPrice, y + 8, { width: 70, align: "right" })
      .text(formatMoney(item.quantity * item.unit_price), col.amount, y + 8, { width: 65, align: "right" });

    doc
      .strokeColor(BORDER_COLOR)
      .lineWidth(0.5)
      .moveTo(50, y + rowHeight)
      .lineTo(545, y + rowHeight)
      .stroke();

    y += rowHeight;

  });

  y += 20;

  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .fillColor(INK_COLOR)
    .text("Total", col.unitPrice, y, { width: 70, align: "right" })
    .fillColor(BRAND_COLOR)
    .text(formatMoney(quote.total), col.amount, y, { width: 65, align: "right" });

  if (quote.notes) {

    y += 50;

    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .fillColor(MUTED_COLOR)
      .text("NOTES", 50, y);

    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor(INK_COLOR)
      .text(quote.notes, 50, y + 14, { width: 495 });

  }

  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(MUTED_COLOR)
    .text("Powered by Atlas", 50, 780, { width: 495, align: "center" });

  doc.end();

}


module.exports = {
  streamQuotePdf
};
