const {
  getAnalytics
} = require("../services/analyticsService");



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



module.exports = {

  analytics

};