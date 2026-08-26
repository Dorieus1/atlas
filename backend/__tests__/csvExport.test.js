const request = require("supertest");
const app = require("../server");
const { createBusinessAndUser } = require("./setup/helpers");

const createCustomer = async (authHeader, name, email) => {

  const res = await request(app)
    .post("/api/customers")
    .set("Authorization", authHeader)
    .send({ name, email });

  return res.body.id;

};

const createQuote = async (authHeader, customerId, overrides = {}) => {

  const res = await request(app)
    .post("/api/quotes")
    .set("Authorization", authHeader)
    .send({
      customer_id: customerId,
      type: overrides.type || "quote",
      notes: overrides.notes,
      items: overrides.items || [
        { description: "Roof inspection", quantity: 1, unit_price: 150 }
      ]
    });

  return res.body.id;

};

// Minimal CSV row parser good enough for these tests - splits on commas
// outside of quoted fields and unescapes doubled quotes. Doesn't need to
// handle embedded newlines since none of these fixtures span multiple
// physical lines once quoted.
const parseCsvLine = (line) => {

  const fields = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {

    const char = line[i];

    if (inQuotes) {

      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }

    } else if (char === '"') {

      inQuotes = true;

    } else if (char === ",") {

      fields.push(current);
      current = "";

    } else {

      current += char;

    }

  }

  fields.push(current);

  return fields;

};

const parseCsv = (text) => {

  const lines = text.split("\r\n").filter((line) => line.length > 0);

  return lines.map(parseCsvLine);

};


describe("Quotes CSV export", () => {

  test("returns valid CSV with a header row and a data row per quote", async () => {

    const { authHeader } = await createBusinessAndUser(app, "CsvBasic");
    const customerId = await createCustomer(authHeader, "Basic Customer", "basic@example.com");

    await createQuote(authHeader, customerId, {
      items: [{ description: "Roof inspection", quantity: 1, unit_price: 150 }]
    });

    const res = await request(app)
      .get("/api/quotes/export.csv")
      .set("Authorization", authHeader);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/csv/);
    expect(res.headers["content-disposition"]).toMatch(/attachment; filename="/);

    const rows = parseCsv(res.text);

    expect(rows[0]).toEqual([
      "Type",
      "Status",
      "Customer Name",
      "Customer Email",
      "Items",
      "Total",
      "Job Costs",
      "Margin",
      "Created Date",
      "Paid Date"
    ]);

    expect(rows.length).toBe(2);
    expect(rows[1][0]).toBe("quote");
    expect(rows[1][1]).toBe("draft");
    expect(rows[1][2]).toBe("Basic Customer");
    expect(rows[1][3]).toBe("basic@example.com");
    expect(rows[1][5]).toBe("150.00");
    // No expenses logged - Job Costs is 0.00 and Margin equals the total.
    expect(rows[1][6]).toBe("0.00");
    expect(rows[1][7]).toBe("150.00");

  });


  test("Job Costs and Margin reflect real logged expenses", async () => {

    const { authHeader } = await createBusinessAndUser(app, "CsvJobCosts");
    const customerId = await createCustomer(authHeader, "Job Cost Customer", "jobcost@example.com");

    const quoteId = await createQuote(authHeader, customerId, {
      items: [{ description: "Roof job", quantity: 1, unit_price: 1000 }]
    });

    await request(app)
      .post(`/api/quotes/${quoteId}/expenses`)
      .set("Authorization", authHeader)
      .send({ description: "Materials", amount: 300 });

    const res = await request(app)
      .get("/api/quotes/export.csv")
      .set("Authorization", authHeader);

    const rows = parseCsv(res.text);

    expect(rows[1][5]).toBe("1000.00");
    expect(rows[1][6]).toBe("300.00");
    expect(rows[1][7]).toBe("700.00");

  });


  test("a customer name containing a comma is quoted and survives round-trip parsing", async () => {

    const { authHeader } = await createBusinessAndUser(app, "CsvComma");
    const customerId = await createCustomer(authHeader, "Smith, John", "john@example.com");

    await createQuote(authHeader, customerId);

    const res = await request(app)
      .get("/api/quotes/export.csv")
      .set("Authorization", authHeader);

    expect(res.status).toBe(200);

    // The raw text must quote the comma-containing field - otherwise it
    // would silently split into an extra column.
    expect(res.text).toContain('"Smith, John"');

    const rows = parseCsv(res.text);

    expect(rows[1][2]).toBe("Smith, John");

  });


  test("a value containing a double-quote is escaped by doubling it", async () => {

    const { authHeader } = await createBusinessAndUser(app, "CsvQuote");
    const customerId = await createCustomer(authHeader, `The "Roofer" LLC`, "roofer@example.com");

    await createQuote(authHeader, customerId, {
      items: [{ description: `36" ridge cap`, quantity: 2, unit_price: 20 }]
    });

    const res = await request(app)
      .get("/api/quotes/export.csv")
      .set("Authorization", authHeader);

    expect(res.status).toBe(200);
    expect(res.text).toContain('"The ""Roofer"" LLC"');

    const rows = parseCsv(res.text);

    expect(rows[1][2]).toBe(`The "Roofer" LLC`);
    expect(rows[1][4]).toContain(`36" ridge cap`);

  });


  test("a customer name that looks like a spreadsheet formula is neutralized, not exported as-is", async () => {

    const { authHeader } = await createBusinessAndUser(app, "CsvFormulaInjection");
    const customerId = await createCustomer(
      authHeader,
      `=HYPERLINK("http://evil.example","Click")`,
      "formula@example.com"
    );

    await createQuote(authHeader, customerId);

    const res = await request(app)
      .get("/api/quotes/export.csv")
      .set("Authorization", authHeader);

    expect(res.status).toBe(200);

    const rows = parseCsv(res.text);

    // A leading ' forces spreadsheet apps to treat the cell as plain text
    // instead of evaluating it as a formula - the standard CSV-injection
    // mitigation (CWE-1236). The raw stored/returned value is still
    // recognizably the original name (with the guard prefix), it's just
    // no longer formula-shaped.
    expect(rows[1][2]).toBe(`'=HYPERLINK("http://evil.example","Click")`);
    expect(rows[1][2].startsWith("=")).toBe(false);

  });


  test("export is scoped to the authenticated business and never leaks another business's data", async () => {

    const bizA = await createBusinessAndUser(app, "CsvScopeA");
    const bizB = await createBusinessAndUser(app, "CsvScopeB");

    const customerA = await createCustomer(bizA.authHeader, "Customer A", "a@example.com");
    const customerB = await createCustomer(bizB.authHeader, "Customer B", "b@example.com");

    await createQuote(bizA.authHeader, customerA);
    await createQuote(bizB.authHeader, customerB);

    const resA = await request(app)
      .get("/api/quotes/export.csv")
      .set("Authorization", bizA.authHeader);

    const rowsA = parseCsv(resA.text);

    expect(rowsA.length).toBe(2);
    expect(resA.text).toContain("Customer A");
    expect(resA.text).not.toContain("Customer B");

    const resB = await request(app)
      .get("/api/quotes/export.csv")
      .set("Authorization", bizB.authHeader);

    const rowsB = parseCsv(resB.text);

    expect(rowsB.length).toBe(2);
    expect(resB.text).toContain("Customer B");
    expect(resB.text).not.toContain("Customer A");

  });


  test("an unauthenticated request is rejected", async () => {

    const res = await request(app).get("/api/quotes/export.csv");

    expect(res.status).toBe(401);

  });


  test("filtering by type=invoice only returns invoices", async () => {

    const { authHeader } = await createBusinessAndUser(app, "CsvTypeFilter");
    const customerId = await createCustomer(authHeader, "Filter Customer", "filter@example.com");

    await createQuote(authHeader, customerId, { type: "quote" });
    await createQuote(authHeader, customerId, { type: "invoice" });

    const res = await request(app)
      .get("/api/quotes/export.csv?type=invoice")
      .set("Authorization", authHeader);

    expect(res.status).toBe(200);

    const rows = parseCsv(res.text);

    expect(rows.length).toBe(2);
    expect(rows[1][0]).toBe("invoice");

  });


  test("filtering by status=paid only returns paid quotes", async () => {

    const { authHeader } = await createBusinessAndUser(app, "CsvStatusFilter");
    const customerId = await createCustomer(authHeader, "Status Customer", "status@example.com");

    const draftId = await createQuote(authHeader, customerId);
    const paidId = await createQuote(authHeader, customerId);

    await request(app)
      .patch(`/api/quotes/${paidId}`)
      .set("Authorization", authHeader)
      .send({ status: "paid" });

    const res = await request(app)
      .get("/api/quotes/export.csv?status=paid")
      .set("Authorization", authHeader);

    expect(res.status).toBe(200);

    const rows = parseCsv(res.text);

    expect(rows.length).toBe(2);
    expect(rows[1][1]).toBe("paid");
    expect(rows[1][9]).not.toBe("");

    void draftId;

  });


  test("an invalid type or status filter is rejected with 400", async () => {

    const { authHeader } = await createBusinessAndUser(app, "CsvBadFilter");

    const badType = await request(app)
      .get("/api/quotes/export.csv?type=nonsense")
      .set("Authorization", authHeader);

    expect(badType.status).toBe(400);

    const badStatus = await request(app)
      .get("/api/quotes/export.csv?status=nonsense")
      .set("Authorization", authHeader);

    expect(badStatus.status).toBe(400);

  });

});
