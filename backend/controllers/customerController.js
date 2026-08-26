const multer = require("multer");

const {
  createCustomer: createCustomerService,
  getCustomerById: getCustomerByIdService,
  getCustomersByBusiness: getCustomersByBusinessService,
  deleteCustomer: deleteCustomerService,
  restoreCustomer: restoreCustomerService,
  getTrashedCustomersByBusiness: getTrashedCustomersByBusinessService,
  findPossibleDuplicates: findPossibleDuplicatesService,
  mergeCustomers: mergeCustomersService,
  updateCustomer: updateCustomerService,
  getCustomerTags: getCustomerTagsService,
  addCustomerTag: addCustomerTagService,
  removeCustomerTag: removeCustomerTagService
} = require("../services/customerService");

const { importCustomersFromCsv } = require("../services/customerImportService");

const { getUserById } = require("../services/authService");
const {
  getTagById: getTagByIdService
} = require("../services/tagService");


// memoryStorage, not diskStorage like photoController - an import only
// needs the file's contents once to parse it; nothing needs to persist to
// disk afterward, so there's nothing to clean up either.
const MAX_IMPORT_FILE_SIZE = 2 * 1024 * 1024;

const csvUpload = multer({

  storage: multer.memoryStorage(),

  limits: {
    fileSize: MAX_IMPORT_FILE_SIZE
  }

}).single("file");





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

        req.user.business_id,

        req.query.tag_id

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



    const tags = await getCustomerTagsService(

      req.params.id,

      req.user.business_id

    );



    res.json({

      ...customer,

      tags

    });



  } catch(error) {


    console.error(error);


    res.status(500).json({

      error: "Something went wrong. Please try again."

    });


  }


};



const addCustomerTag = async (req, res) => {


  try {


    const { tag_id } = req.body;

    const business_id = req.user.business_id;


    if (!tag_id) {

      return res.status(400).json({

        error: "tag_id is required"

      });

    }


    const customer = await getCustomerByIdService(

      req.params.id,

      business_id

    );


    if (!customer) {

      return res.status(404).json({

        error: "Customer not found"

      });

    }


    const tag = await getTagByIdService(tag_id, business_id);


    if (!tag) {

      return res.status(404).json({

        error: "Tag not found"

      });

    }


    await addCustomerTagService(req.params.id, tag_id, business_id);


    const tags = await getCustomerTagsService(req.params.id, business_id);


    res.status(201).json({ tags });


  } catch (error) {


    console.error(error);


    res.status(500).json({

      error: "Something went wrong. Please try again."

    });


  }


};



const removeCustomerTag = async (req, res) => {


  try {


    const business_id = req.user.business_id;


    const customer = await getCustomerByIdService(

      req.params.id,

      business_id

    );


    if (!customer) {

      return res.status(404).json({

        error: "Customer not found"

      });

    }


    await removeCustomerTagService(

      req.params.id,

      req.params.tagId,

      business_id

    );


    const tags = await getCustomerTagsService(req.params.id, business_id);


    res.json({ tags });


  } catch (error) {


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
      "Customer moved to trash"

    });



  } catch(error) {


    console.error(error);


    res.status(500).json({

      error: "Something went wrong. Please try again."

    });


  }


};



const getTrashedCustomers = async (req, res) => {


  try {


    const customers =
      await getTrashedCustomersByBusinessService(

        req.user.business_id

      );


    res.json(customers);



  } catch(error) {


    console.error(error);


    res.status(500).json({

      error: "Something went wrong. Please try again."

    });


  }


};



const getPossibleDuplicates = async (req, res) => {

  try {

    const groups = await findPossibleDuplicatesService(req.user.business_id);

    res.json(groups);

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
    });

  }

};



const mergeCustomers = async (req, res) => {

  try {

    const { survivor_id, loser_id } = req.body;

    if (!survivor_id || !loser_id) {

      return res.status(400).json({
        error: "survivor_id and loser_id are both required"
      });

    }

    if (survivor_id === loser_id) {

      return res.status(400).json({
        error: "Can't merge a customer into itself"
      });

    }

    const result = await mergeCustomersService(req.user.business_id, survivor_id, loser_id);

    if (result.error === "not_found") {

      return res.status(404).json({
        error: "One or both customers weren't found"
      });

    }

    if (result.error) {

      return res.status(500).json({
        error: "Something went wrong. Please try again."
      });

    }

    const tags = await getCustomerTagsService(survivor_id, req.user.business_id);

    res.json({ ...result.customer, tags });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
    });

  }

};



const restoreCustomer = async (req, res) => {


  try {


    const restored = await restoreCustomerService(

      req.params.id,

      req.user.business_id

    );


    if (!restored) {


      return res.status(404).json({

        error:
        "Customer not found"

      });


    }


    res.json({

      message:
      "Customer restored"

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



const importCustomers = (req, res) => {

  csvUpload(req, res, async (err) => {

    if (err) {

      const message = err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE"
        ? "That file is too large. Please upload a CSV under 2MB."
        : err.message || "Couldn't upload that file.";

      return res.status(400).json({ error: message });

    }

    try {

      if (!req.file) {

        return res.status(400).json({
          error: "No CSV file was uploaded"
        });

      }

      const business_id = req.user.business_id;

      const actingUser = await getUserById(req.user.id, business_id);

      const summary = await importCustomersFromCsv(
        business_id,
        req.file.buffer,
        req.user.id,
        actingUser ? actingUser.name : null
      );

      res.json(summary);

    } catch (error) {

      if (error.statusCode) {

        return res.status(error.statusCode).json({
          error: error.message
        });

      }

      console.error(error);

      res.status(500).json({
        error: "Something went wrong. Please try again."
      });

    }

  });

};



module.exports = {


  createCustomer,

  getCustomers,

  getCustomerById,

  deleteCustomer,

  getTrashedCustomers,
  getPossibleDuplicates,
  mergeCustomers,

  restoreCustomer,

  updateCustomer,

  addCustomerTag,

  removeCustomerTag,

  importCustomers


};