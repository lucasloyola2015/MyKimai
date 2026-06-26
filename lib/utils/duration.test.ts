import { describe, it, expect } from "vitest";
import { formatDurationMinutes, minutesToDecimalHours } from "@/lib/utils/duration";

describe("formatDurationMinutes (minutos → HH:mm)", () => {
  it.each([
    [0, "00:00"],
    [45, "00:45"],
    [125, "02:05"],
    [605, "10:05"],
    [59, "00:59"],
    [60, "01:00"],
  ])("%i min → %s", (minutes, expected) => {
    expect(formatDurationMinutes(minutes)).toBe(expected);
  });

  it("null / undefined / negativo → 00:00", () => {
    expect(formatDurationMinutes(null)).toBe("00:00");
    expect(formatDurationMinutes(undefined)).toBe("00:00");
    expect(formatDurationMinutes(-5)).toBe("00:00");
  });
});

describe("minutesToDecimalHours (para amount = rate * horas)", () => {
  it("90 min → 1.5 h", () => expect(minutesToDecimalHours(90)).toBe(1.5));
  it("60 min → 1 h", () => expect(minutesToDecimalHours(60)).toBe(1));
  it("0 / null / negativo → 0", () => {
    expect(minutesToDecimalHours(0)).toBe(0);
    expect(minutesToDecimalHours(null)).toBe(0);
    expect(minutesToDecimalHours(-30)).toBe(0);
  });
});
