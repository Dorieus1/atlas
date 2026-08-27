const {
  getTourStatus: getTourStatusService,
  completeTour: completeTourService
} = require("../services/tourService");



const getTourStatus = async (req, res) => {

  try {

    const status = await getTourStatusService(req.user.business_id);

    res.json(status);

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
    });

  }

};



const completeTour = async (req, res) => {

  try {

    await completeTourService(req.user.business_id);

    res.json({ message: "Tour completed" });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
    });

  }

};



module.exports = {

  getTourStatus,

  completeTour

};
