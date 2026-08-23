const {
  getAnalytics
} = require("../services/analyticsService");



const analytics = async (req,res)=>{


  try {


    const data =
      await getAnalytics(req.user.business_id);



    res.json(data);



  } catch(error){


    res.status(500).json({

      error:error.message

    });


  }


};



module.exports = {

  analytics

};