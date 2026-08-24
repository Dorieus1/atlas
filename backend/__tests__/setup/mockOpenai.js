jest.mock("openai", () => {

  return jest.fn().mockImplementation(() => ({

    responses: {

      create: jest.fn().mockResolvedValue({
        output_text: "hot"
      })

    }

  }));

});
