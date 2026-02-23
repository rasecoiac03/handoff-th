import { GraphQLError } from "graphql";

export function validateInput<T>(
  schema: { parse: (data: unknown) => T },
  data: unknown,
): T {
  try {
    return schema.parse(data);
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Validation failed";
    throw new GraphQLError(message, {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }
}
