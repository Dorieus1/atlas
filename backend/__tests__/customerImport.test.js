const request = require("supertest");
const app = require("../server");
const { createBusinessAndUser } = require("./setup/helpers");

const getCustomers = async (authHeader) => {

  const res = await request(app)
    .get("/api/customers")
    .set("Authorization", authHeader);

  return res.body;

};

const importCsv = (authHeader, csvText, filename = "customers.csv") =>

  request(app)
    .post("/api/customers/import")
    .set("Authorization", authHeader)
    .attach("file", Buffer.from(csvText), filename);


describe("Customer CSV import", () => {

  test("a well-formed CSV with name/email/phone columns creates customers, attributed to the importing user", async () => {

    const { authHeader } = await createBusinessAndUser(app, "ImportBasic");

    const csv =
      "name,email,phone\n" +
      "Alice Anderson,alice@example.com,555-1000\n" +
      "Bob Brown,bob@example.com,555-2000\n";

    const res = await importCsv(authHeader, csv);

    expect(res.status).toBe(200);
    expect(res.body.total_rows).toBe(2);
    expect(res.body.created).toBe(2);
    expect(res.body.skipped_duplicates).toEqual([]);
    expect(res.body.skipped_missing_name).toEqual([]);

    const customers = await getCustomers(authHeader);

    expect(customers.length).toBe(2);

    const alice = customers.find((c) => c.email === "alice@example.com");

    expect(alice).toBeDefined();
    expect(alice.name).toBe("Alice Anderson");
    expect(alice.phone).toBe("555-1000");
    expect(alice.created_by_name).toBe("Test Owner");
    expect(alice.created_by_user_id).toBeTruthy();

  });


  test("column header matching works with a reasonable variation (Full Name)", async () => {

    const { authHeader } = await createBusinessAndUser(app, "ImportHeaderAlias");

    const csv =
      "Full Name,Email Address,Mobile\n" +
      "Carol Carter,carol@example.com,555-3000\n";

    const res = await importCsv(authHeader, csv);

    expect(res.status).toBe(200);
    expect(res.body.created).toBe(1);

    const customers = await getCustomers(authHeader);

    expect(customers[0].name).toBe("Carol Carter");
    expect(customers[0].email).toBe("carol@example.com");
    expect(customers[0].phone).toBe("555-3000");

  });


  test("a row missing a name is skipped and reported, without crashing the whole import", async () => {

    const { authHeader } = await createBusinessAndUser(app, "ImportMissingName");

    const csv =
      "name,email\n" +
      "Dana Diaz,dana@example.com\n" +
      ",noname@example.com\n" +
      "Evan Evers,evan@example.com\n";

    const res = await importCsv(authHeader, csv);

    expect(res.status).toBe(200);
    expect(res.body.total_rows).toBe(3);
    expect(res.body.created).toBe(2);
    expect(res.body.skipped_missing_name).toEqual([{ row: 3 }]);

    const customers = await getCustomers(authHeader);

    expect(customers.length).toBe(2);
    expect(customers.some((c) => c.email === "noname@example.com")).toBe(false);

  });


  test("a row whose email matches an existing customer is skipped as a duplicate, not creating a second customer", async () => {

    const { authHeader } = await createBusinessAndUser(app, "ImportDup");

    await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader)
      .send({ name: "Existing Customer", email: "existing@example.com" });

    const csv =
      "name,email\n" +
      "Existing Customer Renamed,EXISTING@example.com\n" +
      "New Customer,new@example.com\n";

    const res = await importCsv(authHeader, csv);

    expect(res.status).toBe(200);
    expect(res.body.total_rows).toBe(2);
    expect(res.body.created).toBe(1);
    expect(res.body.skipped_duplicates).toEqual([
      { row: 2, name: "Existing Customer Renamed", email: "EXISTING@example.com" }
    ]);

    const customers = await getCustomers(authHeader);

    // Still just one customer with that email (case-insensitive), plus the
    // one new customer - not a second "Existing Customer Renamed" row.
    expect(customers.length).toBe(2);

    const existingMatches = customers.filter(
      (c) => (c.email || "").toLowerCase() === "existing@example.com"
    );

    expect(existingMatches.length).toBe(1);
    expect(existingMatches[0].name).toBe("Existing Customer");

  });


  test("a CSV with no recognizable name column is rejected up front", async () => {

    const { authHeader } = await createBusinessAndUser(app, "ImportNoNameCol");

    const csv =
      "email,phone\n" +
      "nobody@example.com,555-9999\n";

    const res = await importCsv(authHeader, csv);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name column/i);

    const customers = await getCustomers(authHeader);

    expect(customers.length).toBe(0);

  });


  test("a file exceeding the row cap is rejected", async () => {

    const { authHeader } = await createBusinessAndUser(app, "ImportRowCap");

    const rows = [];

    for (let i = 0; i < 1001; i++) {
      rows.push(`Customer ${i},customer${i}@example.com`);
    }

    const csv = "name,email\n" + rows.join("\n") + "\n";

    const res = await importCsv(authHeader, csv);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/too many rows/i);

    const customers = await getCustomers(authHeader);

    expect(customers.length).toBe(0);

  });


  test("an unauthenticated request is rejected", async () => {

    const csv = "name,email\nNo Auth,noauth@example.com\n";

    const res = await request(app)
      .post("/api/customers/import")
      .attach("file", Buffer.from(csv), "customers.csv");

    expect(res.status).toBe(401);

  });


  test("importing customers is scoped to the authenticated business and never leaks another business's customers", async () => {

    const bizA = await createBusinessAndUser(app, "ImportScopeA");
    const bizB = await createBusinessAndUser(app, "ImportScopeB");

    const csvA = "name,email\nCustomer A,a@example.com\n";
    const csvB = "name,email\nCustomer B,b@example.com\n";

    const resA = await importCsv(bizA.authHeader, csvA);
    const resB = await importCsv(bizB.authHeader, csvB);

    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);

    const customersA = await getCustomers(bizA.authHeader);
    const customersB = await getCustomers(bizB.authHeader);

    expect(customersA.length).toBe(1);
    expect(customersA[0].name).toBe("Customer A");

    expect(customersB.length).toBe(1);
    expect(customersB[0].name).toBe("Customer B");

  });


  test("a CSV field containing a comma or quote inside a quoted value parses correctly", async () => {

    const { authHeader } = await createBusinessAndUser(app, "ImportQuoted");

    const csv =
      "name,email,phone\n" +
      "\"Smith, John\",john@example.com,555-1111\n" +
      "\"The \"\"Roofer\"\" LLC\",roofer@example.com,555-2222\n";

    const res = await importCsv(authHeader, csv);

    expect(res.status).toBe(200);
    expect(res.body.created).toBe(2);

    const customers = await getCustomers(authHeader);

    expect(customers.some((c) => c.name === "Smith, John")).toBe(true);
    expect(customers.some((c) => c.name === `The "Roofer" LLC`)).toBe(true);

  });

});
