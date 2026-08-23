const {

  getLeadsByBusiness,

  updateLead,

  getCustomerLead: getCustomerLeadService

} = require("../services/leadService");



const getAllLeads = async (req,res)=>{

  try {

    const leads =
      await getLeadsByBusiness(

        req.user.business_id

      );

    res.json(leads);

  } catch(error){

    console.error(error);

    res.status(500).json({

      error:"Failed to get leads"

    });

  }

};





const changeLeadStatus = async (req,res)=>{

  try {

    const {

      id

    } = req.params;

    const {

      status

    } = req.body;

    const updated = await updateLead(

      id,

      status,

      req.user.business_id

    );

    if(!updated){

      return res.status(404).json({

        error:"Lead not found"

      });

    }

    res.json({

      message:"Lead updated"

    });

  } catch(error){

    res.status(500).json({

      error:error.message

    });

  }

};





const getCustomerLead = async (req,res)=>{

  try {

    const {

      customer_id

    } = req.params;

    const lead =
      await getCustomerLeadService(

        customer_id,

        req.user.business_id

      );

    if(!lead){

      return res.json(null);

    }

    res.json(lead);

  } catch(error){

    console.error(error);

    res.status(500).json({

      error:error.message

    });

  }

};



module.exports = {

  getAllLeads,

  changeLeadStatus,

  getCustomerLead

};