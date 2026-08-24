const PDFDocument = require("pdfkit");

const BRAND_COLOR = "#f97316";
const INK_COLOR = "#0f1117";
const MUTED_COLOR = "#6b7280";
const BORDER_COLOR = "#e5e7eb";

const PAGE_MARGIN = 50;
const ROW_HEIGHT = 26;

const STATUS_LABELS = {
  draft: "DRAFT",
  sent: "SENT",
  accepted: "ACCEPTED",
  declined: "DECLINED",
  paid: "PAID"
};

const COLUMNS = { description: 50, quantity: 320, unitPrice: 390, amount: 470 };

function formatMoney(amount) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount || 0);
}

function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}


function drawTableHeader(doc, y) {

  doc
    .rect(50, y, 495, 24)
    .fill("#f9fafb");

  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor(MUTED_COLOR)
    .text("DESCRIPTION", COLUMNS.description + 10, y + 8)
    .text("QTY", COLUMNS.quantity, y + 8, { width: 50, align: "right" })
    .text("UNIT PRICE", COLUMNS.unitPrice, y + 8, { width: 70, align: "right" })
    .text("AMOUNT", COLUMNS.amount, y + 8, { width: 65, align: "right" });

  return y + 24;

}


// The usable content bottom before a new page is needed - PDFKit doesn't
// auto-paginate absolute-positioned .text() calls, so every block drawn
// below this function has to check its own remaining space and call
// doc.addPage() itself before it would run off the physical page.
function bottomOf(doc) {
  return doc.page.height - doc.page.margins.bottom;
}


// Streams a PDF straight to res (an Express response, or any writable
// stream) - the caller sets headers and pipes this in, nothing gets
// buffered in memory. Paginates: a long line-item list (up to the 100
// items validateItems() allows) spills onto additional pages instead of
// silently overlapping the total/notes/footer.
function streamQuotePdf(res, quote, business) {

  const doc = new PDFDocument({ size: "A4", margin: PAGE_MARGIN });

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

  let y = drawTableHeader(doc, tableTop);

  (quote.items || []).forEach((item) => {

    if (y + ROW_HEIGHT > bottomOf(doc)) {

      doc.addPage();
      y = drawTableHeader(doc, PAGE_MARGIN);

    }

    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor(INK_COLOR)
      .text(item.description, COLUMNS.description + 10, y + 8, { width: 260 })
      .text(String(item.quantity), COLUMNS.quantity, y + 8, { width: 50, align: "right" })
      .text(formatMoney(item.unit_price), COLUMNS.unitPrice, y + 8, { width: 70, align: "right" })
      .text(formatMoney(item.quantity * item.unit_price), COLUMNS.amount, y + 8, { width: 65, align: "right" });

    doc
      .strokeColor(BORDER_COLOR)
      .lineWidth(0.5)
      .moveTo(50, y + ROW_HEIGHT)
      .lineTo(545, y + ROW_HEIGHT)
      .stroke();

    y += ROW_HEIGHT;

  });

  if (y + 20 + 30 > bottomOf(doc)) {

    doc.addPage();
    y = PAGE_MARGIN;

  } else {

    y += 20;

  }

  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .fillColor(INK_COLOR)
    .text("Total", COLUMNS.unitPrice, y, { width: 70, align: "right" })
    .fillColor(BRAND_COLOR)
    .text(formatMoney(quote.total), COLUMNS.amount, y, { width: 65, align: "right" });

  if (quote.notes) {

    // Rough estimate of the notes block's height (label + wrapped text)
    // to decide up front whether it needs a fresh page, rather than
    // starting to draw it and running off the bottom mid-paragraph.
    const notesHeight = 14 + doc.heightOfString(quote.notes, { width: 495, fontSize: 10 });

    if (y + 50 + notesHeight > bottomOf(doc)) {

      doc.addPage();
      y = PAGE_MARGIN;

    } else {

      y += 50;

    }

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
    .text("Powered by Atlas", 50, doc.page.height - 60, { width: 495, align: "center" });

  doc.end();

}


module.exports = {
  streamQuotePdf
};
