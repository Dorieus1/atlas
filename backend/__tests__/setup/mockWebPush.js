// Same shape as mockStripe.js/mockGoogleCalendar.js - real push delivery
// needs a real browser and a real OS-level push service, neither of
// which exist in a test run, so `web-push` itself is swapped out for a
// controllable fake. Tests can inspect global.__mockWebPush.sendNotification
// to assert what webPushService.js tried to send, or make it reject to
// exercise the 404/410 cleanup path.
const mockSendNotification = jest.fn().mockResolvedValue({ statusCode: 201 });
const mockSetVapidDetails = jest.fn();

jest.mock("web-push", () => ({

  setVapidDetails: (...args) => mockSetVapidDetails(...args),

  sendNotification: (...args) => mockSendNotification(...args)

}));

global.__mockWebPush = {
  sendNotification: mockSendNotification,
  setVapidDetails: mockSetVapidDetails
};
