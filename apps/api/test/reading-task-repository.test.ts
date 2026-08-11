import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import {
  InMemoryReadingTaskRepository,
  ReadingTaskRepository,
  type ReadingTaskRecord
} from "../src/reading-task-repository.js";

describe("reading task repository", () => {
  it("leases once and allows a degraded task to be retried", async () => {
    const timestamp = new Date().toISOString();
    const seed: ReadingTaskRecord = {
      id: "reading_session-test",
      sessionId: "session-test",
      userId: "user-test",
      status: "pending",
      createdAt: timestamp,
      updatedAt: timestamp
    };

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* ReadingTaskRepository;
        yield* repository.getOrCreate(seed);
        const firstClaim = yield* repository.claim(
          seed.id,
          "worker-1",
          new Date(Date.now() + 60_000).toISOString()
        );
        const duplicateClaim = yield* repository.claim(
          seed.id,
          "worker-2",
          new Date(Date.now() + 60_000).toISOString()
        );
        yield* repository.finish(seed.id, "worker-1", {
          status: "degraded",
          message: "temporary failure"
        });
        const retried = yield* repository.getOrCreate(seed);
        const retryClaim = yield* repository.claim(
          seed.id,
          "worker-3",
          new Date(Date.now() + 60_000).toISOString()
        );
        return { firstClaim, duplicateClaim, retried, retryClaim };
      }).pipe(Effect.provide(InMemoryReadingTaskRepository))
    );

    expect(result.firstClaim?.leaseOwner).toBe("worker-1");
    expect(result.duplicateClaim).toBeUndefined();
    expect(result.retried.status).toBe("pending");
    expect(result.retried.message).toBeUndefined();
    expect(result.retryClaim?.leaseOwner).toBe("worker-3");
  });
});
