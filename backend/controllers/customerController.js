const {
  createCustomer: createCustomerService,
  getCustomerById: getCustomerByIdService,
  getCustomersByBusiness: getCustomersByBusinessService,
  deleteCustomer: deleteCustomerService,
  updateCustomer: updateCustomerService
} = require("../services/customerService");

const { getUserById } = require("../services/authService");





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



    // Snapshot the acting user's current name at creation time rather
    // than relying on a live join to `users` - removing a teammate is a
    // hard delete (see authController.removeTeammate), so a live join
    // would silently lose this attribution the moment that teammate was
    // removed.
    const actingUser = await getUserById(req.user.id, business_id);

    const id =
      await createCustomerService(

        business_id,

        name.trim(),

        email ? email.trim() : email,

        phone ? phone.trim() : phone,

        req.user.id,

        actingUser ? actingUser.name : null

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