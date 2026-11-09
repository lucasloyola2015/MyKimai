import { describe, it, expect } from "vitest";
import { manualEntryTimes } from "@/lib/utils/manual-entry";

describe("manualEntryTimes", () => {
  it("convierte el día y las horas AR a instantes", () => {
    const r = manualEntryTimes("2026-11-09", "09:15", "12:45");
    expect(r).toEqual({
      ok: true,
      start: new Date("2026-11-09T12:15:00.000Z"),
      end: new Date("2026-11-09T15:45:00.000Z"),
      nextDay: false,
      minutes: 210,
    });
  });
  it("un fin igual o anterior al inicio cae al día siguiente", () => {
    const r = manualEntryTimes("2026-11-30", "22:00", "00:00");
    expect(r.ok && [r.end.toISOString(), r.nextDay, r.minutes]).toEqual(["2026-12-01T03:00:00.000Z", true, 120]);
  });
  it("rechaza horas o fecha mal formadas", () => {
    expect(manualEntryTimes("2026-11-09", "9:00", "10:00").ok).toBe(false);
    expect(manualEntryTimes("2026-11-09", "09:00", "24:00").ok).toBe(false);
    expect(manualEntryTimes("", "09:00", "10:00").ok).toBe(false);
  });
});
