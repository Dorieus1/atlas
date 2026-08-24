global.fetch = jest.fn().mockResolvedValue({

  ok: true,

  json: async () => ({ id: "mock-email-id" })

});
