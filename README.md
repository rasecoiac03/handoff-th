# Renovation Tracker

GraphQL API for tracking renovation jobs, built with Apollo Server, TypeScript, Prisma, and PostgreSQL.

## Prerequisites

- Node.js 22.22.0 (use `nvm use` to activate)
- Docker and Docker Compose (or PostgreSQL + Redis instances running locally / remote connection strings)

## Getting Started

### 1. Install dependencies

```bash
nvm use
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

The defaults in `.env.example` already match the Docker Compose services. Set `JWT_SECRET` to a random string for production.

### 3. Start PostgreSQL and Redis

```bash
docker compose up -d
```

### 4. Run database migrations

```bash
npx prisma generate
npx prisma migrate dev --name init
```

### 5. Seed the database (optional)

```bash
npm run prisma:seed
```

This creates:

- Contractor: `contractor@example.com` / `changeme`
- Homeowner: `homeowner@example.com` / `changeme`
- One job with a chat and sample messages

### 6. Start the development server

```bash
npm run dev
```

The server starts at `http://localhost:4000`.

## Authentication

The API uses JWT-based authentication. To access protected endpoints:

### 1. Login to get a token

```graphql
mutation {
  login(email: "contractor@example.com", password: "changeme") {
    token
  }
}
```

### 2. Include the token in subsequent requests

Set the `Authorization` header:

```
Authorization: Bearer <your-token-here>
```

In Apollo Sandbox, use the "Headers" tab at the bottom of the operation editor.

## Roles

| Role       | Can do                                                      |
| ---------- | ----------------------------------------------------------- |
| CONTRACTOR | Create, update, delete jobs. Add homeowners. Send messages. |
| HOMEOWNER  | View assigned jobs. Send messages on assigned jobs.         |

The `jobs` query is automatically scoped by role:

- **CONTRACTOR** sees jobs they created
- **HOMEOWNER** sees jobs they are assigned to

## GraphQL Examples

### Health check (no auth required)

```graphql
query {
  health
}
```

### List your jobs (auth required)

```graphql
query {
  jobs {
    id
    description
    location
    status
    cost
    contractor {
      email
    }
    homeowners {
      email
    }
    createdAt
  }
}
```

### Get a single job

```graphql
query {
  job(id: "JOB_ID") {
    id
    description
    status
    contractor {
      email
    }
    homeowners {
      email
    }
    chats {
      messages(limit: 10) {
        edges {
          node {
            content
            senderId
            createdAt
          }
        }
        pageInfo {
          hasPreviousPage
          startCursor
        }
      }
    }
  }
}
```

### Create a job (contractor only)

```graphql
mutation {
  createJob(description: "Kitchen renovation", location: "São Paulo, SP") {
    id
    description
    status
  }
}
```

### Update a job (contractor only, own jobs)

```graphql
mutation {
  updateJob(id: "JOB_ID", status: IN_PROGRESS, cost: 15000) {
    id
    status
    cost
  }
}
```

### Delete a job (contractor only, own jobs)

```graphql
mutation {
  deleteJob(id: "JOB_ID")
}
```

### Add a homeowner to a job (contractor only)

```graphql
mutation {
  addHomeownerToJob(jobId: "JOB_ID", homeownerId: "HOMEOWNER_ID") {
    id
    homeowners {
      id
      email
    }
  }
}
```

### Send a message (contractor or assigned homeowner)

```graphql
mutation {
  sendMessage(jobId: "JOB_ID", content: "When do we start?") {
    id
    content
    createdAt
  }
}
```

## History & Undo/Redo

Jobs support full history tracking with undo and redo capabilities using **snapshot-based versioning**.

### How it works

Every time a Job is created or updated, a `JobRevision` is saved containing a JSON snapshot of the Job's scalar fields (`description`, `location`, `status`, `cost`, `updatedAt`). The `Job` model tracks two pointers:

- **`currentVersion`** — the version the Job is currently at
- **`headVersion`** — the highest version ever written

This makes undo/redo O(1) lookups: undo decrements `currentVersion`, redo increments it, and the Job fields are restored from the corresponding snapshot. When a new edit is made from a non-head version, all future revisions (the redo stack) are discarded, and the new revision becomes the head.

All version mutations run inside Prisma transactions for data integrity.

### Why snapshots over event sourcing

Snapshot versioning is simpler to implement and reason about. Each revision is self-contained — there's no need to replay a chain of events to reconstruct state. This is a good fit for a system with a small number of mutable fields and straightforward undo/redo requirements.

### Authorization

- **Contractors** can undo and redo their own jobs
- **Contractors and Homeowners** can view history for jobs they have access to

### GraphQL examples

#### View job history

```graphql
query {
  jobHistory(jobId: "JOB_ID") {
    version
    snapshot
    changedBy {
      email
    }
    createdAt
  }
}
```

#### Undo a job change (contractor only)

```graphql
mutation {
  undoJob(jobId: "JOB_ID") {
    id
    description
    status
    currentVersion
    headVersion
  }
}
```

#### Redo a job change (contractor only)

```graphql
mutation {
  redoJob(jobId: "JOB_ID") {
    id
    description
    status
    currentVersion
    headVersion
  }
}
```

## Real-time Messaging (Subscriptions)

The API supports live messaging via **GraphQL Subscriptions** over WebSocket. When a message is sent via `sendMessage`, all clients subscribed to that job receive it instantly.

### Architecture

- **HTTP** (`/graphql`) — queries and mutations via Apollo Server + Express
- **WebSocket** (`ws://localhost:4000/graphql`) — subscriptions via `graphql-ws` + `ws`
- **PubSub** — Redis-backed `RedisPubSub` from `graphql-redis-subscriptions` using `ioredis`

> Redis PubSub allows horizontal scaling across multiple server instances. Each instance connects to the same Redis broker, so subscription events are delivered regardless of which instance the client is connected to. The `REDIS_URL` environment variable configures the connection (defaults to `redis://localhost:6379`).

### Authorization

Only users with access to the job (contractor who owns it or assigned homeowners) can subscribe to its messages. Auth is validated at WebSocket connection time via `connectionParams`.

### Connecting with auth

Pass the JWT token in `connectionParams` when establishing the WebSocket connection:

```json
{
  "Authorization": "Bearer <your-token>"
}
```

In Apollo Sandbox, go to the connection settings and add the `Authorization` parameter.

### Example subscription

```graphql
subscription OnMessage($jobId: ID!) {
  messageAdded(jobId: $jobId) {
    id
    content
    sender {
      id
      email
      role
    }
    jobId
    jobDescription
    createdAt
  }
}
```

Then, in another tab/client, send a message:

```graphql
mutation {
  sendMessage(jobId: "JOB_ID", content: "Hello from the other side!") {
    id
    content
  }
}
```

The subscription tab will receive the new message in real time.

### Recommended client pattern

Subscriptions only deliver messages sent **after** the client connects. To load an existing conversation and then continue in real time without losing messages, the recommended approach is **subscribe first, load history second, deduplicate by ID**:

1. **Subscribe** — start `messageAdded(jobId)` immediately and buffer incoming events in memory
2. **Load history** — fetch existing messages via the HTTP query below
3. **Merge** — combine history + buffered events, deduplicate using `message.id` (UUID), sort by `createdAt`
4. **Render** — from this point, append new subscription events directly to the list

By subscribing before loading history, the client guarantees no messages are lost in the gap between the two requests. Duplicates (a message that arrives via both the query and the subscription) are trivially filtered by ID.

#### Loading message history

```graphql
query ChatHistory($jobId: ID!) {
  job(id: $jobId) {
    chats {
      messages(limit: 50) {
        edges {
          node {
            id
            content
            sender {
              id
              email
              role
            }
            jobId
            jobDescription
            createdAt
          }
        }
        pageInfo {
          hasPreviousPage
          startCursor
        }
      }
    }
  }
}
```

Messages are returned newest-first (most recent `limit` messages, in chronological order). To load older messages, pass `pageInfo.startCursor` as the `before` argument.

## Tests

```bash
npm test
```

Tests use Vitest with a mocked Prisma context, no database required.

## DataLoader

Relation fields like `Job.contractor`, `Job.chats`, and `Chat.participants` use [DataLoader](https://github.com/graphql/dataloader) to batch database queries per request, preventing N+1 query problems.

`Chat.messages` uses cursor-based pagination directly via Prisma, since messages can grow unboundedly.

## Input Validation

Mutation inputs are validated with [Zod](https://zod.dev). Invalid input returns a `BAD_USER_INPUT` GraphQL error. Schemas live in each module's `validators.ts`.

## Available Scripts

| Script                    | Description                       |
| ------------------------- | --------------------------------- |
| `npm run dev`             | Start dev server with hot reload  |
| `npm run build`           | Compile TypeScript to `dist/`     |
| `npm start`               | Run compiled production build     |
| `npm test`                | Run tests                         |
| `npm run test:watch`      | Run tests in watch mode           |
| `npm run prisma:migrate`  | Run Prisma migrations             |
| `npm run prisma:generate` | Regenerate Prisma client          |
| `npm run prisma:seed`     | Seed database with sample data    |
| `npm run prisma:reset`    | Drop DB, re-run migrations + seed |
| `npm run env:restart`     | Full env refresh (see below)      |
| `npm run test:coverage`   | Run tests with coverage report    |

### Full environment refresh

After pulling new changes (schema updates, new migrations, etc.), run:

```bash
npm run env:restart
```

This single command restarts Docker (PostgreSQL + Redis), runs all Prisma migrations, and re-seeds the database. Useful to get a clean environment for testing.

## Assumptions & Tradeoffs

| Decision                                            | Rationale                                                                                                                                                                   |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Snapshot-based versioning** over event sourcing   | Each `JobRevision` is self-contained — no need to replay a chain of events to reconstruct state. Simpler to implement and reason about for a bounded set of mutable fields. |
| **Redis PubSub** for subscriptions                  | Enables horizontal scaling across multiple server instances. A single-instance in-memory PubSub would suffice for a demo, but Redis demonstrates production-readiness.      |
| **Cursor-based pagination** for messages            | Messages can grow unboundedly, so offset-based pagination would degrade. Cursor-based (`before`/`startCursor`) is efficient and consistent even under concurrent writes.    |
| **DataLoader per-request** (no cross-request cache) | Prevents N+1 queries within a single GraphQL resolution tree while avoiding stale data across requests.                                                                     |
| **JWT with hardcoded secret**                       | Acceptable for a take-home demo. Production would use env-injected secrets, token rotation, and refresh tokens.                                                             |
| **Chat model** between Job and Message              | Adds a layer of separation so messages aren't directly coupled to jobs. Supports future features like group chats or multiple threads per job.                              |
| **No frontend**                                     | API is tested via GraphQL Playground / Apollo Sandbox, as specified. README includes copy-paste examples.                                                                   |
| **Zod for input validation**                        | Catches invalid input at the resolver boundary before hitting the database, returning clear `BAD_USER_INPUT` errors.                                                        |

## AI Tools

This project was developed with the assistance of **Cursor AI** (Claude, Anthropic). Cursor was used for code generation, architecture planning, test scaffolding, and documentation. All code was reviewed, understood, and validated by the developer.

## Project Structure

```
src/
  server.ts                  Entry point (HTTP + WebSocket)
  schema.ts                  GraphQL type definitions
  context.ts                 Request context (HTTP + WS auth)
  resolvers/index.ts         Resolver aggregation
  modules/
    auth/
      jwt.ts                 JWT sign/verify
      guard.ts               Auth & role guards
      resolvers.ts           Login mutation
      validators.ts          Login validation
    jobs/
      resolvers.ts           Job CRUD + addHomeowner
      history.ts             Undo/redo/history resolvers
      validators.ts          Job input validation
    messages/
      resolvers.ts           sendMessage + Chat field resolvers
      subscriptions.ts       messageAdded subscription
      validators.ts          Message validation
  realtime/pubsub.ts         PubSub singleton + topic helpers
  loaders/                   DataLoader instances
  utils/validation.ts        Shared validation helper
  db/prisma.ts               Prisma client singleton
tests/                       Vitest test suite
prisma/
  schema.prisma              Database schema
  seed.ts                    Seed script
```
