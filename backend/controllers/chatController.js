const { processChatMessage } = require("../services/chatService");
const { getCustomerById } = require("../services/customerService");
const { getBusinessById } = require("../services/businessService");


const chatResponse = async (req, res) => {

  try {

    const { customer_id, message } = req.body;
    const business_id = req.user.business_id;

    if (!customer_id || !message) {

      return res.status(400).json({
        error: "customer_id and message are required"
      });

    }

    if (message.length > 4000) {

      return res.status(400).json({
        error: "Message is too long"
      });

    }

    const customer = await getCustomerById(customer_id, business_id);

    if (!customer) {

      return res.status(404).json({
        error: "Customer not found"
      });

    }

    const business = await getBusinessById(business_id);

    try {

      // Always preview here - this endpoint is the internal, authenticated
      // "test what Atlas would say" tool used from inside the CRM
      // (ChatWindow.jsx), never the real customer. See processChatMessage's
      // own comment for exactly what preview mode does and doesn't do.
      const result = await processChatMessage(customer, business, message, { preview: true });

      res.json(result);

    } catch (aiError) {

      console.error(aiError);

      res.status(500).json({
        error: "AI response failed"
      });

    }

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "AI response failed"
    });

  }

};


module.exports = {
  chatResponse
};
