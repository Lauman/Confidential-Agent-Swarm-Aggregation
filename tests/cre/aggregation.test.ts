import { describe, it, expect } from "vitest";
import { aggregate } from "../../cre/workflows/aggregate/src/handler.js";

describe("CRE Aggregation Handler", () => {
  it("should aggregate values correctly", () => {
    const input = {
      submissions: [
        { agentId: "agent-1", roundId: "test-round-001", value: 102.3, timestamp: Date.now() },
        { agentId: "agent-2", roundId: "test-round-001", value: 98.7, timestamp: Date.now() },
        { agentId: "agent-3", roundId: "test-round-001", value: 105.1, timestamp: Date.now() },
      ],
      roundId: "test-round-001",
    };

    const result = aggregate(input);

    expect(result.aggregate).toBeCloseTo(102.03, 2);
    expect(result.participantCount).toBe(3);
    expect(result.roundId).toBe("test-round-001");
  });

  it("should throw on empty submissions", () => {
    const input = {
      submissions: [],
      roundId: "test-round-002",
    };

    expect(() => aggregate(input)).toThrow("No values provided for aggregation");
  });
});
