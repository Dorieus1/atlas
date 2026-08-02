const {
  generateAIResponse
} = require("../services/aiService");

const {
  getCustomerMemories
} = require("../services/memoryService");

const {
  saveConversation
} = require("../services/conversationService");

const {
  getBusinessKnowledge
} = require("../services/knowledgeService");

const {
  createMemory
} = require("../services/memoryCreationService");


const chatResponse = async (req, res) => {

  try {

    const {
  business_id,
  customer_id,
  message
} = req.body;


    if (!business_id || !customer_id || !message) {
      return res.status(400).json({
        error: "business_id, customer_id, and message are required"
      });
    }


    const memories = await getCustomerMemories(customer_id);
    const knowledge = await getBusinessKnowledge(business_id);


    const reply = await generateAIResponse(
  message,
  memories,
  knowledge
);
    await saveConversation(
        customer_id,
        message,
        reply
    ); 

    if (message.toLowerCase().includes("my name is")) {

  await createMemory(
    customer_id,
    message
  );

}


    res.json({
      reply,
      memories_used: memories
    });


  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "AI response failed"
    });

  }

};


module.exports = {
  chatResponse,
};