const {
  createNote,
  getCustomerNotes
} = require("../services/noteService");

const { getCustomerById } = require("../services/customerService");



const addNote = async (req, res) => {

  try {

    const {
      customer_id,
      note
    } = req.body;


    if (!customer_id || !note) {

      return res.status(400).json({
        error: "customer_id and note required"
      });

    }


    const customer = await getCustomerById(customer_id, req.user.business_id);

    if (!customer) {

      return res.status(404).json({
        error: "Customer not found"
      });

    }


    await createNote(
      customer_id,
      note
    );


    res.json({
      message: "Note added"
    });


  } catch(error) {

    console.error(error);

    res.status(500).json({
      error: "Failed to add note"
    });

  }

};



const getNotes = async (req, res) => {

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

    const notes =
      await getCustomerNotes(
        req.params.customer_id
      );


    res.json(notes);


  } catch(error) {

    console.error(error);

    res.status(500).json({
      error: "Failed to get notes"
    });

  }

};



module.exports = {

  addNote,

  getNotes

};