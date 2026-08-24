const { search: searchService } = require("../services/searchService");


const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 200;


const search = async (req, res) => {

  try {

    const query = (req.query.q || "").trim();

    if (query.length < MIN_QUERY_LENGTH) {

      return res.json({ customers: [], leads: [], appointments: [], quotes: [] });

    }

    if (query.length > MAX_QUERY_LENGTH) {

      return res.status(400).json({
        error: "Search query is too long"
      });

    }

    const results = await searchService(req.user.business_id, query);

    res.json(results);

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Something went wrong. Please try again."
    });

  }

};


module.exports = {
  search
};
