const db = require("../../database/db");
const OpenAI = require("openai");
const { getAnalytics } = require("./analyticsService");
const { findDormantCustomers } = require("./winBackService");


const client = new OpenAI({

  apiKey: process.env.OPENAI_API_KEY

});


const getAsync = (sql, params = []) => {

  return new Promise((resolve, reject) => {

    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));

  });

};


// A read-only, pre-aggregated bundle of the same numbers already shown
// elsewhere in the app (Analytics, Dashboard, the win-back job) - never
// raw rows, and never a database query built from the owner's own free-
// text question. The model only ever sees numbers that were already
// computed by trusted app code, so there's no way for a question to make
// it "look up" something it shouldn't, or to inject anything into a SQL
// query - it can only talk about what's in this snapshot.
const gatherBusinessSnapshot = async (business_id) => {

  const analytics = await getAnalytics(business_id);

  const now = new Date();

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [appointmentsToday, appointmentsThisWeek, pendingTasks, dormantCustomers] = await Promise.all([

    getAsync(

      `
      SELECT COUNT(*) as count FROM appointments
      WHERE business_id = ? AND start_time BETWEEN ? AND ? AND status != 'cancelled'
      `,

      [business_id, todayStart.toISOString(), todayEnd.toISOString()]

    ),

    getAsync(

      `
      SELECT COUNT(*) as count FROM appointments
      WHERE business_id = ? AND start_time BETWEEN ? AND ? AND status != 'cancelled'
      `,

      [business_id, now.toISOString(), weekEnd.toISOString()]

    ),

    getAsync(

      `SELECT COUNT(*) as count FROM tasks WHERE business_id = ? AND status = 'pending'`,

      [business_id]

    ),

    findDormantCustomers()

  ]);

  return {

    customers: analytics.customers,
    totalLeads: analytics.leads,
    hotLeads: analytics.hotLeads,
    leadsByStage: analytics.leadsByStatus,

    revenueCollected: analytics.revenuePaid,
    revenueOutstanding: analytics.revenueOutstanding,
    paidInvoiceCount: analytics.paidInvoiceCount,
    outstandingInvoiceCount: analytics.outstandingInvoiceCount,
    revenueLastSixMonths: analytics.revenueByMonth,

    appointmentsToday: appointmentsToday.count,
    appointmentsThisWeek: appointmentsThisWeek.count,
    pendingTasks: pendingTasks.count,

    // findDormantCustomers() is deliberately cross-tenant (same job it
    // powers), so it's filtered down to just this business here.
    dormantCustomers: dormantCustomers.filter((c) => c.business_id === business_id).length

  };

};


const askAssistant = async (business_id, question) => {

  const snapshot = await gatherBusinessSnapshot(business_id);

  const prompt = `

You are Atlas, an assistant built into a small business's CRM, answering
a question the business owner just typed.

Answer using ONLY the real business data provided below. Never invent,
assume, or estimate a number that isn't directly present in this data.
If the data doesn't contain enough information to actually answer the
question, say so plainly instead of guessing at an answer.

Write in plain, professional, friendly prose - a sentence or two is
usually enough, this isn't a report. Never mention database fields,
ids, or technical terms.

BUSINESS DATA:
${JSON.stringify(snapshot)}

OWNER'S QUESTION:
${question}

`;

  const response = await client.responses.create({

    model: "gpt-5-mini",

    input: prompt

  });

  return response.output_text;

};


module.exports = {
  askAssistant,
  gatherBusinessSnapshot
};
