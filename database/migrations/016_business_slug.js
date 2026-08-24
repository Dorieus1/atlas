const { run } = require("./util");

const slugify = (name) => {

  return String(name)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "business";

};

module.exports = async (db) => {

  await run(db, `ALTER TABLE businesses ADD COLUMN slug TEXT`);

  const businesses = await new Promise((resolve, reject) => {

    db.all(
      `SELECT id, name FROM businesses WHERE slug IS NULL`,
      (err, rows) => (err ? reject(err) : resolve(rows))
    );

  });

  const existingSlugs = await new Promise((resolve, reject) => {

    db.all(
      `SELECT slug FROM businesses WHERE slug IS NOT NULL`,
      (err, rows) => (err ? reject(err) : resolve(new Set(rows.map((r) => r.slug))))
    );

  });

  for (const business of businesses) {

    const base = slugify(business.name);

    let candidate = base;
    let suffix = 1;

    while (existingSlugs.has(candidate)) {
      suffix += 1;
      candidate = `${base}-${suffix}`;
    }

    existingSlugs.add(candidate);

    await run(db, `UPDATE businesses SET slug = ? WHERE id = ?`, [candidate, business.id]);

  }

  await run(db, `CREATE UNIQUE INDEX IF NOT EXISTS idx_businesses_slug ON businesses(slug)`);

};
