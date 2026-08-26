module.exports = {

  testEnvironment: "node",

  testMatch: ["**/backend/__tests__/**/*.test.js"],

  modulePathIgnorePatterns: ["<rootDir>/.claude/"],

  moduleNameMapper: {
    "^uuid$": "<rootDir>/backend/__tests__/setup/uuidMock.js"
  },

  watchPathIgnorePatterns: ["<rootDir>/.claude/"],

  haste: {
    retainAllFiles: false
  },

  globalSetup: "<rootDir>/backend/__tests__/setup/globalSetup.js",

  globalTeardown: "<rootDir>/backend/__tests__/setup/globalTeardown.js",

  setupFiles: [
    "<rootDir>/backend/__tests__/setup/mockOpenai.js",
    "<rootDir>/backend/__tests__/setup/mockEmail.js",
    "<rootDir>/backend/__tests__/setup/mockStripe.js",
    "<rootDir>/backend/__tests__/setup/mockGoogleCalendar.js",
    "<rootDir>/backend/__tests__/setup/mockAppleCalendar.js"
  ],

  maxWorkers: 1,

  testTimeout: 10000

};
