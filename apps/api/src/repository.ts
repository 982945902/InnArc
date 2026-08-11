import { Context, Effect, Either, Layer, Ref } from "effect";
import { SessionNotFound, type DomainError } from "./errors.js";
import type { SessionRecord } from "./model.js";

export interface SessionRepositoryService {
  readonly get: (id: string) => Effect.Effect<SessionRecord, DomainError>;
  readonly put: (record: SessionRecord) => Effect.Effect<void, DomainError>;
  readonly modify: (
    id: string,
    change: (record: SessionRecord) => Either.Either<SessionRecord, DomainError>
  ) => Effect.Effect<SessionRecord, DomainError>;
}

export class SessionRepository extends Context.Tag("@heart-mirror/SessionRepository")<
  SessionRepository,
  SessionRepositoryService
>() {}

export const InMemorySessionRepository = Layer.effect(
  SessionRepository,
  Effect.gen(function* () {
    const state = yield* Ref.make(new Map<string, SessionRecord>());

    return {
      get: (id) =>
        Ref.get(state).pipe(
          Effect.flatMap((records) => {
            const record = records.get(id);
            return record
              ? Effect.succeed(record)
              : Effect.fail(new SessionNotFound({ sessionId: id }));
          })
        ),
      put: (record) =>
        Ref.update(state, (records) => {
          const next = new Map(records);
          next.set(record.id, record);
          return next;
        }),
      modify: (id, change) =>
        Ref.modify(state, (records): readonly [
          Either.Either<SessionRecord, DomainError>,
          Map<string, SessionRecord>
        ] => {
          const current = records.get(id);
          if (!current) {
            return [Either.left(new SessionNotFound({ sessionId: id })), records] as const;
          }
          const changed = change(current);
          if (Either.isLeft(changed)) return [changed, records] as const;
          const next = new Map(records);
          next.set(id, changed.right);
          return [changed, next] as const;
        }).pipe(
          Effect.flatMap((result) => Either.match(result, {
            onLeft: (error) => Effect.fail(error),
            onRight: (record) => Effect.succeed(record)
          }))
        )
    } satisfies SessionRepositoryService;
  })
);
