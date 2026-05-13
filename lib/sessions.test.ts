import { describe, expect, it } from "vitest";
import { aggregateActivity, type RawSessionRecord } from "@/lib/sessions";

// 2026-05-13 10:00 Europe/Madrid = 2026-05-13T08:00:00Z
const T0 = Date.UTC(2026, 4, 13, 8, 0, 0); // base epoch ms
const MIN = 60 * 1000;

function rec(
  sessionId: string,
  date: string,
  type: "user" | "assistant" | "system",
  offsetMin: number,
): RawSessionRecord {
  return {
    sessionId,
    date,
    type,
    ts: T0 + offsetMin * MIN,
  };
}

describe("aggregateActivity", () => {
  it("counts turns from user+assistant records only", () => {
    const records: RawSessionRecord[] = [
      rec("s1", "2026-05-13", "user", 0),
      rec("s1", "2026-05-13", "assistant", 1),
      rec("s1", "2026-05-13", "system", 2),
    ];
    const out = aggregateActivity(records, 14);
    expect(out).toHaveLength(1);
    expect(out[0].turnCount).toBe(2);
    expect(out[0].sessionCount).toBe(1);
  });

  it("sums focused-hours only when consecutive gaps are < 15 min", () => {
    // Continuous 30-min span — should sum to 0.5h.
    const records: RawSessionRecord[] = [
      rec("s1", "2026-05-13", "user", 0),
      rec("s1", "2026-05-13", "assistant", 10),
      rec("s1", "2026-05-13", "user", 20),
      rec("s1", "2026-05-13", "assistant", 30),
    ];
    const out = aggregateActivity(records, 14);
    expect(out[0].focusedHours).toBeCloseTo(0.5, 5);
  });

  it("excludes gaps >= 15 min from focused-hours", () => {
    // Two sub-spans of 10 min separated by a 20 min idle gap:
    // expected focused = 10 + 10 = 20 min = 1/3 hour.
    const records: RawSessionRecord[] = [
      rec("s1", "2026-05-13", "user", 0),
      rec("s1", "2026-05-13", "assistant", 5),
      rec("s1", "2026-05-13", "user", 10),
      rec("s1", "2026-05-13", "assistant", 30), // 20-min gap
      rec("s1", "2026-05-13", "user", 35),
      rec("s1", "2026-05-13", "assistant", 40),
    ];
    const out = aggregateActivity(records, 14);
    expect(out[0].focusedHours).toBeCloseTo(20 / 60, 5);
  });

  it("returns 0 focused-hours for single-record sessions", () => {
    const records: RawSessionRecord[] = [rec("s1", "2026-05-13", "user", 0)];
    const out = aggregateActivity(records, 14);
    expect(out[0].focusedHours).toBe(0);
  });

  it("buckets distinct sessions same day", () => {
    const records: RawSessionRecord[] = [
      rec("s1", "2026-05-13", "user", 0),
      rec("s1", "2026-05-13", "assistant", 5),
      rec("s2", "2026-05-13", "user", 100),
      rec("s2", "2026-05-13", "assistant", 105),
    ];
    const out = aggregateActivity(records, 14);
    expect(out[0].sessionCount).toBe(2);
    expect(out[0].turnCount).toBe(4);
  });

  it("caps to last N days and sorts ascending", () => {
    const records: RawSessionRecord[] = [
      rec("s1", "2026-05-10", "user", 0),
      rec("s2", "2026-05-11", "user", 0),
      rec("s3", "2026-05-12", "user", 0),
    ];
    const out = aggregateActivity(records, 2);
    expect(out).toHaveLength(2);
    expect(out[0].date).toBe("2026-05-11");
    expect(out[1].date).toBe("2026-05-12");
  });
});
