import { describe, expect, test, vi } from "vitest";

const { getCurrentCiReadyEvent } = require("../current-ci-ready-event.js");

describe("getCurrentCiReadyEvent", () => {
  test("returns the current ci-ready event", async () => {
    const event = { actor: "github-actions[bot]", eventId: "123" };

    await expect(
      getCurrentCiReadyEvent({
        getIssueEvents: vi.fn().mockResolvedValue([
          {
            actor: { login: event.actor },
            event: "labeled",
            id: event.eventId,
            label: { name: "ci-ready" },
          },
        ]),
        issueNumber: "1",
        repository: "getsentry/publish",
      })
    ).resolves.toEqual(event);
  });

  test("rejects when no current ci-ready event exists", async () => {
    await expect(
      getCurrentCiReadyEvent({
        getIssueEvents: vi.fn().mockResolvedValue([]),
        issueNumber: "1",
        repository: "getsentry/publish",
      })
    ).rejects.toThrow("No current ci-ready event found");
  });
});
