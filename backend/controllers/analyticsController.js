const {
  getAnalytics
} = require("../services/analyticsService");

const {
  getArAging
} = require("../services/arAgingService");



const analytics = async (req,res)=>{


  try {


    const data =
      await getAnalytics(req.user.business_id);



    res.json(data);



  } catch(error){


    console.error(error);


    res.status(500).json({

      error: "Something went wrong. Please try again."

    });


  }


};



const arAging = async (req, res) => {

  try {

    const data = await getArAging(req.user.business_id);

    res.json(data);

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
    });

  }

};



module.exports = {

  analytics,

  arAging

};