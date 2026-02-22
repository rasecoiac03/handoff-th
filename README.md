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

### 5. Start the development server

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

### Listar todos os jobs

```graphql
query {
  jobs {
    id
    description
    location
    status
    cost
    contractorId
    createdAt
    updatedAt
  }
}
```

### Seed rápido via Prisma Studio

Para criar um usuário manualmente e ter um `contractorId` para usar na mutation `createJob`:

```bash
npx prisma studio
```

Isso abre uma interface web em `http://localhost:5555`. Crie um registro na tabela `User` com os campos:

| Campo    | Valor                      |
| -------- | -------------------------- |
| email    | contractor@example.com     |
| password | 123456                     |
| role     | CONTRACTOR                 |

Copie o `id` gerado e use como `contractorId` na mutation `createJob`.

## Available Scripts

| Script               | Description                          |
| -------------------- | ------------------------------------ |
| `npm run dev`        | Start dev server with hot reload     |
| `npm run build`      | Compile TypeScript to `dist/`        |
| `npm start`          | Run compiled production build        |
| `npm run prisma:migrate`  | Run Prisma migrations           |
| `npm run prisma:generate` | Regenerate Prisma client        |

## Project Structure

```
src/
  server.ts          Entry point
  schema.ts          GraphQL type definitions
  context.ts         Request context (Prisma injection)
  resolvers/         GraphQL resolvers
  modules/           Business logic (auth, jobs, users)
  db/prisma.ts       Prisma client singleton
prisma/
  schema.prisma      Database schema
```
