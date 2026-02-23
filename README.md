# Renovation Tracker

GraphQL API for tracking renovation jobs, built with Apollo Server, TypeScript, Prisma, and PostgreSQL.

## Prerequisites

- Node.js 22.22.0 (use `nvm use` to activate)
- Docker and Docker Compose (or a PostgreSQL instance running locally / remote connection string)

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

The defaults in `.env.example` already match the Docker Compose database, so no edits are needed for local development.

### 3. Start PostgreSQL

```bash
docker compose up -d
```

This starts a PostgreSQL 17 container on port `5432` with the database `renovation_tracker`.

To stop it later:

```bash
docker compose down
```

To stop and **delete all data**:

```bash
docker compose down -v
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

This creates sample data: one contractor, one homeowner, one job linking them, a chat between them, and two sample messages.

### 6. Start the development server

```bash
npm run dev
```

The server starts at `http://localhost:4000`.

## GraphQL Playground

Open `http://localhost:4000` in your browser. Apollo Server serves the Apollo Sandbox landing page, which connects you to an interactive GraphQL explorer.

### Health check

```graphql
query {
  health
}
```

### Login (fake, retorna um token estático)

```graphql
mutation {
  login(email: "contractor@example.com", password: "123456") {
    token
  }
}
```

### Criar um job

```graphql
mutation {
  createJob(
    description: "Kitchen renovation"
    location: "São Paulo, SP"
    contractorId: "COLE_O_ID_DO_USER_AQUI"
  ) {
    id
    description
    location
    status
    createdAt
  }
}
```

### List jobs with contractor

```graphql
query {
  jobs {
    id
    description
    location
    status
    contractor {
      id
      email
      role
    }
    chats {
      id
      participants {
        id
        email
      }
    }
    createdAt
    updatedAt
  }
}
```

### List chats for a job (with paginated messages)

```graphql
query {
  chats(jobId: "JOB_ID_HERE") {
    id
    participants {
      id
      email
      role
    }
    messages(limit: 10) {
      edges {
        cursor
        node {
          id
          content
          senderId
          createdAt
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
}
```

To load the next page, pass `endCursor` as the `after` argument:

```graphql
query {
  chats(jobId: "JOB_ID_HERE") {
    messages(limit: 10, after: "CURSOR_FROM_PREVIOUS_PAGE") {
      edges {
        node {
          content
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
}
```

### Create a chat

```graphql
mutation {
  createChat(
    jobId: "JOB_ID_HERE"
    participantIds: ["USER_ID_1", "USER_ID_2"]
  ) {
    id
    participants {
      email
    }
  }
}
```

### Send a message

```graphql
mutation {
  sendMessage(
    chatId: "CHAT_ID_HERE"
    senderId: "USER_ID_HERE"
    content: "Hello, when do we start?"
  ) {
    id
    content
    createdAt
  }
}
```

## Tests

```bash
npm test
```

Tests use Vitest with a mocked Prisma context, no database required.

```bash
npm run test:watch
```

Runs tests in watch mode for development.

## DataLoader

Relation fields like `Job.contractor`, `Job.chats`, and `Chat.participants` use [DataLoader](https://github.com/graphql/dataloader) to batch database queries per request. Without it, querying a list of jobs would trigger a separate SQL query for each job's contractor and chats (the N+1 problem). DataLoader collects all IDs in a single tick and resolves them in one batched query.

`Chat.messages` uses cursor-based pagination directly via Prisma instead of DataLoader, since messages can grow unboundedly and must be paginated.

## Input Validation

Mutation inputs are validated with [Zod](https://zod.dev). Invalid input returns a `BAD_USER_INPUT` GraphQL error with details about the failing fields. Schemas live in `src/validators/`.

## Available Scripts

| Script                     | Description                      |
| -------------------------- | -------------------------------- |
| `npm run dev`              | Start dev server with hot reload |
| `npm run build`            | Compile TypeScript to `dist/`    |
| `npm start`                | Run compiled production build    |
| `npm test`                 | Run tests                        |
| `npm run test:watch`       | Run tests in watch mode          |
| `npm run prisma:migrate`   | Run Prisma migrations            |
| `npm run prisma:generate`  | Regenerate Prisma client         |
| `npm run prisma:seed`      | Seed database with sample data   |

## Project Structure

```
src/
  server.ts            Entry point
  schema.ts            GraphQL type definitions
  context.ts           Request context (Prisma + DataLoaders)
  resolvers/           GraphQL resolvers
  loaders/             DataLoader instances (N+1 prevention)
  validators/          Zod input schemas
  modules/             Business logic (auth, jobs, users)
  db/prisma.ts         Prisma client singleton
tests/                 Vitest test suite
prisma/
  schema.prisma        Database schema
  seed.ts              Seed script
```
