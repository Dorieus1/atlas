# ATLAS — Project Handover Summary

> **Purpose:** Complete handover document for the ATLAS project so development can continue in a new workspace without losing architecture, implementation history, current state, known issues, or next steps.
>
> **Last documented state:** August 11, 2026
>
> **Project root:** `~/Desktop/Atlas`

---

# 1. App Summary

## Product

**ATLAS** is a CRM and business-automation application intended for roofing companies and other small businesses.

The long-term product direction is an AI-powered business assistant that can:

- Manage businesses and customers
- Store customer profiles
- Track leads and lead status
- Track customer conversations
- Store customer notes
- Track activities
- Create and complete follow-up tasks
- Generate AI customer summaries
- Generate daily business briefings
- Generate AI recommendations/intelligence
- Generate SMS/email-style messages
- Generate follow-up messages
- Maintain customer-specific AI memory
- Use business-specific knowledge
- Use business profile information as context
- Eventually provide persistent, context-aware AI behavior across conversations

The core idea is that ATLAS should not behave like a generic chatbot. It should behave like an AI employee/receptionist that understands the business, its customers, prior interactions, and operational context.

---

# 2. Current Development State

A substantial portion of the CRM/application foundation has already been built.

The following areas have been implemented or substantially implemented:

- React/Vite frontend
- Tailwind-based styling
- Node/Express backend
- SQLite database
- JWT authentication
- Business isolation/business context
- Customer creation and customer listing
- Customer profile pages
- Lead pipeline
- Lead status updates
- Notes
- Activities
- Conversations
- Follow-up tasks
- Dashboard widgets
- AI customer summaries
- AI intelligence/recommendations
- AI-generated follow-up messaging
- Shared frontend API utility
- AI chat
- Initial customer-memory storage
- Business knowledge context
- AI business-profile context

The **next major development phase is persistent AI memory/context retention**.

---

# 3. Repository / Project Structure

The known ATLAS repository structure includes:

```text
Atlas/
├── ai/
├── assets/
├── automation/
├── backend/
├── database/
├── docs/
├── frontend/
├── testing/
├── atlas.db
├── package.json
└── package-lock.json
```

Important directories:

```text
frontend/
backend/
database/
```

The SQLite database is at the project root:

```text
~/Desktop/Atlas/atlas.db
```

The database support files are in:

```text
~/Desktop/Atlas/database/
```

Known database files:

```text
database/
├── db.js
├── setup.js
├── migrate.js
├── migrateLeads.js
├── migrateNotes.js
└── migrateActivities.js
```

---

# 4. Technology Architecture

## Frontend

The frontend uses:

- React
- Vite
- Tailwind CSS
- React Router

Frontend development server:

```text
http://localhost:5173/
```

The frontend communicates with the backend through HTTP API requests.

The shared frontend API utility is:

```text
frontend/src/api/atlasApi.js
```

---

## Backend

The backend uses:

- Node.js
- Express
- SQLite
- OpenAI API
- JWT authentication
- bcrypt-based password hashing/authentication

Backend server:

```text
http://localhost:5050/
```

API base:

```text
http://localhost:5050/api
```

The backend server file is:

```text
backend/server.js
```

---

## Database

Database engine:

```text
SQLite
```

Database file:

```text
atlas.db
```

Database connection module:

```text
database/db.js
```

The database is accessed by backend services/controllers.

---

## AI

ATLAS uses the OpenAI API through:

```text
backend/services/aiService.js
```

The current AI implementation uses:

```text
model: "gpt-5-mini"
```

The OpenAI client is initialized from:

```text
process.env.OPENAI_API_KEY
```

The project previously encountered OpenAI model-access issues:

- `429 RateLimitError` due to quota
- `404 NotFoundError` because the organization initially required verification for `gpt-5-mini`

The organization verification issue was addressed, and the current ATLAS chat has successfully generated a response. Therefore, the OpenAI → backend → frontend chat pipeline is currently operational.

---

# 5. Authentication Architecture

JWT authentication has been implemented.

The frontend stores the authentication token in:

```text
localStorage
```

The shared API utility retrieves it using:

```js
const token = localStorage.getItem("token");
```

Authenticated requests include:

```http
Authorization: Bearer <JWT>
```

The shared API helper automatically adds the authorization header when a token exists.

This was important because several API requests initially returned:

```text
401 Unauthorized
```

The authentication flow was subsequently corrected and a valid JWT token beginning with the expected JWT `eyJ...` format was obtained.

---

# 6. Shared Frontend API Layer

File:

```text
frontend/src/api/atlasApi.js
```

The shared request helper currently follows this architecture:

```js
const API = "http://localhost:5050/api";
```

Requests are made through a central `request()` function.

The helper:

1. Reads the JWT from `localStorage`
2. Adds `Content-Type: application/json`
3. Adds `Authorization: Bearer <token>` when available
4. Performs the request
5. Throws an error when the response is not successful
6. Returns parsed JSON

Known exported API functions include:

### Auth

```text
login
register
```

### Business

```text
getBusinesses
```

### Customers

```text
getCustomers
createCustomer
getCustomer
```

### Leads

```text
getLeads
updateLeadStatus
```

### Tasks

```text
getTasks
createTask
completeTask
```

### Knowledge

```text
getKnowledge
createKnowledge
```

### Dashboard

```text
getBriefing
getIntelligence
```

### Messages

```text
generateMessage
```

### Follow-up

```text
generateFollowUpMessage
```

### Activities

```text
getActivities
```

### Customer Profile

```text
getCustomerSummary
getConversations
getCustomerLead
getNotes
createNote
```

The shared API file previously contained duplicate exports for:

```text
getBriefing
getIntelligence
```

Those duplicate-export errors were fixed.

There was also a missing export issue involving:

```text
getFollowUpLead
```

which caused:

```text
SyntaxError: Importing binding name 'getFollowUpLead' is not found.
```

The API layer was subsequently reorganized around the functions actually used by the frontend.

---

# 7. Database Schema

The ATLAS database contains more than the four core CRM tables requested for this handover. The following are the important known tables/entities.

## 7.1 businesses

Stores business-level information used as AI context and for business isolation.

Known columns include:

```text
id
name
industry
phone
email
address
services
```

Example current database records:

```text
Atlas Roofing
Industry: Roofing
Phone: 555-555-5985
Email: contact@atlasroofing.com
Address: 123 Main Street
Services: Emergency roof repairs, inspections, solar roofing
```

and:

```text
Phoenix roofing co
Industry: roofing
Phone: 602-300-1234
Email: test@roofing.com
Address: Phoenix az
Services: roofing
```

These records were verified directly from SQLite.

---

# 7.2 users

Authentication/user table.

Known structure includes:

```text
id
business_id
name
email
password
created_at
```

The email field is unique.

Passwords are handled using password hashing rather than storing plaintext passwords.

Users are associated with businesses through:

```text
business_id
```

---

# 7.3 customers

Core CRM customer table.

Known fields include:

```text
id
business_id
name
email
created_at
```

Customers are associated with a business.

The database was directly inspected during development.

Example records previously found included:

```text
Michael | michael@test.com
michael@test.com | [blank email]
lemon | [blank email]
test customer | test@test.com
john lui | joghn@example
John Smith | john@example.com
```

A newer valid Michael record was created:

```text
Michael | michael@test.com
```

The duplicate/incorrect historical customer records remain in the database unless explicitly cleaned up later.

Important current data-integrity issue:

There are two business records, and the exact `business_id` associated with the current Michael customer was the next item intended to be verified.

The command for that verification is:

```bash
sqlite3 atlas.db "SELECT id, name, email, business_id FROM customers WHERE name='Michael';"
```

Do not assume which business Michael belongs to until this query is checked.

---

# 7.4 leads

Lead-management table.

Lead functionality currently supports:

- Customer association
- Business association
- Lead status
- Priority
- Interest/request
- Lead pipeline behavior

Known lead statuses used by the frontend include:

```text
new
contacted
qualified
closed
```

The lead system is integrated with AI/chat behavior.

The current chat controller contains simple buying-intent detection based on keywords such as:

```text
need
repair
estimate
price
```

When one of those signals is detected, ATLAS can create a lead and a follow-up task.

There is also an AI lead classifier in:

```text
backend/services/aiService.js
```

The classifier categorizes inquiries as:

```text
hot
warm
cold
```

with rules for:

### HOT

- Wants to buy
- Requests pricing
- Requests an estimate
- Wants service soon
- Has urgency

### WARM

- Interested
- Comparing options
- Wants information

### COLD

- General questions
- No buying intent

The classifier returns exactly one of:

```text
hot
warm
cold
```

---

# 7.5 notes

Customer notes are stored separately.

The frontend supports:

- Loading notes for a customer
- Adding a note
- Displaying notes on the customer profile

The relevant API functions are:

```text
getNotes(customerId)
createNote(customerId, note)
```

The migration file is:

```text
database/migrateNotes.js
```

---

# 7.6 activities

Activities provide an event/history layer around customer interactions.

The activity migration file is:

```text
database/migrateActivities.js
```

The chat controller creates activities for:

```text
message
ai_response
```

The activity API is exposed through:

```text
getActivities(customerId)
```

The intended role of activities is to provide an operational timeline for customer interactions and future AI context.

---

# 7.7 conversations

Conversation history is stored for customers.

The current chat flow saves:

```text
customer message
Atlas response
```

The customer profile displays conversation history.

The frontend API function is:

```text
getConversations(customerId)
```

The backend service used by chat is:

```text
backend/services/conversationService.js
```

The chat controller calls:

```js
saveConversation(
  customer_id,
  message,
  reply
);
```

---

# 7.8 memories

The `memories` table is the beginning of ATLAS's persistent AI memory layer.

Current memory service:

```text
backend/services/memoryService.js
```

Current memory creation service:

```text
backend/services/memoryCreationService.js
```

Current retrieval logic:

```js
SELECT memory
FROM memories
WHERE customer_id = ?
```

Current memory creation logic inserts:

```text
id
customer_id
memory
```

A UUID is generated for each memory.

The current implementation is intentionally simple. It retrieves customer memories and feeds them into the AI prompt.

---

# 7.9 knowledge

Business knowledge is used as additional AI context.

Known frontend functions:

```text
getKnowledge(businessId)
createKnowledge(businessId, title, content)
```

The backend knowledge service provides:

```text
getBusinessKnowledge
```

Knowledge is converted into AI prompt context as:

```text
title: content
```

This allows the AI to receive business-specific operational information in addition to the structured business profile.

---

# 7.10 tasks

ATLAS has a follow-up task system.

Known task fields include:

```text
id
customer_id
business_id
title
description
due_date
status
created_at
```

Tasks are created by the intelligence panel and chat buying-intent logic.

Task completion is implemented through:

```http
PATCH /api/tasks/:id
```

which changes the task status to:

```text
completed
```

---

# 8. Backend Architecture

The backend follows a controller/service/route structure.

Typical structure:

```text
backend/
├── controllers/
├── routes/
├── services/
└── server.js
```

The project currently uses services for database/business logic and controllers for HTTP request/response handling.

---

# 9. Customer Backend

Customer controller:

```text
backend/controllers/customerController.js
```

Known functionality:

### Create customer

Validates:

```text
name
```

and associates the customer with:

```text
req.user.business_id
```

The controller calls:

```text
createCustomerService
```

### Get customers

Uses:

```text
getCustomersByBusinessService(req.user.business_id)
```

This is important for business isolation.

### Get customer by ID

Uses:

```text
getCustomerByIdService(req.params.id)
```

Returns:

```text
404 Customer not found
```

when appropriate.

---

# 10. Task Backend

Task controller:

```text
backend/controllers/taskController.js
```

Task service:

```text
backend/services/taskService.js
```

Task routes:

```text
backend/routes/tasks.js
```

Implemented endpoints:

```http
POST /api/tasks
GET /api/tasks
PATCH /api/tasks/:id
```

Task creation requires:

```text
customer_id
business_id
title
```

Optional fields:

```text
description
due_date
```

Task completion sets:

```text
status = 'completed'
```

---

# 11. AI Service

File:

```text
backend/services/aiService.js
```

## generateAIResponse()

Signature:

```js
generateAIResponse(
  message,
  memories = [],
  knowledge = [],
  business = null
)
```

The AI receives four major context categories:

### Business profile

Current structured profile fields:

```text
Business Name
Industry
Phone
Email
Address
Services
```

### Business knowledge

Knowledge entries are converted into:

```text
title: content
```

### Customer memory

Memory entries are converted into a text block.

### Current customer message

The incoming customer message is included as the final customer input.

The prompt identifies the AI as:

```text
Atlas AI, a professional AI receptionist.
```

The response is generated through the OpenAI Responses API.

---

# 12. Current Chat Pipeline

The intended and currently working pipeline is:

```text
Frontend ChatWindow
        ↓
POST /api/chat
        ↓
chatController.js
        ↓
getCustomerMemories()
        ↓
getBusinessKnowledge()
        ↓
load business profile
        ↓
generateAIResponse()
        ↓
OpenAI API
        ↓
Atlas response
        ↓
saveConversation()
        ↓
createActivity(message)
        ↓
createActivity(ai_response)
        ↓
optional lead creation
        ↓
optional follow-up task
        ↓
optional customer memory creation
        ↓
JSON response to frontend
```

The frontend chat successfully displayed an Atlas response during the latest test, proving the main request/response path is operational.

---

# 13. Chat Controller

File:

```text
backend/controllers/chatController.js
```

Current dependencies include:

```text
generateAIResponse
getCustomerMemories
saveConversation
getBusinessKnowledge
createMemory
createActivity
createTask
createLead
```

The controller requires:

```text
business_id
customer_id
message
```

If any are missing, it returns:

```http
400
```

with:

```text
business_id, customer_id, and message are required
```

The controller:

1. Retrieves customer memories
2. Retrieves business knowledge
3. Retrieves the business record from SQLite
4. Generates the AI response
5. Saves the conversation
6. Records customer message activity
7. Records Atlas response activity
8. Checks simple buying-intent keywords
9. Creates a lead when buying intent is detected
10. Creates a follow-up task when buying intent is detected
11. Detects `"my name is"` and stores the full message as a memory
12. Returns the AI reply and memories used

---

# 14. Current Memory Implementation

The memory system is currently functional but primitive.

## Retrieval

`memoryService.js`:

```js
SELECT memory
FROM memories
WHERE customer_id = ?
```

This retrieves all memory rows associated with a customer.

## Creation

`memoryCreationService.js` inserts:

```text
id
customer_id
memory
```

using a generated UUID.

## Current automatic memory trigger

The chat controller currently has:

```js
if (
  message
    .toLowerCase()
    .includes("my name is")
) {
  await createMemory(
    customer_id,
    message
  );
}
```

Therefore, if a customer says something such as:

```text
My name is Michael.
```

the entire message is currently stored as memory.

This is only the initial implementation and should be improved.

---

# 15. Frontend Views Completed

Known frontend pages:

```text
frontend/src/pages/
├── Leads.jsx
├── Onboarding.jsx
├── Analytics.jsx
├── Customers.jsx
├── KnowledgeSetup.jsx
├── Dashboard.jsx
├── Login.jsx
├── CustomerProfile.jsx
├── Knowledge.jsx
└── Settings.jsx
```

---

# 16. Customer View

File:

```text
frontend/src/pages/Customers.jsx
```

Current functionality:

- Loads customers
- Displays customer cards
- Displays customer name
- Displays customer email
- Allows clicking a customer
- Navigates to:

```text
/customers/:id
```

It also renders:

```text
CustomerForm
```

for creating new customers.

---

# 17. Customer Form

File:

```text
frontend/src/components/CustomerForm.jsx
```

Current inputs:

```text
Customer name
Customer email
```

The form calls:

```text
createCustomer()
```

After creation it clears both inputs and calls:

```text
onCustomerCreated()
```

The frontend customer creation bug was identified and corrected.

The important issue was an argument-order mismatch between the API function and form.

The current intended API signature should be consistent with the form:

```js
createCustomer(
  name,
  email
)
```

while the backend determines the business through:

```text
req.user.business_id
```

Do not reintroduce a frontend-required `business_id` argument unless the backend architecture is intentionally changed.

Database inspection confirmed that a newly created Michael record correctly appeared as:

```text
Michael | michael@test.com
```

---

# 18. Customer Profile

File:

```text
frontend/src/pages/CustomerProfile.jsx
```

Current customer profile contains:

1. Customer header
2. Atlas Chat
3. AI Customer Summary
4. Lead Information
5. Notes
6. Conversation History

The profile loads:

```text
getCustomer()
getCustomerSummary()
getConversations()
getCustomerLead()
getNotes()
getBusinesses()
```

Lead status can be changed using:

```text
new
contacted
qualified
closed
```

Notes can be added from the profile.

---

# 19. Atlas Chat Frontend

File:

```text
frontend/src/components/ChatWindow.jsx
```

The component accepts:

```js
{
  business,
  customer
}
```

It:

- Loads existing conversations
- Displays customer messages
- Displays Atlas responses
- Maintains local chat state
- Displays typing status
- Sends messages to `/api/chat`
- Automatically scrolls to the latest message

The chat request contains:

```json
{
  "business_id": "business ID",
  "customer_id": "customer ID",
  "message": "customer message"
}
```

The chat component was previously not rendered anywhere.

It was then integrated into:

```text
CustomerProfile.jsx
```

The chat is now visible on the customer profile.

A test message successfully received an Atlas response.

---

# 20. Important Current Business Context Issue

The database currently contains two business records:

```text
Atlas Roofing
```

and:

```text
Phoenix roofing co
```

Both are roofing businesses.

The exact records verified from SQLite were:

```text
ec5380e6-2f6e-4e33-a5be-5db735a89e83
Atlas Roofing
Roofing
555-555-5985
contact@atlasroofing.com
123 Main Street
Emergency roof repairs, inspections, solar roofing
```

and:

```text
c2bdef08-4e0d-4923-8990-9d599f5a7e13
Phoenix roofing co
roofing
602-300-1234
test@roofing.com
Phoenix az
roofing
```

During chat testing, the user sent:

```text
Hi, my name is Michael. I need an estimate for repairing my AC as soon as possible.
```

Atlas responded that the business was a roofing company.

That response is consistent with the business records currently stored.

However, the exact `business_id` attached to Michael had not yet been verified at the time of this handover.

The next diagnostic command is:

```bash
sqlite3 atlas.db "SELECT id, name, email, business_id FROM customers WHERE name='Michael';"
```

The purpose is to determine which business profile is being passed into Atlas Chat.

**Do not delete either business record until the business/customer relationship is understood.**

---

# 21. Dashboard

The dashboard page is:

```text
frontend/src/pages/Dashboard.jsx
```

It currently composes several dashboard components.

Known dashboard components:

```text
frontend/src/components/dashboard/
├── ActivityFeed.jsx
├── DailyBriefing.jsx
├── FollowUpAssistant.jsx
├── IntelligencePanel.jsx
├── KnowledgeEditor.jsx
├── KnowledgePanel.jsx
├── Recommendations.jsx
├── StatCard.jsx
└── TaskPanel.jsx
```

---

# 22. Dashboard Page Composition

The dashboard currently renders:

```text
Dashboard
DailyBriefing
IntelligencePanel
TaskPanel
KnowledgePanel
KnowledgeEditor
LeadPipeline
FollowUpAssistant
```

This creates the main ATLAS business-operations dashboard.

---

# 23. Daily Briefing

File:

```text
frontend/src/components/dashboard/DailyBriefing.jsx
```

Calls:

```text
/api/briefing
```

Displays:

```text
Total Leads
Hot Leads
Pending Tasks
```

and a generated briefing.

---

# 24. Intelligence Panel

File:

```text
frontend/src/components/dashboard/IntelligencePanel.jsx
```

Calls:

```text
/api/intelligence
```

Displays AI recommendations.

Recommendations contain concepts such as:

```text
customer
priority
status
reason
recommended action
```

Actions include:

```text
Create Follow-Up
SMS
Email
```

The Create Follow-Up action creates a task through:

```text
POST /api/tasks
```

The SMS/Email buttons call:

```text
/api/messages
```

---

# 25. Task Panel

File:

```text
frontend/src/components/dashboard/TaskPanel.jsx
```

Calls:

```text
GET /api/tasks
```

Displays:

```text
Follow-Up Tasks
```

Users can complete pending tasks using:

```text
PATCH /api/tasks/:id
```

---

# 26. Follow-Up Assistant

File:

```text
frontend/src/components/dashboard/FollowUpAssistant.jsx
```

Loads leads from:

```text
/api/leads
```

Selects a lead and displays:

```text
Customer
Email
Status
Priority
Request/Interest
```

It can call:

```text
POST /api/follow-up-message
```

to generate an AI follow-up message.

---

# 27. Lead Pipeline

The dashboard also includes:

```text
frontend/src/components/LeadPipeline.jsx
```

The lead system supports status updates and customer/lead relationship management.

---

# 28. Knowledge System

Business knowledge is intended to let a business owner teach ATLAS business-specific facts.

Relevant frontend components:

```text
KnowledgePanel.jsx
KnowledgeEditor.jsx
```

Relevant page:

```text
Knowledge.jsx
KnowledgeSetup.jsx
```

Relevant API functions:

```text
getKnowledge
createKnowledge
```

Relevant backend service:

```text
knowledgeService.js
```

The AI service includes this knowledge in its prompt.

---

# 29. Current Goal: Persistent AI Memory + Context Retention

This is the **next major development phase**.

The objective is to turn ATLAS from an AI that only sees the current message plus basic context into an AI that maintains useful, persistent customer context.

The intended context stack is:

```text
Business Profile
        +
Business Knowledge
        +
Customer Profile
        +
Customer Memories
        +
Conversation History
        +
Activities
        +
Lead Information
        +
Tasks
        +
Current Message
        ↓
ATLAS AI
```

The AI should be able to maintain continuity across multiple conversations.

Example:

Customer says:

```text
My name is Michael.
```

Later:

```text
I need a roof inspection.
```

ATLAS should know the customer is Michael without requiring the customer to repeat it.

Later:

```text
Can you remind me what we discussed last time?
```

ATLAS should have relevant prior context available.

---

# 30. Immediate Next Coding Tasks

## Step 1 — Verify Michael's business association

Run:

```bash
cd ~/Desktop/Atlas

sqlite3 atlas.db "SELECT id, name, email, business_id FROM customers WHERE name='Michael';"
```

This must be verified before changing business-selection logic.

---

## Step 2 — Verify the customer profile/business relationship

The customer returned by:

```text
GET /api/customers/:id
```

must include the correct:

```text
business_id
```

The frontend currently loads businesses and selects the business matching the customer's `business_id`.

The correct architecture is:

```text
Customer
   ↓
customer.business_id
   ↓
Business
   ↓
Business profile + knowledge
   ↓
Chat
```

---

## Step 3 — Replace primitive memory extraction

Current memory detection:

```js
message.toLowerCase().includes("my name is")
```

is only a prototype.

The next implementation should extract actual facts rather than storing entire messages.

Example:

```text
Customer:
"My name is Michael and I prefer morning appointments."

Current:
"my name is Michael and I prefer morning appointments."

Desired memories:
- Customer's name is Michael
- Customer prefers morning appointments
```

The AI should eventually determine whether a message contains a durable fact worth remembering.

---

## Step 4 — Add structured memory metadata

The current memory table only stores:

```text
id
customer_id
memory
```

The next memory-layer iteration should consider adding fields such as:

```text
business_id
memory_type
source
importance
created_at
updated_at
```

Possible memory types:

```text
identity
preference
property
service_history
communication_preference
personal_context
business_context
```

Do not implement these fields blindly; first inspect the current `memories` schema with:

```bash
sqlite3 atlas.db ".schema memories"
```

---

## Step 5 — Build a dedicated memory extraction service

Current files:

```text
backend/services/memoryService.js
backend/services/memoryCreationService.js
```

A dedicated extraction layer should eventually:

1. Receive the latest customer message
2. Receive relevant existing context
3. Ask the AI whether there are durable facts
4. Return structured memory candidates
5. Validate the result
6. Avoid storing irrelevant conversation
7. Avoid duplicate memories
8. Store only useful information

Example conceptual output:

```json
[
  {
    "memory": "Customer's name is Michael",
    "type": "identity",
    "importance": 0.9
  },
  {
    "memory": "Customer prefers morning appointments",
    "type": "preference",
    "importance": 0.7
  }
]
```

---

## Step 6 — Add memory deduplication/update logic

Before creating a new memory, ATLAS should check whether a similar memory already exists.

For example, it should not store:

```text
Customer's name is Michael
Customer's name is Michael
Customer's name is Michael
```

as three independent memories.

Instead, the memory system should update or ignore duplicates.

---

## Step 7 — Improve memory retrieval

Current retrieval:

```sql
SELECT memory
FROM memories
WHERE customer_id = ?
```

works for a prototype but will eventually become inefficient as memory volume grows.

The next version should retrieve:

- relevant memories
- high-importance memories
- recent memories
- potentially memory categories
- potentially business-specific memories

Eventually, semantic retrieval/vector search may be appropriate, but the immediate goal should remain a reliable SQLite-based memory layer.

---

## Step 8 — Add conversation context to AI prompts

Currently the AI receives:

```text
Business Profile
Business Knowledge
Customer Memory
Current Customer Message
```

The next improvement should add relevant prior conversation context.

Conceptually:

```text
BUSINESS PROFILE
+
BUSINESS KNOWLEDGE
+
CUSTOMER PROFILE
+
CUSTOMER MEMORY
+
RECENT CONVERSATION
+
RELEVANT ACTIVITIES
+
LEAD STATUS
+
TASK CONTEXT
+
CURRENT MESSAGE
```

This should be assembled by a dedicated context-building service rather than putting all database queries directly inside `chatController.js`.

---

# 31. Recommended Context Architecture

The next major backend abstraction should be a service similar to:

```text
backend/services/contextService.js
```

Conceptually:

```js
buildCustomerContext(
  business_id,
  customer_id
)
```

It should retrieve and assemble:

```text
business
knowledge
customer
memories
conversations
activities
lead
tasks
```

Then:

```text
chatController
        ↓
buildCustomerContext()
        ↓
generateAIResponse()
        ↓
OpenAI
```

This will keep `chatController.js` from becoming a large collection of unrelated database queries.

---

# 32. Desired Future AI Architecture

The target architecture is:

```text
                    ┌──────────────────────┐
                    │      CUSTOMER        │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │    CHAT WINDOW       │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │   /api/chat          │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │ CONTEXT SERVICE      │
                    └──────────┬───────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ▼                ▼                ▼
        Business          Customer         Memory
        Profile           Profile          Store
              │                │                │
              └────────────────┼────────────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ▼                ▼                ▼
         Knowledge       Conversations      Activities
              │                │                │
              └────────────────┼────────────────┘
                               │
                               ▼
                         Lead + Tasks
                               │
                               ▼
                    ┌──────────────────────┐
                    │  AI CONTEXT BUILDER  │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │     OPENAI API       │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │    ATLAS RESPONSE    │
                    └──────────┬───────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
        Conversation        Activity        Memory
           Store             Store          Extraction
```

---

# 33. Known Current Routes

The following routes/functionality are known from the current implementation.

## Authentication

```text
POST /api/auth/login
POST /api/auth/register
```

## Businesses

```text
GET /api/business
```

## Customers

```text
GET /api/customers
POST /api/customers
GET /api/customers/:id
```

## Leads

```text
GET /api/leads
PATCH /api/leads/:id
GET /api/leads/customer/:id
```

## Tasks

```text
GET /api/tasks
POST /api/tasks
PATCH /api/tasks/:id
```

## Knowledge

```text
GET /api/knowledge/:businessId
POST /api/knowledge
```

## Dashboard

```text
GET /api/briefing
GET /api/intelligence
```

## Messages

```text
POST /api/messages
```

## Follow-up

```text
POST /api/follow-up-message
```

## Activities

```text
GET /api/activities/:customerId
```

## Customer Summary

```text
GET /api/customer-summary/:id
```

## Conversations

```text
GET /api/conversations/:id
```

## Notes

```text
GET /api/notes/:id
POST /api/notes
```

## Chat

```text
POST /api/chat
```

The chat route uses:

```text
backend/routes/chat.js
```

and:

```text
backend/controllers/chatController.js
```

---

# 34. Important Development Lessons / Constraints

The developer workflow for this project should preserve these practices:

## Give complete files when possible

The user prefers **full replacement files** rather than fragmented code snippets when a file needs substantial modification.

This reduces:

- missing braces
- duplicated exports
- misplaced code
- partial edits
- syntax errors
- confusion about where code belongs

This was especially important because the project previously encountered:

```text
Duplicated export 'getBriefing'
Duplicated export 'getIntelligence'
```

and:

```text
Expected `}` but found `EOF`
```

due to partial/incorrect edits.

---

## Be explicit with terminal instructions

The user is still learning the Node/React project structure.

Instructions should clearly specify:

1. Exact directory
2. Exact command
3. Exact file path
4. Whether to replace the whole file
5. Exactly what output to paste back

Avoid instructions such as:

```text
"update the function"
```

without specifying where and how.

---

# 35. Current Important Files

### Frontend

```text
frontend/src/api/atlasApi.js
frontend/src/pages/CustomerProfile.jsx
frontend/src/pages/Customers.jsx
frontend/src/pages/Dashboard.jsx
frontend/src/components/ChatWindow.jsx
frontend/src/components/CustomerForm.jsx
frontend/src/components/LeadPipeline.jsx
frontend/src/components/dashboard/DailyBriefing.jsx
frontend/src/components/dashboard/IntelligencePanel.jsx
frontend/src/components/dashboard/TaskPanel.jsx
frontend/src/components/dashboard/FollowUpAssistant.jsx
frontend/src/components/dashboard/KnowledgePanel.jsx
frontend/src/components/dashboard/KnowledgeEditor.jsx
```

### Backend

```text
backend/server.js
backend/controllers/chatController.js
backend/controllers/customerController.js
backend/controllers/taskController.js
backend/services/aiService.js
backend/services/memoryService.js
backend/services/memoryCreationService.js
backend/services/customerService.js
backend/services/taskService.js
backend/services/conversationService.js
backend/services/knowledgeService.js
backend/services/activityService.js
backend/services/leadService.js
```

### Database

```text
database/db.js
database/setup.js
database/migrate.js
database/migrateLeads.js
database/migrateNotes.js
database/migrateActivities.js
atlas.db
```

---

# 36. Current Verified Functional State

Based on the latest development work:

### Working / substantially implemented

- Frontend runs with Vite
- Backend runs on port 5050
- SQLite database is active
- JWT authentication is active
- Customers can be created
- Customers can be listed
- Customer profiles work
- Customer notes work
- Customer lead information is displayed
- Lead status can be changed
- Conversation history is displayed
- Dashboard is populated with multiple operational panels
- Follow-up tasks can be created
- Follow-up tasks can be completed
- AI summaries are integrated
- AI intelligence/recommendations are integrated
- AI follow-up messaging is integrated
- Business knowledge is integrated into AI prompts
- Customer memory retrieval is integrated into AI prompts
- Customer memory creation is partially integrated
- Atlas Chat is now visible on Customer Profile
- Atlas Chat successfully generated a response through the OpenAI pipeline

### Not finished / needs improvement

- Robust persistent memory extraction
- Structured memory types
- Memory deduplication
- Memory updating
- Relevance-based memory retrieval
- Full conversation-context retrieval
- Unified context-building service
- Stronger lead-intent extraction
- More sophisticated AI context management
- Business/customer context verification
- Cleanup of duplicate/incorrect test customer records
- Potential cleanup of duplicate/test businesses

---

# 37. Immediate Development Sequence

The safest next development order is:

```text
1. Verify Michael's business_id
        ↓
2. Verify ChatWindow is using the correct business
        ↓
3. Inspect the exact memories schema
        ↓
4. Build contextService.js
        ↓
5. Move context retrieval out of chatController
        ↓
6. Add recent conversation context
        ↓
7. Improve memory extraction
        ↓
8. Add structured memory metadata
        ↓
9. Add memory deduplication/update
        ↓
10. Improve relevance-based memory retrieval
        ↓
11. Test persistent memory across multiple conversations
        ↓
12. Add stronger AI lead/context reasoning
```

---

# 38. First Commands to Run in the New Workspace

After moving the project, verify:

```bash
cd ~/Desktop/Atlas
```

Then:

```bash
ls
```

Then:

```bash
ls frontend/src
```

Then:

```bash
ls backend
```

Then:

```bash
ls database
```

Then verify the database:

```bash
sqlite3 atlas.db ".tables"
```

Then inspect the current memory schema:

```bash
sqlite3 atlas.db ".schema memories"
```

Then inspect the customer/business relationship:

```bash
sqlite3 atlas.db "SELECT id, name, email, business_id FROM customers WHERE name='Michael';"
```

Then inspect businesses:

```bash
sqlite3 atlas.db "SELECT id, name, industry, phone, email, address, services FROM businesses;"
```

---

# 39. Critical Handover Point

The project should **not** restart from scratch.

The correct state is:

```text
CRM foundation
        ↓
Authentication
        ↓
Customer management
        ↓
Leads
        ↓
Tasks
        ↓
Notes
        ↓
Activities
        ↓
Conversation history
        ↓
Business knowledge
        ↓
AI summaries/intelligence
        ↓
AI Chat
        ↓
Initial memory system
        ↓
>>> CURRENT DEVELOPMENT POINT <<<
Persistent AI context + memory architecture
```

The current priority is **not** rebuilding the CRM.

The current priority is making the existing ATLAS AI substantially more context-aware and persistent.

---

# 40. Final Project Objective

The long-term ATLAS behavior should be:

> A business owner can give ATLAS information once, and ATLAS should retain the useful information, understand which customer/business it belongs to, retrieve it when relevant, and use it naturally in future interactions.

The system should eventually combine:

```text
Structured database data
+
Business knowledge
+
Customer profile
+
Persistent memories
+
Conversation history
+
Activities
+
Leads
+
Tasks
+
AI reasoning
```

into one reliable context layer.

The key architectural principle going forward is:

**Do not make the AI depend on the frontend to remember context. The backend/database must own persistent context.**

The frontend should provide the current interaction; ATLAS's backend should reconstruct the relevant context from SQLite and supply that context to the OpenAI model.

---

# HANDOVER END

## Current next action

Verify Michael's business association:

```bash
cd ~/Desktop/Atlas
sqlite3 atlas.db "SELECT id, name, email, business_id FROM customers WHERE name='Michael';"
```

Then inspect the memory schema:

```bash
sqlite3 atlas.db ".schema memories"
```

Those two outputs should be treated as the starting point for the next implementation session.
