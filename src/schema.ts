const typeDefs = `#graphql
  type Query {
    health: String!
    jobs: [Job!]!
  }

  type Mutation {
    login(email: String!, password: String!): AuthPayload!
    createJob(description: String!, location: String!, contractorId: String!): Job!
  }

  enum JobStatus {
    PLANNING
    IN_PROGRESS
    COMPLETED
    CANCELED
  }

  type Job {
    id: ID!
    description: String!
    location: String!
    status: JobStatus!
    cost: Float
    contractorId: String!
    createdAt: String!
    updatedAt: String!
  }

  type AuthPayload {
    token: String!
  }
`;

export default typeDefs;
