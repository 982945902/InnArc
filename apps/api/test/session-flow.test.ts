import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type {
  DrawResponse,
  PublicConfig,
  ReadingAccepted,
  ReadingTask,
  Session,
  ShuffleResponse
} from "@heart-mirror/contracts";
import { buildServer } from "../src/server.js";

describe("reflection session", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("completes question → clarification → 78 choose 3 → reading", async () => {
    const assetResponse = await app.inject({ method: "GET", url: "/assets/cards/webp/major-00.webp" });
    expect(assetResponse.statusCode).toBe(200);
    expect(assetResponse.headers["content-type"]).toContain("image/webp");
    expect(assetResponse.rawPayload.byteLength).toBeGreaterThan(100_000);

    const configResponse = await app.inject({ method: "GET", url: "/v1/config/public" });
    const publicConfig = configResponse.json<PublicConfig>();
    expect(publicConfig.cardAssetBaseUrl).toBe("http://127.0.0.1:8787/assets");
    const consentResponse = await app.inject({
      method: "POST",
      url: "/v1/consents",
      payload: {
        adultConfirmed: true,
        disclaimerAccepted: true,
        consentVersion: publicConfig.consentVersion
      }
    });
    expect(consentResponse.statusCode).toBe(200);

    const createdResponse = await app.inject({
      method: "POST",
      url: "/v1/sessions",
      payload: { question: "我最近在工作选择上有些犹豫，想看清自己。" }
    });
    expect(createdResponse.statusCode).toBe(200);
    let session = createdResponse.json<Session>();
    expect(session.status).toBe("clarifying");

    for (const answer of ["情绪反复", "理解自己"]) {
      const response = await app.inject({
        method: "POST",
        url: `/v1/sessions/${session.id}/clarifications`,
        payload: { answer }
      });
      expect(response.statusCode).toBe(200);
      session = response.json<Session>();
    }
    expect(session.status).toBe("spread_ready");
    expect(session.spread?.positions).toHaveLength(3);

    const shuffleResponse = await app.inject({ method: "POST", url: `/v1/sessions/${session.id}/shuffle` });
    const shuffle = shuffleResponse.json<ShuffleResponse>();
    expect(shuffle.slots).toHaveLength(78);

    const drawn: DrawResponse[] = [];
    for (const slotId of ["slot_00", "slot_17", "slot_63"]) {
      const response = await app.inject({
        method: "POST",
        url: `/v1/sessions/${session.id}/draws`,
        payload: { slotId }
      });
      expect(response.statusCode).toBe(200);
      drawn.push(response.json<DrawResponse>());
    }
    expect(drawn.at(-1)?.selectedCount).toBe(3);
    expect(drawn.every(({ card }) => card.name !== card.positionName)).toBe(true);

    const readingResponse = await app.inject({ method: "POST", url: `/v1/sessions/${session.id}/reading` });
    expect(readingResponse.statusCode).toBe(202);
    const accepted = readingResponse.json<ReadingAccepted>();
    expect(accepted.status).toBe("pending");

    const duplicateResponse = await app.inject({ method: "POST", url: `/v1/sessions/${session.id}/reading` });
    expect(duplicateResponse.statusCode).toBe(202);
    expect(duplicateResponse.json<ReadingAccepted>().taskId).toBe(accepted.taskId);

    let task: ReadingTask | undefined;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const taskResponse = await app.inject({ method: "GET", url: `/v1/reading-tasks/${accepted.taskId}` });
      expect(taskResponse.statusCode).toBe(200);
      task = taskResponse.json<ReadingTask>();
      if (task.status === "complete") break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(task?.status).toBe("complete");
    const reading = task?.reading;
    if (!reading) throw new Error("reading task completed without a reading");
    expect(reading.cards).toHaveLength(3);
    expect(reading.summary.length).toBeGreaterThan(20);
    expect(reading.generation.label).toBe("固定内容");
  });
});
