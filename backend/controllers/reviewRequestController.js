const db = require("../../database/db");

const {
  createReviewRequest: createReviewRequestService,
  getReviewRequestsByCustomer: getReviewRequestsByCustomerService
} = require("../services/reviewRequestService");

const { getCustomerById } = require("../services/customerService");
const { sendEmail } = require("../services/emailService");


const getBusinessById = (id) => {

  return new Promise((resolve, reject) => {

    db.get(

      `SELECT * FROM businesses WHERE id = ?`,

      [id],

      (err, row) => (err ? reject(err) : resolve(row))

    );

  });

};



const sendReviewRequest = async (req, res) => {

  try {

    const { customer_id } = req.body;
    const business_id = req.user.business_id;

    if (!customer_id) {

      return res.status(400).json({
        error: "customer_id is required"
      });

    }

    const customer = await getCustomerById(customer_id, business_id);

    if (!customer) {

      return res.status(404).json({
        error: "Customer not found"
      });

    }

    if (!customer.email) {

      return res.status(400).json({
        error: "This customer doesn't have an email on file"
      });

    }

    const business = await getBusinessById(business_id);

    if (!business || !business.review_link) {

      return res.status(400).json({
        error: "Add your review link in Settings before sending review requests"
      });

    }

    try {

      await sendEmail({

        to: customer.email,

        subject: `How did we do, ${customer.name || "there"}?`,

        html: `
          <p>Hi ${customer.name || "there"},</p>
          <p>Thanks for choosing ${business.name}! If you have a minute, we'd really appreciate a quick review.</p>
          <p><a href="${business.review_link}">Leave us a review</a></p>
          <p>Thank you for your support!</p>
        `

      });

    } catch (emailError) {

      console.error("REVIEW REQUEST EMAIL ERROR:", emailError);

      return res.status(502).json({
        error: "Couldn't send that email right now. Please try again."
      });

    }

    await createReviewRequestService(business_id, customer_id, customer.email);

    res.status(201).json({
      message: "Review request sent"
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
    });

  }

};



const getCustomerReviewRequests = async (req, res) => {

  try {

    const { customer_id } = req.params;
    const business_id = req.user.business_id;

    const customer = await getCustomerById(customer_id, business_id);

    if (!customer) {

      return res.status(404).json({
        error: "Customer not found"
      });

    }

    const requests = await getReviewRequestsByCustomerService(customer_id, business_id);

    res.json(requests);

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
    });

  }

};



module.exports = {

  sendReviewRequest,

  getCustomerReviewRequests

};
