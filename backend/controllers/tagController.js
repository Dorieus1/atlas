const {
  createTag: createTagService,
  getTags: getTagsService,
  deleteTag: deleteTagService
} = require("../services/tagService");


function validateName(name) {

  if (!name || !String(name).trim()) {
    return "name is required";
  }

  if (String(name).trim().length > 50) {
    return "name is too long";
  }

  return null;

}



const createTag = async (req, res) => {

  try {

    const { name } = req.body;
    const business_id = req.user.business_id;

    const error = validateName(name);

    if (error) {

      return res.status(400).json({
        error
      });

    }

    const id = await createTagService(business_id, String(name).trim());

    res.status(201).json({
      id,
      message: "Tag created"
    });

  } catch (error) {

    if (error.code === "DUPLICATE_TAG") {

      return res.status(400).json({
        error: error.message
      });

    }

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
    });

  }

};



const getTags = async (req, res) => {

  try {

    const tags = await getTagsService(req.user.business_id);

    res.json(tags);

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
    });

  }

};



const deleteTag = async (req, res) => {

  try {

    const deleted = await deleteTagService(req.params.id, req.user.business_id);

    if (!deleted) {

      return res.status(404).json({
        error: "Tag not found"
      });

    }

    res.json({
      message: "Tag deleted"
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
    });

  }

};



module.exports = {

  createTag,

  getTags,

  deleteTag

};
