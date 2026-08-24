const {
  getPendingKnowledgeGaps,
  getKnowledgeGapById,
  setKnowledgeGapStatus
} = require("../services/knowledgeGapService");

const { createKnowledgeEntry } = require("../services/knowledgeService");


const listKnowledgeGaps = async (req, res) => {

  try {

    const gaps = await getPendingKnowledgeGaps(req.user.business_id);

    res.json(gaps);

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
    });

  }

};



// Lets the owner edit the AI's suggestion before it becomes a real
// knowledge entry - title/content in the body override the suggestion,
// so this is "accept, optionally tweaked" rather than "accept blindly".
const approveKnowledgeGap = async (req, res) => {

  try {

    const gap = await getKnowledgeGapById(req.params.id, req.user.business_id);

    if (!gap) {

      return res.status(404).json({
        error: "Not found"
      });

    }

    const title = (req.body.title || gap.suggested_title || "").trim();
    const content = (req.body.content || gap.suggested_content || "").trim();

    if (!title || !content) {

      return res.status(400).json({
        error: "title and content are required"
      });

    }

    if (title.length > 200 || content.length > 5000) {

      return res.status(400).json({
        error: "Title or content is too long"
      });

    }

    const id = await createKnowledgeEntry(req.user.business_id, title, content);

    await setKnowledgeGapStatus(gap.id, req.user.business_id, "approved");

    res.status(201).json({
      id,
      message: "Knowledge entry added"
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
    });

  }

};



const dismissKnowledgeGap = async (req, res) => {

  try {

    const updated = await setKnowledgeGapStatus(req.params.id, req.user.business_id, "dismissed");

    if (!updated) {

      return res.status(404).json({
        error: "Not found"
      });

    }

    res.json({
      message: "Dismissed"
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
    });

  }

};



module.exports = {
  listKnowledgeGaps,
  approveKnowledgeGap,
  dismissKnowledgeGap
};
