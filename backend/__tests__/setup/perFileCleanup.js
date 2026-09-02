// Registered as setupFilesAfterEnv in jest.config.js: loaded once per
// test file, after Jest's test framework is installed, so it can
// register afterEach / afterAll hooks that apply to every test.
//
// The suite runs in-band (jest.config.js: maxWorkers 1, no worker
// forks), so every test file shares one Node process and one event
// loop, but Jest still gives each file its own module registry - so
// each file's `require("../../../database/db")` is a *separate* sqlite3
// connection to the shared per-run test database, and
// `require("../../server")` is a separate http.Server.
//
// Some request handlers kick off database work without awaiting it
// (chatService's lead / knowledge-gap detection). If a test triggers
// that and the file finishes before the work settles, the work keeps
// running against a now-abandoned connection while the next file's setup
// is already writing on a fresh one - two live connections on one SQLite
// file, which is not what database/transactionQueue.js's mutex assumes.
// After every test we wait for chatService's tracked background work and
// then drain the connection (a round-trip that only returns once every
// statement queued before it has run), so each file's database work
// stays inside that file.
//
// The afterAll also closes the per-file server (see the comment in
// backend/server.js for why tests get a real listening server) so its
// port is released promptly instead of lingering until process exit.

const db = require("../../../database/db");
const server = require("../../server");
const { flushBackgroundWork } = require("../../services/chatService");

// node-sqlite3 runs a single connection's statements strictly in order,
// so once this SELECT's callback fires, every statement queued before it
// (everything the just-finished test issued) has completed.
const drainConnection = () =>
  new Promise((resolve) => db.get("SELECT 1", () => resolve()));

// server.js starts listening at require time, but `.listen()` finishes
// asynchronously; make sure it's up before the first supertest call so
// supertest reuses it instead of trying to start its own.
beforeAll((done) => {
  if (!server || typeof server.listening !== "boolean" || server.listening) {
    return done();
  }
  server.once("listening", done);
  server.once("error", done);
});

afterEach(async () => {
  await flushBackgroundWork();
  await drainConnection();
});

afterAll(async () => {
  await flushBackgroundWork();
  await drainConnection();

  if (server && typeof server.close === "function" && server.listening) {
    await new Promise((resolve) => server.close(() => resolve()));
  }
});
