const {
  createCustomer: createCustomerService,
  getCustomerById: getCustomerByIdService,
  getCustomersByBusiness: getCustomersByBusinessService,
  deleteCustomer: deleteCustomerService,
  updateCustomer: updateCustomerService
} = require("../services/customerService");





const createCustomer = async (req, res) => {


  try {


    const {

      name,

      email,

      phone

    } = req.body;



    const business_id = req.user.business_id;



    if (!name || !name.trim()) {


      return res.status(400).json({

        error:
        "name is required"

      });


    }



    const id =
      await createCustomerService(

        business_id,

        name.trim(),

        email ? email.trim() : email,

        phone ? phone.trim() : phone

      );



    res.json({

      id,

      message:
      "Customer created"

    });



  } catch(error) {


    console.error(error);


    res.status(500).json({

      error: "Something went wrong. Please try again."

    });


  }


};







const getCustomers = async (req,res)=>{


  try {


    const customers =
      await getCustomersByBusinessService(

        req.user.business_id

      );


    res.json(customers);



  } catch(error){


    console.error(error);


    res.status(500).json({

      error: "Something went wrong. Please try again."

    });


  }


};







const getCustomerById = async (req,res)=>{


  try {


    const customer =
  await getCustomerByIdService(

    req.params.id,

    req.user.business_id

  );



    if (!customer) {


      return res.status(404).json({

        error:
        "Customer not found"

      });


    }



    res.json(customer);



  } catch(error) {


    console.error(error);


    res.status(500).json({

      error: "Something went wrong. Please try again."

    });


  }


};






const deleteCustomer = async (req, res) => {


  try {


    const deleted = await deleteCustomerService(

      req.params.id,

      req.user.business_id

    );


    if (!deleted) {


      return res.status(404).json({

        error:
        "Customer not found"

      });


    }


    res.json({

      message:
      "Customer deleted"

    });



  } catch(error) {


    console.error(error);


    res.status(500).json({

      error: "Something went wrong. Please try again."

    });


  }


};



const updateCustomer = async (req, res) => {


  try {


    const { name, email, phone } = req.body;


    if (!name || !name.trim()) {

      return res.status(400).json({

        error:
        "name is required"

      });

    }


    const updated = await updateCustomerService(

      req.params.id,

      req.user.business_id,

      name.trim(),

      email,

      phone

    );


    if (!updated) {


      return res.status(404).json({

        error:
        "Customer not found"

      });


    }


    res.json({

      message:
      "Customer updated"

    });



  } catch(error) {


    console.error(error);


    res.status(500).json({

      error: "Something went wrong. Please try again."

    });


  }


};



module.exports = {


  createCustomer,

  getCustomers,

  getCustomerById,

  deleteCustomer,

  updateCustomer


};