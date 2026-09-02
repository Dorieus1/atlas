const PDFDocument = require("pdfkit");
const { formatQuoteNumber } = require("./quoteService");

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

function formatDiscountLabel(quote) {

  if (quote.discount_type === "percent") {
    return `Discount (${quote.discount_value}%)`;
  }

  return `Discount (${formatMoney(quote.discount_value)} off)`;

}


function formatDepositLabel(quote) {

  if (quote.deposit_type === "percent") {
    return `Deposit (${quote.deposit_value}%)`;
  }

  return "Deposit";

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


// Draws one item's row (description/qty/unit price/amount) plus its
// bottom border, handling its own page-break if it would run off the
// page. Factored out of the old single inline loop so a tiered quote's
// PDF (see drawTierSection below) can draw more than one such table on
// the same page without duplicating this row-drawing logic.
function drawItemRows(doc, startY, items) {

  let y = startY;

  (items || []).forEach((item) => {

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

  return y;

}


// A "Good/Better/Best" quote nobody has decided on yet gets each option
// laid out as its own labeled, stacked section (shared items + that
// option's own items, then that option's own bottom-line total) rather
// than one flat item list - there's no single "the" subtotal to show
// until a choice is made, so each option shows its own instead. Once
// accepted, this is never called - streamQuotePdf renders the chosen
// tier's items as an ordinary single list, same as a plain quote always
// has, with the usual Subtotal/Discount/Tax/Total breakdown underneath.
function drawTierSection(doc, startY, tier, sharedItems) {

  let y = startY;

  const headerHeight = 26;

  if (y + headerHeight > bottomOf(doc)) {
    doc.addPage();
    y = PAGE_MARGIN;
  }

  doc
    .font("Helvetica-Bold")
    .fontSize(13)
    .fillColor(INK_COLOR)
    .text(tier.is_recommended ? `${tier.name}  (Recommended)` : tier.name, 50, y, { width: 350 })
    .fillColor(BRAND_COLOR)
    .text(formatMoney(tier.total), COLUMNS.amount, y, { width: 65, align: "right" });

  y += headerHeight;

  y = drawTableHeader(doc, y);
  y = drawItemRows(doc, y, [...sharedItems, ...tier.items]);

  return y + 20;

}


// The usable content bottom before a new page is needed - PDFKit doesn't
// auto-paginate absolute-positioned .text() calls, so every block drawn
// below this function has to check its own remaining space and call
// doc.addPage() itself before it would run off the physical page.
function bottomOf(doc) {
  return doc.page.height - doc.page.margins.bottom;
}


// A signature captured through either acceptance path (the customer's
// own portal, or a staff member's device on-site) is a base64 PNG data
// URI - "data:image/png;base64,<data>". PDFKit's doc.image() wants a
// raw Buffer, not the data URI string itself, so this strips the prefix
// and decodes it. Draws nothing at all if there's no signature (an
// older, pre-signature acceptance, or a quote nobody's accepted yet) -
// this is purely additive to the PDF, never a required section.
function drawSignature(doc, quote, y) {

  if (!quote.signature) {
    return;
  }

  const SIGNATURE_HEIGHT = 60;
  const BLOCK_HEIGHT = 30 + SIGNATURE_HEIGHT + 14;

  let signatureY = y + 30;

  if (signatureY + BLOCK_HEIGHT > bottomOf(doc)) {

    doc.addPage();
    signatureY = PAGE_MARGIN;

  }

  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor(MUTED_COLOR)
    .text("SIGNATURE", 50, signatureY);

  try {

    const base64Data = quote.signature.replace(/^data:image\/png;base64,/, "");
    const imageBuffer = Buffer.from(base64Data, "base64");

    doc.image(imageBuffer, 50, signatureY + 14, { fit: [220, SIGNATURE_HEIGHT] });

  } catch (imageError) {

    // A corrupt/unreadable signature must never take down the whole PDF
    // download - the rest of the document (the actual quote/invoice
    // content) is what matters most, and this is the one section of it
    // that's cosmetic.
    console.error("SIGNATURE PDF RENDER FAILED:", imageError);

  }

  const signedLine = quote.accepted_by_name
    ? `Signed by ${quote.accepted_by_name}${quote.accepted_at ? ` on ${formatDate(quote.accepted_at)}` : ""}`
    : null;

  if (signedLine) {

    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(MUTED_COLOR)
      .text(
        quote.signature_method === "in_person" ? `${signedLine} (signed in person)` : signedLine,
        50,
        signatureY + 14 + SIGNATURE_HEIGHT + 4
      );

  }

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
  const documentNumber = formatQuoteNumber(quote.type, quote.quote_number);

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
    .text(
      documentNumber ? `${documentLabel.toUpperCase()}  ${documentNumber}` : documentLabel.toUpperCase(),
      50,
      115
    );

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

  let y;

  // A "Good/Better/Best" quote nobody has decided on yet has no single
  // item list or subtotal to show - see drawTierSection's own comment.
  // Once accepted (or for the overwhelming common case: a plain quote
  // that never had tiers at all), this is always false, and everything
  // below behaves exactly as it always has.
  const isUndecidedTiers = Array.isArray(quote.tiers) && quote.tiers.length > 0 && !quote.accepted_tier_id;

  if (isUndecidedTiers) {

    y = tableTop;

    quote.tiers.forEach((tier) => {
      y = drawTierSection(doc, y, tier, quote.shared_items || []);
    });

  } else {

    // An accepted "Good/Better/Best" quote only ever shows the ONE
    // package the customer actually agreed to - not quote.items, which
    // (for a tiered quote) is every option's items combined. A plain
    // quote has no tiers at all, so this is just quote.items, unchanged.
    const wasTiered = Array.isArray(quote.tiers) && quote.tiers.length > 0;

    const itemsToRender = wasTiered
      ? [
          ...(quote.shared_items || []),
          ...((quote.tiers.find((tier) => tier.id === quote.accepted_tier_id) || quote.tiers[0]).items)
        ]
      : quote.items;

    y = drawTableHeader(doc, tableTop);
    y = drawItemRows(doc, y, itemsToRender);

    // Only quotes with an actual discount or tax get the Subtotal/
    // Discount/Tax/Total breakdown - one with neither keeps the exact
    // single "Total" line this PDF has always shown, so existing quotes'
    // PDFs don't suddenly grow lines that were never there.
    const hasDiscount = !!quote.discount_type;
    const hasTax = Number(quote.tax_amount) > 0;
    const hasBreakdown = hasDiscount || hasTax;
    const hasDeposit = !!quote.deposit_type;
    const depositPaid = hasDeposit && !!quote.deposit_paid_at;

    const DISCOUNT_LABEL_X = 250;
    const DISCOUNT_LABEL_WIDTH = 210;
    const BREAKDOWN_LINE_HEIGHT = 18;

    // The "30" here is the same rough single-line height the page-break
    // math always used for the Total line - extra lines are added on top
    // of it for each optional block (subtotal, discount, tax, deposit, and,
    // once a deposit has actually been paid, the remaining balance still
    // owed) that also needs to be drawn.
    let totalsBlockHeight = 30;

    if (hasBreakdown) {
      totalsBlockHeight += BREAKDOWN_LINE_HEIGHT;
    }

    if (hasDiscount) {
      totalsBlockHeight += BREAKDOWN_LINE_HEIGHT;
    }

    if (hasTax) {
      totalsBlockHeight += BREAKDOWN_LINE_HEIGHT;
    }

    if (hasDeposit) {
      totalsBlockHeight += BREAKDOWN_LINE_HEIGHT * (depositPaid ? 2 : 1);
    }

    if (y + 20 + totalsBlockHeight > bottomOf(doc)) {

      doc.addPage();
      y = PAGE_MARGIN;

    } else {

      y += 20;

    }

    if (hasBreakdown) {

      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor(MUTED_COLOR)
        .text("Subtotal", DISCOUNT_LABEL_X, y, { width: DISCOUNT_LABEL_WIDTH, align: "right" })
        .fillColor(INK_COLOR)
        .text(formatMoney(quote.subtotal), COLUMNS.amount, y, { width: 65, align: "right" });

      y += BREAKDOWN_LINE_HEIGHT;

    }

    if (hasDiscount) {

      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor(MUTED_COLOR)
        .text(formatDiscountLabel(quote), DISCOUNT_LABEL_X, y, { width: DISCOUNT_LABEL_WIDTH, align: "right" })
        .fillColor(INK_COLOR)
        .text(`-${formatMoney(quote.discount_amount)}`, COLUMNS.amount, y, { width: 65, align: "right" });

      y += BREAKDOWN_LINE_HEIGHT;

    }

    if (hasTax) {

      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor(MUTED_COLOR)
        .text(`Tax (${quote.tax_rate}%)`, DISCOUNT_LABEL_X, y, { width: DISCOUNT_LABEL_WIDTH, align: "right" })
        .fillColor(INK_COLOR)
        .text(formatMoney(quote.tax_amount), COLUMNS.amount, y, { width: 65, align: "right" });

      y += BREAKDOWN_LINE_HEIGHT;

    }

    doc
      .font("Helvetica-Bold")
      .fontSize(12)
      .fillColor(INK_COLOR)
      .text("Total", COLUMNS.unitPrice, y, { width: 70, align: "right" })
      .fillColor(BRAND_COLOR)
      .text(formatMoney(quote.total), COLUMNS.amount, y, { width: 65, align: "right" });

    if (hasDeposit) {

      y += BREAKDOWN_LINE_HEIGHT + 6;

      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor(MUTED_COLOR)
        // The "(paid)" note lives on the label side, which has 210px to
        // work with - cramming it into the narrow 65px amount column
        // alongside the dollar figure wrapped onto a second line and
        // visually collided with the Remaining Balance line right below it.
        .text(
          `${formatDepositLabel(quote)}${depositPaid ? " (paid)" : ""}`,
          DISCOUNT_LABEL_X,
          y,
          { width: DISCOUNT_LABEL_WIDTH, align: "right" }
        )
        .fillColor(depositPaid ? "#16a34a" : INK_COLOR)
        .text(formatMoney(quote.deposit_amount), COLUMNS.amount, y, { width: 65, align: "right" });

      if (depositPaid) {

        y += BREAKDOWN_LINE_HEIGHT;

        doc
          .font("Helvetica-Bold")
          .fontSize(10)
          .fillColor(MUTED_COLOR)
          .text("Remaining Balance", DISCOUNT_LABEL_X, y, { width: DISCOUNT_LABEL_WIDTH, align: "right" })
          .fillColor(INK_COLOR)
          .text(formatMoney(Math.max(quote.total - quote.deposit_amount, 0)), COLUMNS.amount, y, { width: 65, align: "right" });

      }

    }

  }

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

    y += 14 + notesHeight;

  }

  drawSignature(doc, quote, y);

  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(MUTED_COLOR)
    .text("Powered by Atlas", 50, doc.page.height - 60, { width: 495, align: "center" });

  doc.end();

}


// A different column layout from the line-item table above (Date /
// Invoice # / Status / Total / Paid / Balance, not description/qty/
// price/amount) - a statement is a summary of invoices, not one
// invoice's own line items, so it gets its own small header/row
// drawing rather than reusing drawTableHeader/drawItemRows.
const STATEMENT_COLUMNS = { date: 50, number: 150, status: 250, total: 340, paid: 410, balance: 480 };

function drawStatementTableHeader(doc, y) {

  doc
    .rect(50, y, 495, 24)
    .fill("#f9fafb");

  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor(MUTED_COLOR)
    .text("DATE", STATEMENT_COLUMNS.date + 10, y + 8)
    .text("INVOICE", STATEMENT_COLUMNS.number, y + 8)
    .text("STATUS", STATEMENT_COLUMNS.status, y + 8)
    .text("TOTAL", STATEMENT_COLUMNS.total, y + 8, { width: 65, align: "right" })
    .text("PAID", STATEMENT_COLUMNS.paid, y + 8, { width: 65, align: "right" })
    .text("BALANCE", STATEMENT_COLUMNS.balance, y + 8, { width: 65, align: "right" });

  return y + 24;

}


// A "statement of account" - every invoice billed to one customer, what
// they've paid, and what's still owed on each, plus a running total.
// The one document a business hands (or emails) to a customer who asks
// "what do I owe you?" instead of pointing them at a pile of individual
// invoice PDFs.
function streamCustomerStatementPdf(res, statement, business) {

  const doc = new PDFDocument({ size: "A4", margin: PAGE_MARGIN });

  doc.pipe(res);

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
    .text("STATEMENT OF ACCOUNT", 50, 115);

  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(MUTED_COLOR)
    .text(`As of ${formatDate(new Date().toISOString())}`, 400, 68, { width: 145, align: "right" });

  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor(MUTED_COLOR)
    .text("BILL TO", 50, 150);

  doc
    .font("Helvetica")
    .fontSize(12)
    .fillColor(INK_COLOR)
    .text(statement.customer.name || "Customer", 50, 166);

  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(MUTED_COLOR)
    .text([statement.customer.email, statement.customer.phone].filter(Boolean).join("  ·  "), 50, 182);

  const tableTop = 215;

  let y = drawStatementTableHeader(doc, tableTop);

  if (statement.invoices.length === 0) {

    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor(MUTED_COLOR)
      .text("No invoices on file.", 60, y + 8);

    y += ROW_HEIGHT;

  }

  statement.invoices.forEach((invoice) => {

    if (y + ROW_HEIGHT > bottomOf(doc)) {

      doc.addPage();
      y = drawStatementTableHeader(doc, PAGE_MARGIN);

    }

    const documentNumber = formatQuoteNumber("invoice", invoice.quote_number);
    const statusLabel = STATUS_LABELS[invoice.status] || invoice.status.toUpperCase();

    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor(INK_COLOR)
      .text(formatDate(invoice.created_at), STATEMENT_COLUMNS.date + 10, y + 8, { width: 90 })
      .text(documentNumber || "-", STATEMENT_COLUMNS.number, y + 8, { width: 90 })
      .fillColor(invoice.status === "paid" ? "#16a34a" : MUTED_COLOR)
      .text(statusLabel, STATEMENT_COLUMNS.status, y + 8, { width: 80 })
      .fillColor(INK_COLOR)
      .text(formatMoney(invoice.total), STATEMENT_COLUMNS.total, y + 8, { width: 65, align: "right" })
      .text(formatMoney(invoice.amount_paid), STATEMENT_COLUMNS.paid, y + 8, { width: 65, align: "right" })
      .font("Helvetica-Bold")
      .text(formatMoney(invoice.balance_due), STATEMENT_COLUMNS.balance, y + 8, { width: 65, align: "right" });

    doc
      .strokeColor(BORDER_COLOR)
      .lineWidth(0.5)
      .moveTo(50, y + ROW_HEIGHT)
      .lineTo(545, y + ROW_HEIGHT)
      .stroke();

    y += ROW_HEIGHT;

  });

  const totalsBlockHeight = 30 + 18 + 18;

  if (y + 20 + totalsBlockHeight > bottomOf(doc)) {

    doc.addPage();
    y = PAGE_MARGIN;

  } else {

    y += 20;

  }

  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor(MUTED_COLOR)
    .text("Total Billed", 250, y, { width: 210, align: "right" })
    .fillColor(INK_COLOR)
    .text(formatMoney(statement.totals.total_billed), STATEMENT_COLUMNS.balance, y, { width: 65, align: "right" });

  y += 18;

  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor(MUTED_COLOR)
    .text("Total Paid", 250, y, { width: 210, align: "right" })
    .fillColor(INK_COLOR)
    .text(formatMoney(statement.totals.total_paid), STATEMENT_COLUMNS.balance, y, { width: 65, align: "right" });

  y += 18;

  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .fillColor(INK_COLOR)
    .text("Balance Due", 250, y, { width: 210, align: "right" })
    .fillColor(BRAND_COLOR)
    .text(formatMoney(statement.totals.total_balance_due), STATEMENT_COLUMNS.balance, y, { width: 65, align: "right" });

  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(MUTED_COLOR)
    .text("Powered by Atlas", 50, doc.page.height - 60, { width: 495, align: "center" });

  doc.end();

}


module.exports = {
  streamQuotePdf,
  streamCustomerStatementPdf
};
