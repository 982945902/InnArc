import type { Reading, ReadingTask } from "@heart-mirror/contracts";
import { Context, Effect, Either, Layer, Ref } from "effect";
import { InvalidSessionState, ReadingTaskNotFound, type DomainError } from "./errors.js";

export type ReadingTaskRecordStatus = "pending" | "processing" | "complete" | "blocked" | "degraded";

export interface ReadingTaskRecord {
  readonly id: string;
  readonly sessionId: string;
  readonly userId: string;
  readonly status: ReadingTaskRecordStatus;
  readonly reading?: Reading | undefined;
  readonly message?: string | undefined;
  readonly leaseOwner?: string | undefined;
  readonly leaseUntil?: string | undefined;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ReadingTaskRepositoryService {
  readonly get: (id: string) => Effect.Effect<ReadingTaskRecord, DomainError>;
  readonly getOrCreate: (record: ReadingTaskRecord) => Effect.Effect<ReadingTaskRecord, DomainError>;
  readonly claim: (
    id: string,
    workerId: string,
    leaseUntil: string
  ) => Effect.Effect<ReadingTaskRecord | undefined, DomainError>;
  readonly finish: (
    id: string,
    workerId: string,
    result: Pick<ReadingTaskRecord, "status" | "reading" | "message">
  ) => Effect.Effect<ReadingTaskRecord, DomainError>;
}

export class ReadingTaskRepository extends Context.Tag("@heart-mirror/ReadingTaskRepository")<
  ReadingTaskRepository,
  ReadingTaskRepositoryService
>() {}

const canClaim = (record: ReadingTaskRecord): boolean =>
  record.status === "pending" || (
    record.status === "processing" &&
    (!record.leaseUntil || Date.parse(record.leaseUntil) <= Date.now())
  );

export const toPublicReadingTask = (record: ReadingTaskRecord): ReadingTask => ({
  id: record.id,
  sessionId: record.sessionId,
  status: record.status === "processing" ? "pending" : record.status,
  ...(record.reading ? { reading: record.reading } : {}),
  ...(record.message ? { message: record.message } : {}),
  createdAt: record.createdAt,
  updatedAt: record.updatedAt
});

export const InMemoryReadingTaskRepository = Layer.effect(
  ReadingTaskRepository,
  Effect.gen(function* () {
    const state = yield* Ref.make(new Map<string, ReadingTaskRecord>());

    return {
      get: (id) =>
        Ref.get(state).pipe(
          Effect.flatMap((records) => {
            const record = records.get(id);
            return record
              ? Effect.succeed(record)
              : Effect.fail(new ReadingTaskNotFound({ taskId: id }));
          })
        ),
      getOrCreate: (record) =>
        Ref.modify(state, (records) => {
          const existing = records.get(record.id);
          if (existing && existing.status !== "degraded") return [existing, records] as const;
          if (existing) {
            const retried: ReadingTaskRecord = {
              ...existing,
              status: "pending",
              message: undefined,
              leaseOwner: undefined,
              leaseUntil: undefined,
              updatedAt: new Date().toISOString()
            };
            const next = new Map(records);
            next.set(record.id, retried);
            return [retried, next] as const;
          }
          const next = new Map(records);
          next.set(record.id, record);
          return [record, next] as const;
        }),
      claim: (id, workerId, leaseUntil) =>
        Ref.modify(state, (records): readonly [
          Either.Either<ReadingTaskRecord | undefined, DomainError>,
          Map<string, ReadingTaskRecord>
        ] => {
          const current = records.get(id);
          if (!current) return [Either.left(new ReadingTaskNotFound({ taskId: id })), records] as const;
          if (!canClaim(current)) return [Either.right(undefined), records] as const;
          const claimed: ReadingTaskRecord = {
            ...current,
            status: "processing",
            leaseOwner: workerId,
            leaseUntil,
            updatedAt: new Date().toISOString()
          };
          const next = new Map(records);
          next.set(id, claimed);
          return [Either.right(claimed), next] as const;
        }).pipe(
          Effect.flatMap((result) => Either.match(result, {
            onLeft: (error) => Effect.fail(error),
            onRight: (record) => Effect.succeed(record)
          }))
        ),
      finish: (id, workerId, result) =>
        Ref.modify(state, (records): readonly [
          Either.Either<ReadingTaskRecord, DomainError>,
          Map<string, ReadingTaskRecord>
        ] => {
          const current = records.get(id);
          if (!current) return [Either.left(new ReadingTaskNotFound({ taskId: id })), records] as const;
          if (["complete", "blocked", "degraded"].includes(current.status)) {
            return [Either.right(current), records] as const;
          }
          if (current.status !== "processing" || current.leaseOwner !== workerId) {
            return [Either.left(new InvalidSessionState({ message: "解读任务已由其他执行器接管。" })), records] as const;
          }
          const finished: ReadingTaskRecord = {
            ...current,
            status: result.status,
            ...(result.reading ? { reading: result.reading } : {}),
            ...(result.message ? { message: result.message } : {}),
            leaseOwner: undefined,
            leaseUntil: undefined,
            updatedAt: new Date().toISOString()
          };
          const next = new Map(records);
          next.set(id, finished);
          return [Either.right(finished), next] as const;
        }).pipe(
          Effect.flatMap((result) => Either.match(result, {
            onLeft: (error) => Effect.fail(error),
            onRight: (record) => Effect.succeed(record)
          }))
        )
    } satisfies ReadingTaskRepositoryService;
  })
);
