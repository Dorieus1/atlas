const chatResponse = (req, res) => {
  const { message } = req.body;

  res.json({
    received: message,
    reply: "Atlas AI received your message."
  });
};

module.exports = {
  chatResponse
};