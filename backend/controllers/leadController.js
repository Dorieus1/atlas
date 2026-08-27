const {

  getLeadsByBusiness,

  updateLead,

  updateLeadSource,

  getCustomerLead: getCustomerLeadService

} = require("../services/leadService");


// "Website" covers the public chat widget itself - the one source every
// AI-detected lead already has in common, so it's included as a real
// option rather than treating "how they actually reached us" as an
// afterthought. null/undefined clears it back to "not set".
const VALID_LEAD_SOURCES = ["google", "referral", "social_media", "yard_sign_vehicle", "repeat_customer", "website", "other"];



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





const VALID_LEAD_STATUSES = ["new", "contacted", "qualified", "closed"];



const changeLeadStatus = async (req,res)=>{

  try {

    const {

      id

    } = req.params;

    const {

      status

    } = req.body;

    if (!VALID_LEAD_STATUSES.includes(status)) {

      return res.status(400).json({

        error:
        "status must be one of: " + VALID_LEAD_STATUSES.join(", ")

      });

    }

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

    console.error(error);

    res.status(500).json({

      error: "Something went wrong. Please try again."

    });

  }

};





const changeLeadSource = async (req, res) => {

  try {

    const { id } = req.params;
    const { source } = req.body;

    // Clearing it back to "not set" is a valid, deliberate action (the
    // owner picked the wrong one and wants to undo it) - only a
    // non-empty value gets checked against the allowlist.
    if (source && !VALID_LEAD_SOURCES.includes(source)) {

      return res.status(400).json({
        error: "source must be one of: " + VALID_LEAD_SOURCES.join(", ")
      });

    }

    const updated = await updateLeadSource(id, source || null, req.user.business_id);

    if (!updated) {

      return res.status(404).json({
        error: "Lead not found"
      });

    }

    res.json({
      message: "Lead updated"
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
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

      error: "Something went wrong. Please try again."

    });

  }

};



module.exports = {

  getAllLeads,

  changeLeadStatus,

  changeLeadSource,

  getCustomerLead,

  VALID_LEAD_SOURCES

};