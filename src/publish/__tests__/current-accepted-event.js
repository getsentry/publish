import { describe, expect, test, vi } from "vitest";

const { getCurrentAcceptedEvent } = require("../current-accepted-event.js");

describe("getCurrentAcceptedEvent", () => {
  test("returns the latest accepted-label event", async () => {
    await expect(
      getCurrentAcceptedEvent({
        getIssueEvents: vi.fn().mockResolvedValue([
          {
            actor: { login: "contractor" },
            event: "labeled",
            id: "100",
            label: { name: "accepted" },
          },
          {
            actor: { login: "contractor" },
            event: "labeled",
            id: "200",
            label: { name: "accepted" },
          },
        ]),
        issueNumber: "123",
        repository: "getsentry/publish",
      })
    ).resolves.toEqual({ actor: "contractor", eventId: "200" });
  });

  test("rejects an issue without a valid accepted-label event", async () => {
    await expect(
      getCurrentAcceptedEvent({
        getIssueEvents: vi.fn().mockResolvedValue([]),
        issueNumber: "123",
        repository: "getsentry/publish",
      })
    ).rejects.toThrow("The issue has no current accepted label event");
  });
});
