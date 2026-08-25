const {
  createSavedLineItem: createSavedLineItemService,
  getSavedLineItems: getSavedLineItemsService,
  updateSavedLineItem: updateSavedLineItemService,
  deleteSavedLineItem: deleteSavedLineItemService
} = require("../services/savedLineItemService");


function validateFields(description, unit_price) {

  if (!description || !String(description).trim()) {
    return "description is required";
  }

  if (String(description).length > 300) {
    return "description is too long";
  }

  const price = Number(unit_price);

  if (!Number.isFinite(price) || price < 0) {
    return "unit_price must be a non-negative number";
  }

  return null;

}



const createSavedLineItem = async (req, res) => {

  try {

    const { description, unit_price } = req.body;
    const business_id = req.user.business_id;

    const error = validateFields(description, unit_price);

    if (error) {

      return res.status(400).json({
        error
      });

    }

    const id = await createSavedLineItemService(
      business_id,
      String(description).trim(),
      Number(unit_price)
    );

    res.status(201).json({
      id,
      message: "Saved service created"
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
    });

  }

};



const getSavedLineItems = async (req, res) => {

  try {

    const items = await getSavedLineItemsService(req.user.business_id);

    res.json(items);

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
    });

  }

};



const updateSavedLineItem = async (req, res) => {

  try {

    const { id } = req.params;
    const { description, unit_price } = req.body;
    const business_id = req.user.business_id;

    const error = validateFields(description, unit_price);

    if (error) {

      return res.status(400).json({
        error
      });

    }

    const updated = await updateSavedLineItemService(
      id,
      business_id,
      String(description).trim(),
      Number(unit_price)
    );

    if (!updated) {

      return res.status(404).json({
        error: "Saved service not found"
      });

    }

    res.json({
      message: "Saved service updated"
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
    });

  }

};



const deleteSavedLineItem = async (req, res) => {

  try {

    const deleted = await deleteSavedLineItemService(req.params.id, req.user.business_id);

    if (!deleted) {

      return res.status(404).json({
        error: "Saved service not found"
      });

    }

    res.json({
      message: "Saved service deleted"
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
    });

  }

};



module.exports = {

  createSavedLineItem,

  getSavedLineItems,

  updateSavedLineItem,

  deleteSavedLineItem

};
