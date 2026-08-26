const request = require("supertest");
const app = require("../server");
const { createBusinessAndUser } = require("./setup/helpers");


const getKnowledge = async (authHeader, business_id) => {

  const res = await request(app)
    .get(`/api/knowledge/${business_id}`)
    .set("Authorization", authHeader);

  return res.body;

};

const importCsv = (authHeader, csvText, filename = "knowledge.csv") =>

  request(app)
    .post("/api/knowledge/import")
    .set("Authorization", authHeader)
    .attach("file", Buffer.from(csvText), filename);


describe("Knowledge base CSV import", () => {

  test("a well-formed CSV with title/content/category columns creates entries", async () => {

    const { authHeader, business_id } = await createBusinessAndUser(app, "KBImportBasic");

    const csv =
      "title,content,category\n" +
      "Business hours,9am-5pm Monday-Friday,Hours & Location\n" +
      "Warranty,10 years on all roofing work,Policies\n";

    const res = await importCsv(authHeader, csv);

    expect(res.status).toBe(200);
    expect(res.body.total_rows).toBe(2);
    expect(res.body.created).toBe(2);
    expect(res.body.skipped_missing_fields).toEqual([]);
    expect(res.body.skipped_too_long).toEqual([]);

    const entries = await getKnowledge(authHeader, business_id);

    expect(entries.length).toBe(2);

    const hours = entries.find((e) => e.title === "Business hours");

    expect(hours.content).toBe("9am-5pm Monday-Friday");
    expect(hours.category).toBe("Hours & Location");

  });


  test("column header matching works with reasonable variations (Question/Answer)", async () => {

    const { authHeader, business_id } = await createBusinessAndUser(app, "KBImportAlias");

    const csv =
      "Question,Answer\n" +
      "Do you offer free estimates?,Yes always free.\n";

    const res = await importCsv(authHeader, csv);

    expect(res.status).toBe(200);
    expect(res.body.created).toBe(1);

    const entries = await getKnowledge(authHeader, business_id);

    expect(entries[0].title).toBe("Do you offer free estimates?");
    expect(entries[0].content).toBe("Yes always free.");
    expect(entries[0].category).toBeNull();

  });


  test("a row missing title or content is skipped and reported, without crashing the whole import", async () => {

    const { authHeader, business_id } = await createBusinessAndUser(app, "KBImportMissing");

    const csv =
      "title,content\n" +
      "Good Row,Has both fields\n" +
      ",Missing a title\n" +
      "Missing content,\n";

    const res = await importCsv(authHeader, csv);

    expect(res.status).toBe(200);
    expect(res.body.total_rows).toBe(3);
    expect(res.body.created).toBe(1);
    expect(res.body.skipped_missing_fields).toEqual([{ row: 3 }, { row: 4 }]);

    const entries = await getKnowledge(authHeader, business_id);

    expect(entries.length).toBe(1);
    expect(entries[0].title).toBe("Good Row");

  });


  test("a row with an oversized title or content is skipped and reported", async () => {

    const { authHeader, business_id } = await createBusinessAndUser(app, "KBImportTooLong");

    const hugeContent = "x".repeat(5001);

    const csv =
      "title,content\n" +
      `Too Long,${hugeContent}\n` +
      "Fine,Normal length content\n";

    const res = await importCsv(authHeader, csv);

    expect(res.status).toBe(200);
    expect(res.body.created).toBe(1);
    expect(res.body.skipped_too_long).toEqual([{ row: 2, field: "content" }]);

    const entries = await getKnowledge(authHeader, business_id);

    expect(entries.length).toBe(1);
    expect(entries[0].title).toBe("Fine");

  });


  test("a CSV with no recognizable title/content columns is rejected", async () => {

    const { authHeader } = await createBusinessAndUser(app, "KBImportNoColumns");

    const csv =
      "foo,bar\n" +
      "a,b\n";

    const res = await importCsv(authHeader, csv);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/title and content column/i);

  });


  test("an empty CSV is rejected", async () => {

    const { authHeader } = await createBusinessAndUser(app, "KBImportEmpty");

    const res = await importCsv(authHeader, "");

    expect(res.status).toBe(400);

  });


  test("importing is scoped to the right business", async () => {

    const bizA = await createBusinessAndUser(app, "KBImportIsoA");
    const bizB = await createBusinessAndUser(app, "KBImportIsoB");

    const csv =
      "title,content\n" +
      "A's Entry,Only for business A\n";

    await importCsv(bizA.authHeader, csv);

    const bEntries = await getKnowledge(bizB.authHeader, bizB.business_id);

    expect(bEntries.length).toBe(0);

  });

});
