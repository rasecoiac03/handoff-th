import bcrypt from "bcryptjs";
import { GraphQLError } from "graphql";
import { Context } from "../../context.js";
import { signToken } from "./jwt.js";
import { loginSchema } from "./validators.js";
import { validateInput } from "../../utils/validation.js";

export const authResolvers = {
  Mutation: {
    login: async (
      _parent: unknown,
      args: { email: string; password: string },
      ctx: Context,
    ) => {
      const input = validateInput(loginSchema, args);

      const user = await ctx.prisma.user.findUnique({
        where: { email: input.email },
      });

      if (!user) {
        throw new GraphQLError("Invalid email or password", {
          extensions: { code: "UNAUTHENTICATED" },
        });
      }

      const valid = await bcrypt.compare(input.password, user.password);
      if (!valid) {
        throw new GraphQLError("Invalid email or password", {
          extensions: { code: "UNAUTHENTICATED" },
        });
      }

      return { token: signToken(user.id) };
    },
  },
};
