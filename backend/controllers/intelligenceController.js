const {
  generateDashboardIntelligence
} = require("../services/intelligenceService");

const getDashboardIntelligence = async (req, res) => {

  try {

    const intelligence =
      await generateDashboardIntelligence(req.user.business_id);

    res.json(intelligence);

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Failed to generate dashboard intelligence"
    });

  }

};

module.exports = {
  getDashboardIntelligence
};