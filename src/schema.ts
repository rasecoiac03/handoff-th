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
    createSubTask(jobId: ID!, description: String!, deadline: String, cost: Float): SubTask!
    updateSubTask(id: ID!, description: String, deadline: String, cost: Float): SubTask!
    deleteSubTask(id: ID!): Boolean!
    reorderSubTasks(jobId: ID!, orderedIds: [ID!]!): [SubTask!]!
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
    subtasks: [SubTask!]!
    currentVersion: Int!
    headVersion: Int!
    createdAt: String!
    updatedAt: String!
  }

  type SubTask {
    id: ID!
    jobId: String!
    description: String!
    deadline: String
    cost: Float
    position: Int!
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
    messages(limit: Int, before: String): MessageConnection!
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
    hasPreviousPage: Boolean!
    startCursor: String
  }

  type Message {
    id: ID!
    content: String!
    senderId: String!
    sender: User!
    jobId: String!
    jobDescription: String!
    createdAt: String!
  }

  type Subscription {
    messageAdded(jobId: ID!): Message!
  }

  type AuthPayload {
    token: String!
  }
`;

export default typeDefs;
