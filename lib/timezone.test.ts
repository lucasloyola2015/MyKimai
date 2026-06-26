import { describe, it, expect } from "vitest";
import { arDayKey, startOfDayAr, startOfMonthAr, startOfWeekAr } from "@/lib/timezone";

describe("timezone Argentina (UTC-3) — bucketing de reportes", () => {
  it("trabajo a las 23:30 ART agrupa en su día local, no en el UTC siguiente", () => {
    // 2026-06-26T02:30Z == 2026-06-25 23:30 ART
    expect(arDayKey(new Date("2026-06-26T02:30:00Z"))).toBe("2026-06-25");
  });

  it("mediodía UTC agrupa en el mismo día (no hay cruce)", () => {
    expect(arDayKey(new Date("2026-06-26T12:00:00Z"))).toBe("2026-06-26");
  });

  it("01:00 ART agrupa en el día correcto (madrugada)", () => {
    // 2026-06-26T04:00Z == 2026-06-26 01:00 ART
    expect(arDayKey(new Date("2026-06-26T04:00:00Z"))).toBe("2026-06-26");
  });

  it("startOfDayAr = medianoche AR como instante UTC (03:00Z)", () => {
    expect(startOfDayAr(new Date("2026-06-26T12:00:00Z")).toISOString()).toBe(
      "2026-06-26T03:00:00.000Z"
    );
  });

  it("startOfMonthAr del 25-jun 23:30 ART = 1-jun 00:00 ART (03:00Z)", () => {
    expect(startOfMonthAr(new Date("2026-06-26T02:30:00Z")).toISOString()).toBe(
      "2026-06-01T03:00:00.000Z"
    );
  });

  it("startOfWeekAr arranca el lunes a medianoche AR", () => {
    // 2026-06-26 es viernes; la semana (lun) arranca el 2026-06-22 00:00 ART = 03:00Z
    expect(startOfWeekAr(new Date("2026-06-26T12:00:00Z")).toISOString()).toBe(
      "2026-06-22T03:00:00.000Z"
    );
  });
});
