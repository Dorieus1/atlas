const { getBusinessBySlug } = require("../services/businessService");
const { createCustomer, getCustomerById } = require("../services/customerService");
const { getConversationHistory } = require("../services/conversationService");
const { processChatMessage } = require("../services/chatService");
const { createNotification } = require("../services/notificationService");


const MAX_NAME_LENGTH = 200;
const MAX_MESSAGE_LENGTH = 4000;


const getBusinessBySlugHandler = async (req, res) => {

  try {

    const business = await getBusinessBySlug(req.params.slug);

    if (!business) {

      return res.status(404).json({
        error: "We couldn't find that business"
      });

    }

    res.json({
      name: business.name
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
    });

  }

};



const startConversation = async (req, res) => {

  try {

    const { name, email, phone } = req.body;

    if (!name || !name.trim()) {

      return res.status(400).json({
        error: "Please tell us your name"
      });

    }

    if (name.length > MAX_NAME_LENGTH) {

      return res.status(400).json({
        error: "Name is too long"
      });

    }

    const business = await getBusinessBySlug(req.params.slug);

    if (!business) {

      return res.status(404).json({
        error: "We couldn't find that business"
      });

    }

    const customerId = await createCustomer(

      business.id,

      name.trim(),

      email || null,

      phone || null

    );

    // Best-effort - a stranger reaching out through the public chat page
    // is worth flagging, but a failure here must never block them from
    // actually starting the conversation.
    try {

      await createNotification(

        business.id,

        "new_conversation",

        `💬 ${name.trim()} started a chat`,

        "New visitor from your public chat page",

        `/customers/${customerId}`

      );

    } catch (notificationError) {

      console.error("NEW CONVERSATION NOTIFICATION FAILED:", notificationError);

    }

    res.status(201).json({
      customer_id: customerId
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
    });

  }

};



const sendPublicMessage = async (req, res) => {

  try {

    const { customer_id, message } = req.body;

    if (!customer_id || !message) {

      return res.status(400).json({
        error: "customer_id and message are required"
      });

    }

    if (message.length > MAX_MESSAGE_LENGTH) {

      return res.status(400).json({
        error: "Message is too long"
      });

    }

    const business = await getBusinessBySlug(req.params.slug);

    if (!business) {

      return res.status(404).json({
        error: "We couldn't find that business"
      });

    }

    const customer = await getCustomerById(customer_id, business.id);

    if (!customer) {

      return res.status(404).json({
        error: "We couldn't find your conversation. Please refresh and start again."
      });

    }

    const result = await processChatMessage(customer, business, message);

    res.json(result);

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Couldn't send that message right now. Please try again."
    });

  }

};



const getPublicHistory = async (req, res) => {

  try {

    const { customer_id } = req.params;

    const business = await getBusinessBySlug(req.params.slug);

    if (!business) {

      return res.status(404).json({
        error: "We couldn't find that business"
      });

    }

    const customer = await getCustomerById(customer_id, business.id);

    if (!customer) {

      return res.status(404).json({
        error: "We couldn't find your conversation"
      });

    }

    const history = await getConversationHistory(customer_id);

    res.json(history);

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
    });

  }

};



module.exports = {

  getBusinessBySlugHandler,

  startConversation,

  sendPublicMessage,

  getPublicHistory

};
