import { describe, it, expect } from "vitest";
import {
  arDayBounds,
  axisPercent,
  boundaryMarks,
  dayAxis,
  dayTotals,
  groupRowsByProject,
  hourTicks,
  shiftDayKey,
  workedSegments,
} from "@/lib/utils/day-view";

// 2026-11-09 en Argentina (UTC-3): 00:00 AR = 03:00Z.
const DAY = "2026-11-09";
const at = (hhmm: string) => new Date(`${DAY}T${hhmm}:00-03:00`).getTime();

describe("arDayBounds / shiftDayKey", () => {
  it("el día AR va de 03:00Z a 03:00Z del día siguiente", () => {
    const { start, end } = arDayBounds(DAY);
    expect(new Date(start).toISOString()).toBe("2026-11-09T03:00:00.000Z");
    expect(end - start).toBe(24 * 3_600_000);
  });
  it("corre días cruzando meses y años", () => {
    expect(shiftDayKey("2026-11-30", 1)).toBe("2026-12-01");
    expect(shiftDayKey("2026-01-01", -1)).toBe("2025-12-31");
  });
});

describe("workedSegments", () => {
  it("sin pausas es un solo tramo", () => {
    expect(workedSegments({ start_time: at("09:00"), end_time: at("12:00") }, 0)).toEqual([
      { start: at("09:00"), end: at("12:00") },
    ]);
  });

  it("las pausas quedan como huecos", () => {
    const segs = workedSegments(
      {
        start_time: at("09:00"),
        end_time: at("18:00"),
        time_entry_breaks: [
          { start_time: at("15:00"), end_time: at("15:30") },
          { start_time: at("12:00"), end_time: at("13:00") },
        ],
      },
      0
    );
    expect(segs).toEqual([
      { start: at("09:00"), end: at("12:00") },
      { start: at("13:00"), end: at("15:00") },
      { start: at("15:30"), end: at("18:00") },
    ]);
  });

  it("entrada y pausa abiertas corren hasta ahora", () => {
    expect(
      workedSegments(
        { start_time: at("09:00"), end_time: null, time_entry_breaks: [{ start_time: at("10:00"), end_time: null }] },
        at("10:30")
      )
    ).toEqual([{ start: at("09:00"), end: at("10:00") }]);
    expect(workedSegments({ start_time: at("09:00"), end_time: null }, at("10:30"))).toEqual([
      { start: at("09:00"), end: at("10:30") },
    ]);
  });

  it("una pausa que cubre el final no deja tramo vacío", () => {
    expect(
      workedSegments(
        { start_time: at("09:00"), end_time: at("10:00"), time_entry_breaks: [{ start_time: at("09:30"), end_time: at("11:00") }] },
        0
      )
    ).toEqual([{ start: at("09:00"), end: at("09:30") }]);
  });

  it("recorta a la ventana del día", () => {
    const { start, end } = arDayBounds(DAY);
    expect(
      workedSegments({ start_time: at("22:00"), end_time: end + 2 * 3_600_000 }, 0, { start, end })
    ).toEqual([{ start: at("22:00"), end }]);
  });
});

describe("dayAxis / axisPercent / hourTicks", () => {
  const { start } = arDayBounds(DAY);
  it("va exactamente del primer inicio al último fin, sin horas vacías", () => {
    expect(
      dayAxis(
        [
          { start: at("09:00"), end: at("12:00") },
          { start: at("07:35"), end: at("08:10") },
          { start: at("14:00"), end: at("20:55") },
        ],
        start
      )
    ).toEqual({ start: at("07:35"), end: at("20:55") });
  });
  it("trabajo de madrugada también recorta", () => {
    expect(dayAxis([{ start: at("02:40"), end: at("05:00") }], start)).toEqual({ start: at("02:40"), end: at("05:00") });
  });
  it("sin trabajo, 07:00–19:00", () => {
    expect(dayAxis([], start)).toEqual({ start: at("07:00"), end: at("19:00") });
  });
  it("posiciones en el eje", () => {
    const axis = { start: at("07:00"), end: at("17:00") };
    expect(axisPercent(at("07:00"), axis)).toBe(0);
    expect(axisPercent(at("12:00"), axis)).toBe(50);
    expect(axisPercent(at("17:00"), axis)).toBe(100);
    expect(axisPercent(at("05:00"), axis)).toBe(0);
    expect(axisPercent(at("20:00"), axis)).toBe(100);
  });
  it("horas en punto dentro del rango; de a dos si pasa de 12 h", () => {
    expect(hourTicks({ start: at("07:35"), end: at("10:00") }, start).map((x) => x.hour)).toEqual([8, 9, 10]);
    expect(hourTicks({ start: at("07:35"), end: at("20:55") }, start).map((x) => x.hour)).toEqual([8, 10, 12, 14, 16, 18, 20]);
    expect(hourTicks({ start: at("09:10"), end: at("09:50") }, start)).toEqual([]);
  });
});

describe("boundaryMarks", () => {
  it("junta inicios y fines sin repetir, al minuto", () => {
    expect(
      boundaryMarks([
        { start: at("09:00"), end: at("12:00") },
        { start: at("12:00") + 20_000, end: at("14:00") },
      ])
    ).toEqual([at("09:00"), at("12:00"), at("14:00")]);
  });
});

describe("groupRowsByProject", () => {
  it("una fila por proyecto, ordenadas por la primera tarea", () => {
    const e = (id: string, hhmm: string, projectId: string) => ({
      id,
      start_time: at(hhmm),
      projectId,
      projectName: projectId,
      clientName: "C",
    });
    const rows = groupRowsByProject([e("1", "14:00", "A"), e("2", "09:00", "B"), e("3", "08:00", "A")]);
    expect(rows.map((r) => [r.projectId, r.entries.map((x) => x.id)])).toEqual([
      ["A", ["3", "1"]],
      ["B", ["2"]],
    ]);
  });
});

describe("dayTotals", () => {
  it("suma minutos y agrupa montos por moneda", () => {
    expect(
      dayTotals([
        { netoMin: 60, amount: 30, currency: "USD" },
        { netoMin: 90, amount: 45000, currency: "ARS" },
        { netoMin: 30, amount: 15, currency: "USD" },
      ])
    ).toEqual({
      netoMin: 180,
      byCurrency: [
        { currency: "ARS", amount: 45000 },
        { currency: "USD", amount: 45 },
      ],
    });
  });
});
