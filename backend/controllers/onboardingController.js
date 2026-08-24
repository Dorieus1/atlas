const {
  getOnboardingStatus: getOnboardingStatusService,
  dismissOnboarding: dismissOnboardingService
} = require("../services/onboardingService");



const getOnboardingStatus = async (req, res) => {

  try {

    const status = await getOnboardingStatusService(req.user.business_id);

    res.json(status);

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
    });

  }

};



const dismissOnboarding = async (req, res) => {

  try {

    await dismissOnboardingService(req.user.business_id);

    res.json({ message: "Dismissed" });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
    });

  }

};



module.exports = {

  getOnboardingStatus,

  dismissOnboarding

};
