import type { Static, TTuple } from "typebox";
import { Value } from "typebox/value";

/**
 * A channel's `argumentsMatch`: whether the call's arguments, as one array, match a TypeBox tuple schema.
 * @example argumentsMatch: argumentsMatching(Type.Tuple([Credentials]))
 */
export function argumentsMatching<Schema extends TTuple>(
  schema: Schema,
): (args: unknown) => args is Static<Schema> {
  return (args: unknown): args is Static<Schema> => Value.Check(schema, args);
}
