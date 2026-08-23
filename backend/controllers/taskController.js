const {
  createTask: createTaskService,
  getTasks: getTasksService,
  completeTask: completeTaskService
} = require("../services/taskService");

const { getCustomerById } = require("../services/customerService");



const createTask = async (req, res) => {

  try {

    const {

  customer_id,
  title,
  description,
  due_date

} = req.body;

const business_id = req.user.business_id;



    if (
  !customer_id ||
  !title || !title.trim()
) {

      return res.status(400).json({

        error:
        "customer_id and title required"

      });

    }


    const customer = await getCustomerById(customer_id, business_id);

    if (!customer) {

      return res.status(404).json({

        error:
        "Customer not found"

      });

    }



    const id =
      await createTaskService(

        customer_id,
        business_id,
        title.trim(),
        description,
        due_date

      );



    res.json({

      id,

      message:
      "Task created"

    });



  } catch(error) {


    console.error(error);


    res.status(500).json({

      error:
      error.message

    });


  }

};





const getTasks = async (req,res)=>{


  try {


    const tasks =
  await getTasksService(
    req.user.business_id
  );


    res.json(tasks);



  } catch(error){


    console.error(error);


    res.status(500).json({

      error:
      error.message

    });


  }


};





const completeTask = async (req,res)=>{


  try {


    const updated = await completeTaskService(

      req.params.id,

      req.user.business_id

    );


    if(!updated){

      return res.status(404).json({

        error:
        "Task not found"

      });

    }


    res.json({

      message:
      "Task completed"

    });



  } catch(error){


    console.error(error);


    res.status(500).json({

      error:
      error.message

    });


  }


};





module.exports = {

  createTask,

  getTasks,

  completeTask

};