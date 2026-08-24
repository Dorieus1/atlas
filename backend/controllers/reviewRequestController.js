const {
  sendReviewRequestForCustomer,
  getReviewRequestsByCustomer: getReviewRequestsByCustomerService
} = require("../services/reviewRequestService");

const { getCustomerById } = require("../services/customerService");
const { getBusinessById } = require("../services/businessService");


const REASON_MESSAGES = {
  no_email: "This customer doesn't have an email on file",
  no_review_link: "Add your review link in Settings before sending review requests"
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

    const business = await getBusinessById(business_id);

    let result;

    try {

      result = await sendReviewRequestForCustomer(business, customer);

    } catch (emailError) {

      console.error("REVIEW REQUEST EMAIL ERROR:", emailError);

      return res.status(502).json({
        error: "Couldn't send that email right now. Please try again."
      });

    }

    if (!result.sent) {

      return res.status(400).json({
        error: REASON_MESSAGES[result.reason] || "Couldn't send that review request"
      });

    }

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
