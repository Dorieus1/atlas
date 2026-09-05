const db = require("../../database/db");
const { v4: uuidv4 } = require("uuid");



const saveConversation = (
  customer_id,
  message,
  response
) => {

  return new Promise((resolve, reject) => {

    const id = uuidv4();


    db.run(

      `
      INSERT INTO conversations
      (
        id,
        customer_id,
        message,
        response
      )
      VALUES (?, ?, ?, ?)
      `,

      [
        id,
        customer_id,
        message,
        response
      ],


      function(err) {

        if (err) {

          reject(err);

        } else {

          resolve(id);

        }

      }

    );


  });

};





// limit is optional - the two callers that show a customer their own
// full history (the internal "Test Atlas" panel's real reference view,
// and the customer's own portal) still want everything, unbounded. Only
// chatService.js's own call passes one, and only because a review
// caught that it was fetching a customer's ENTIRE conversation on every
// single new message just to immediately throw away all but the last
// few turns in JS (aiService.js's MAX_HISTORY_TURNS) - for a customer
// who's been chatting with the same business for months, that's a
// growing amount of wasted work on every message.
//
// Ordered by `created_at, rowid` (not created_at alone) - created_at is
// whole-SECOND precision, and a customer sending several messages
// within the same second (a fast typist, a couple of quick copy-pasted
// replies) is a real, ordinary case here, not an edge case. rowid is
// SQLite's own hidden, monotonically-increasing insertion-order column
// (present because `conversations.id` is a TEXT, not INTEGER, primary
// key) - the same kind of real tiebreaker already used elsewhere in
// this app for the same whole-second-precision issue (see customer
// statements' quote_number tiebreaker). The capped case can't just ASC-
// order-then-LIMIT (that would grab the OLDEST rows, backwards from
// what's wanted) or wrap a DESC+LIMIT query in an outer re-sort (tried
// that - confirmed live that SQLite doesn't expose a derived table's
// rowid to anything selecting FROM it) - so it fetches most-recent-
// first with a real tiebreaker, then flips the small result back to
// oldest-first in JS, which every caller expects.
const getConversationHistory = (
  customer_id,
  limit = null
) => {

  return new Promise((resolve, reject) => {

    // rowid can't be referenced from an outer query wrapping this one
    // in a subquery (confirmed live - SQLite doesn't expose a derived
    // table's rowid to anything selecting FROM it) - so the capped case
    // does the real work as ONE query (most-recent-first, real
    // tiebreaker included) and flips it back to oldest-first in JS
    // instead, rather than a second ORDER BY that can't see rowid at all.
    const sql = limit
      ? `
        SELECT *
        FROM conversations
        WHERE customer_id = ?
        ORDER BY created_at DESC, rowid DESC
        LIMIT ?
        `
      : `
        SELECT *
        FROM conversations
        WHERE customer_id = ?
        ORDER BY created_at ASC, rowid ASC
        `;

    const params = limit ? [customer_id, limit] : [customer_id];

    db.all(

      sql,

      params,


      (err, rows) => {


        if (err) {

          reject(err);

        } else if (limit) {

          resolve(rows.reverse());

        } else {

          resolve(rows);

        }

      }

    );


  });

};





const getAllConversations = () => {

  return new Promise((resolve, reject) => {


    db.all(

      `
      SELECT *
      FROM conversations
      ORDER BY created_at DESC
      `,

      [],


      (err, rows) => {


        if (err) {

          reject(err);

        } else {

          resolve(rows);

        }

      }

    );


  });

};





module.exports = {

  saveConversation,

  getConversationHistory,

  getAllConversations

};