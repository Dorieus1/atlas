# Atlas

A local CRM and AI receptionist for a small roofing business. Handles customers, leads, notes, tasks, an AI chat assistant, and a knowledge base the AI draws on when talking to customers.

## Stack

- Backend: Node/Express (CommonJS), SQLite (`atlas.db`)
- Frontend: React + Vite, Tailwind
- AI: OpenAI, via `backend/services/*Service.js`
- Email (password reset): Resend, via `backend/services/emailService.js`

## Running it

Copy `.env.example` to `.env` and fill in the values, then:

```bash
node backend/server.js       # backend, defaults to port 5050
npm --prefix frontend run dev   # frontend, defaults to port 5173
```

Both need to be running at the same time. The frontend automatically points its API calls at whatever host it was loaded from, so it also works from another device on the same WiFi network (e.g. a phone), using this computer's local network address instead of `localhost`.

## Database setup

There's nothing to run by hand. The backend applies any pending schema changes from `database/migrations/` to `atlas.db` automatically on startup — a fresh clone gets a complete, working database the first time you run `node backend/server.js`. Migrations are tracked in a `migrations` table so each one only ever runs once, no matter how many times the server restarts.

To apply pending migrations without starting the server, run:

```bash
npm run migrate
```

Adding a new table or column later means adding a new numbered file to `database/migrations/` (see the existing ones for the pattern) — it'll be picked up automatically next run.

## Tests

```bash
npm test
```

Runs the full backend test suite (Jest + Supertest) against a throwaway SQLite database — never touches `atlas.db`, and never makes real OpenAI or Resend calls (both are mocked).

## Backups

Every time the backend starts, and every 6 hours it stays running, it takes a full snapshot of `atlas.db` into `backups/`. The last 30 snapshots are kept; older ones are deleted automatically. That folder is gitignored — it holds real customer data and should never be committed or shared.

## Known limitations

- Password-reset emails only deliver to the Resend account owner's own address until a real domain is verified with Resend (a paid step — see `.env.example` for `RESEND_API_KEY`).
- The app is not currently hosted anywhere; it runs on whichever computer starts it.
