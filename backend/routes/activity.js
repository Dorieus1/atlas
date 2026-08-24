const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const {
  getCustomerActivities
} = require("../services/activityService");

const {
  getCustomerById
} = require("../services/customerService");



router.get("/:customer_id", authMiddleware, async (req,res)=>{


  try {


    const customer = await getCustomerById(

      req.params.customer_id,

      req.user.business_id

    );


    if (!customer) {

      return res.status(404).json({

        error: "Customer not found"

      });

    }


    const activities = await getCustomerActivities(

      req.params.customer_id

    );


    res.json(activities);


  } catch(error){


    console.error(error);


    res.status(500).json({

      error: "Something went wrong. Please try again."

    });


  }


});


module.exports = router;