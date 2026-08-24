const mockCreate = jest.fn().mockResolvedValue({
  output_text: "hot"
});

jest.mock("openai", () => {

  return jest.fn().mockImplementation(() => ({

    responses: {

      create: (...args) => mockCreate(...args)

    }

  }));

});

global.__mockOpenAICreate = mockCreate;
