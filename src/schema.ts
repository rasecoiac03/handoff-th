const typeDefs = `#graphql
  type Query {
    health: String!
    jobs: [Job!]!
    job(id: ID!): Job
    jobHistory(jobId: ID!): [JobRevision!]!
  }

  type Mutation {
    login(email: String!, password: String!): AuthPayload!
    createJob(description: String!, location: String!): Job!
    updateJob(id: ID!, description: String, location: String, status: JobStatus, cost: Float): Job!
    deleteJob(id: ID!): Boolean!
    addHomeownerToJob(jobId: ID!, homeownerId: ID!): Job!
    sendMessage(jobId: ID!, content: String!): Message!
    undoJob(jobId: ID!): Job!
    redoJob(jobId: ID!): Job!
  }

  enum JobStatus {
    PLANNING
    IN_PROGRESS
    COMPLETED
    CANCELED
  }

  type User {
    id: ID!
    email: String!
    role: String!
    createdAt: String!
  }

  type Job {
    id: ID!
    description: String!
    location: String!
    status: JobStatus!
    cost: Float
    contractorId: String!
    contractor: User!
    homeowners: [User!]!
    chats: [Chat!]!
    currentVersion: Int!
    headVersion: Int!
    createdAt: String!
    updatedAt: String!
  }

  type JobRevision {
    id: ID!
    jobId: String!
    version: Int!
    snapshot: String!
    changedBy: User!
    createdAt: String!
  }

  type Chat {
    id: ID!
    jobId: String!
    participants: [User!]!
    messages(limit: Int, after: String): MessageConnection!
    createdAt: String!
  }

  type MessageConnection {
    edges: [MessageEdge!]!
    pageInfo: PageInfo!
  }

  type MessageEdge {
    cursor: String!
    node: Message!
  }

  type PageInfo {
    hasNextPage: Boolean!
    endCursor: String
  }

  type Message {
    id: ID!
    content: String!
    senderId: String!
    createdAt: String!
  }

  type AuthPayload {
    token: String!
  }
`;

export default typeDefs;
