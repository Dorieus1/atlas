const db = require("../../database/db");


const RESULTS_PER_TYPE = 5;


const allAsync = (sql, params = []) => {

  return new Promise((resolve, reject) => {

    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));

  });

};


function likeParam(query) {
  return `%${query}%`;
}


// Runs one search per entity type in parallel and shapes each into a
// common {type, id, title, subtitle} result the frontend can render and
// link to without knowing anything entity-specific. Every query is
// business_id-scoped, matching the isolation rule everywhere else in
// the app - search can never surface another business's data.
const search = async (business_id, query) => {

  const like = likeParam(query);

  const [customers, leads, appointments, quotes, knowledge, notes] = await Promise.all([

    allAsync(

      `
      SELECT id, name, email, phone
      FROM customers
      WHERE business_id = ?
      AND deleted_at IS NULL
      AND (name LIKE ? OR email LIKE ? OR phone LIKE ?)
      ORDER BY created_at DESC
      LIMIT ${RESULTS_PER_TYPE}
      `,

      [business_id, like, like, like]

    ),

    allAsync(

      `
      SELECT id, customer_id, name, phone, email, interest, status
      FROM leads
      WHERE business_id = ?
      AND (name LIKE ? OR phone LIKE ? OR email LIKE ? OR interest LIKE ?)
      ORDER BY created_at DESC
      LIMIT ${RESULTS_PER_TYPE}
      `,

      [business_id, like, like, like, like]

    ),

    allAsync(

      `
      SELECT
        appointments.id,
        appointments.title,
        appointments.start_time,
        appointments.status,
        customers.name AS customer_name
      FROM appointments
      LEFT JOIN customers ON customers.id = appointments.customer_id
      WHERE appointments.business_id = ?
      AND (appointments.title LIKE ? OR customers.name LIKE ?)
      ORDER BY appointments.start_time DESC
      LIMIT ${RESULTS_PER_TYPE}
      `,

      [business_id, like, like]

    ),

    allAsync(

      `
      SELECT
        quotes.id,
        quotes.type,
        quotes.status,
        customers.name AS customer_name
      FROM quotes
      LEFT JOIN customers ON customers.id = quotes.customer_id
      WHERE quotes.business_id = ?
      AND customers.name LIKE ?
      ORDER BY quotes.created_at DESC
      LIMIT ${RESULTS_PER_TYPE}
      `,

      [business_id, like]

    ),

    allAsync(

      `
      SELECT id, title, content
      FROM knowledge
      WHERE business_id = ?
      AND (title LIKE ? OR content LIKE ?)
      ORDER BY created_at DESC
      LIMIT ${RESULTS_PER_TYPE}
      `,

      [business_id, like, like]

    ),

    // notes has no business_id of its own - scoped through the same
    // customers join (and the same deleted_at IS NULL exclusion) the
    // customers search above uses, so a note never leaks across
    // businesses or surfaces a trashed customer's note.
    allAsync(

      `
      SELECT notes.id, notes.customer_id, notes.note, customers.name AS customer_name
      FROM notes
      JOIN customers ON customers.id = notes.customer_id
      WHERE customers.business_id = ?
      AND customers.deleted_at IS NULL
      AND notes.note LIKE ?
      ORDER BY notes.created_at DESC
      LIMIT ${RESULTS_PER_TYPE}
      `,

      [business_id, like]

    )

  ]);

  return {

    customers: customers.map((c) => ({
      type: "customer",
      id: c.id,
      title: c.name || "Unnamed customer",
      subtitle: [c.email, c.phone].filter(Boolean).join(" · ")
    })),

    leads: leads.map((l) => ({
      type: "lead",
      id: l.id,
      customerId: l.customer_id,
      title: l.name || "Unnamed lead",
      subtitle: l.interest || `${l.status} lead`
    })),

    appointments: appointments.map((a) => ({
      type: "appointment",
      id: a.id,
      title: a.title,
      subtitle: [a.customer_name, new Date(a.start_time).toLocaleDateString()].filter(Boolean).join(" · "),
      startTime: a.start_time
    })),

    quotes: quotes.map((q) => ({
      type: "quote",
      id: q.id,
      title: `${q.type === "invoice" ? "Invoice" : "Quote"} for ${q.customer_name || "customer"}`,
      subtitle: q.status
    })),

    knowledge: knowledge.map((k) => ({
      type: "knowledge",
      id: k.id,
      title: k.title,
      subtitle: k.content
    })),

    notes: notes.map((n) => ({
      type: "note",
      id: n.id,
      customerId: n.customer_id,
      title: n.customer_name || "Unnamed customer",
      subtitle: n.note
    }))

  };

};


module.exports = {
  search
};
