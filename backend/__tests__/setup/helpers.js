const request = require("supertest");

const createBusinessAndUser = async (app, prefix) => {

  const businessRes = await request(app)
    .post("/api/business")
    .send({ name: `${prefix} Business` });

  const business_id = businessRes.body.id;

  await request(app)
    .post("/api/auth/register")
    .send({
      business_id,
      name: "Test Owner",
      email: `${prefix.toLowerCase()}@test.com`,
      password: "testpass123"
    });

  const loginRes = await request(app)
    .post("/api/auth/login")
    .send({
      email: `${prefix.toLowerCase()}@test.com`,
      password: "testpass123"
    });

  return {
    business_id,
    token: loginRes.body.token,
    authHeader: `Bearer ${loginRes.body.token}`
  };

};

module.exports = { createBusinessAndUser };
