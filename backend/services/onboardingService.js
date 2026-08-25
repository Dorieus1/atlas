const db = require("../../database/db");


const countAsync = (sql, params) => {

  return new Promise((resolve, reject) => {

    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row.count)));

  });

};



const getOnboardingStatus = async (business_id) => {

  const [hasCustomer, hasKnowledge, hasConversation, business] = await Promise.all([

    countAsync(
      `SELECT COUNT(*) AS count FROM customers WHERE business_id = ? AND deleted_at IS NULL`,
      [business_id]
    ),

    countAsync(
      `SELECT COUNT(*) AS count FROM knowledge WHERE business_id = ?`,
      [business_id]
    ),

    countAsync(
      `
      SELECT COUNT(*) AS count
      FROM conversations
      WHERE customer_id IN (SELECT id FROM customers WHERE business_id = ? AND deleted_at IS NULL)
      `,
      [business_id]
    ),

    new Promise((resolve, reject) => {

      db.get(
        `SELECT review_link, onboarding_dismissed FROM businesses WHERE id = ?`,
        [business_id],
        (err, row) => (err ? reject(err) : resolve(row))
      );

    })

  ]);

  return {

    has_customer: hasCustomer > 0,
    has_knowledge: hasKnowledge > 0,
    has_review_link: !!(business && business.review_link),
    has_conversation: hasConversation > 0,
    dismissed: !!(business && business.onboarding_dismissed)

  };

};



const dismissOnboarding = (business_id) => {

  return new Promise((resolve, reject) => {

    db.run(

      `UPDATE businesses SET onboarding_dismissed = 1 WHERE id = ?`,

      [business_id],

      function (err) {

        if (err) {
          reject(err);
        } else {
          resolve(this.changes > 0);
        }

      }

    );

  });

};



module.exports = {

  getOnboardingStatus,

  dismissOnboarding

};
