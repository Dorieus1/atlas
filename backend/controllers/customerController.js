const {
  createCustomer: createCustomerService,
  getCustomerById: getCustomerByIdService,
  getCustomersByBusiness: getCustomersByBusinessService
} = require("../services/customerService");





const createCustomer = async (req, res) => {


  try {


    const {

      name,

      email

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

        email ? email.trim() : email

      );



    res.json({

      id,

      message:
      "Customer created"

    });



  } catch(error) {


    console.error(error);


    res.status(500).json({

      error:error.message

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

      error:error.message

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

      error:error.message

    });


  }


};






module.exports = {


  createCustomer,

  getCustomers,

  getCustomerById


};