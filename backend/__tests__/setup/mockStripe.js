const mockAccountsCreate = jest.fn().mockResolvedValue({ id: "acct_test123" });
const mockAccountsRetrieve = jest.fn().mockResolvedValue({ charges_enabled: true, details_submitted: true });
const mockAccountLinksCreate = jest.fn().mockResolvedValue({ url: "https://connect.stripe.com/setup/test" });
const mockCheckoutSessionsCreate = jest.fn().mockResolvedValue({ id: "cs_test_123", url: "https://checkout.stripe.com/pay/test" });
const mockWebhooksConstructEvent = jest.fn();

jest.mock("stripe", () => {

  return jest.fn().mockImplementation(() => ({

    accounts: {
      retrieve: (...args) => mockAccountsRetrieve(...args)
    },

    v2: {
      core: {
        accounts: {
          create: (...args) => mockAccountsCreate(...args)
        }
      }
    },

    accountLinks: {
      create: (...args) => mockAccountLinksCreate(...args)
    },

    checkout: {
      sessions: {
        create: (...args) => mockCheckoutSessionsCreate(...args)
      }
    },

    webhooks: {
      constructEvent: (...args) => mockWebhooksConstructEvent(...args)
    }

  }));

});

global.__mockStripe = {
  accountsCreate: mockAccountsCreate,
  accountsRetrieve: mockAccountsRetrieve,
  accountLinksCreate: mockAccountLinksCreate,
  checkoutSessionsCreate: mockCheckoutSessionsCreate,
  webhooksConstructEvent: mockWebhooksConstructEvent
};
