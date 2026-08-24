const {
  createNote,
  getCustomerNotes,
  getNoteById,
  updateNote,
  deleteNote
} = require("../services/noteService");

const { getCustomerById } = require("../services/customerService");



const addNote = async (req, res) => {

  try {

    const {
      customer_id,
      note
    } = req.body;


    if (!customer_id || !note || !note.trim()) {

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
      note.trim()
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



const editNote = async (req, res) => {

  try {

    const { note } = req.body;

    if (!note || !note.trim()) {

      return res.status(400).json({
        error: "note is required"
      });

    }

    const existing = await getNoteById(req.params.id);

    if (!existing) {

      return res.status(404).json({
        error: "Note not found"
      });

    }

    const customer = await getCustomerById(
      existing.customer_id,
      req.user.business_id
    );

    if (!customer) {

      return res.status(404).json({
        error: "Note not found"
      });

    }

    await updateNote(req.params.id, note.trim());

    res.json({
      message: "Note updated"
    });

  } catch(error) {

    console.error(error);

    res.status(500).json({
      error: "Failed to update note"
    });

  }

};



const removeNote = async (req, res) => {

  try {

    const existing = await getNoteById(req.params.id);

    if (!existing) {

      return res.status(404).json({
        error: "Note not found"
      });

    }

    const customer = await getCustomerById(
      existing.customer_id,
      req.user.business_id
    );

    if (!customer) {

      return res.status(404).json({
        error: "Note not found"
      });

    }

    await deleteNote(req.params.id);

    res.json({
      message: "Note deleted"
    });

  } catch(error) {

    console.error(error);

    res.status(500).json({
      error: "Failed to delete note"
    });

  }

};



module.exports = {

  addNote,

  getNotes,

  editNote,

  removeNote

};