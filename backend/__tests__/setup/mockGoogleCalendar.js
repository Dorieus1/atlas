// Mirrors mockStripe.js's structure: jest.mock the third-party SDK
// (googleapis) with fakes, and expose them on `global` so individual
// test files can assert on calls / override return values per-test.
const mockGenerateAuthUrl = jest.fn().mockReturnValue("https://accounts.google.com/o/oauth2/v2/auth?mock=1");
const mockGetToken = jest.fn().mockResolvedValue({ tokens: { refresh_token: "refresh_test_123", access_token: "access_test_123" } });
const mockSetCredentials = jest.fn();
const mockUserinfoGet = jest.fn().mockResolvedValue({ data: { email: "owner@example.com" } });
const mockEventsInsert = jest.fn().mockResolvedValue({ data: { id: "gcal_event_test_123" } });
const mockEventsUpdate = jest.fn().mockResolvedValue({ data: { id: "gcal_event_test_123" } });
const mockEventsDelete = jest.fn().mockResolvedValue({ data: {} });

jest.mock("googleapis", () => {

  return {

    google: {

      auth: {
        OAuth2: jest.fn().mockImplementation(() => ({
          generateAuthUrl: (...args) => mockGenerateAuthUrl(...args),
          getToken: (...args) => mockGetToken(...args),
          setCredentials: (...args) => mockSetCredentials(...args)
        }))
      },

      oauth2: jest.fn().mockImplementation(() => ({
        userinfo: {
          get: (...args) => mockUserinfoGet(...args)
        }
      })),

      calendar: jest.fn().mockImplementation(() => ({
        events: {
          insert: (...args) => mockEventsInsert(...args),
          update: (...args) => mockEventsUpdate(...args),
          delete: (...args) => mockEventsDelete(...args)
        }
      }))

    }

  };

});

global.__mockGoogleCalendar = {
  generateAuthUrl: mockGenerateAuthUrl,
  getToken: mockGetToken,
  setCredentials: mockSetCredentials,
  userinfoGet: mockUserinfoGet,
  eventsInsert: mockEventsInsert,
  eventsUpdate: mockEventsUpdate,
  eventsDelete: mockEventsDelete
};
