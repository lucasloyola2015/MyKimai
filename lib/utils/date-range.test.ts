import { describe, it, expect } from "vitest";
import { listDateBounds, quickRanges, rangeError } from "@/lib/utils/date-range";

const byKey = (today: string) => Object.fromEntries(quickRanges(today).map((r) => [r.key, [r.from, r.to]]));

describe("quickRanges", () => {
  it("hoy, semana desde el lunes, este mes y el anterior", () => {
    // 2026-11-12 es jueves.
    expect(byKey("2026-11-12")).toEqual({
      today: ["2026-11-12", "2026-11-12"],
      week: ["2026-11-09", "2026-11-12"],
      month: ["2026-11-01", "2026-11-12"],
      last_month: ["2026-10-01", "2026-10-31"],
    });
  });
  it("domingo pertenece a la semana que empezó el lunes anterior", () => {
    expect(byKey("2026-11-15").week).toEqual(["2026-11-09", "2026-11-15"]);
  });
  it("lunes: la semana es solo hoy", () => {
    expect(byKey("2026-11-09").week).toEqual(["2026-11-09", "2026-11-09"]);
  });
  it("en enero, el mes pasado es diciembre del año anterior", () => {
    expect(byKey("2027-01-05").last_month).toEqual(["2026-12-01", "2026-12-31"]);
  });
  it("febrero bisiesto", () => {
    expect(byKey("2028-03-10").last_month).toEqual(["2028-02-01", "2028-02-29"]);
  });
});

describe("rangeError", () => {
  it("acepta rangos completos, abiertos y vacíos", () => {
    expect(rangeError({ from: "2026-11-01", to: "2026-11-30" })).toBeNull();
    expect(rangeError({ from: "2026-11-01", to: "" })).toBeNull();
    expect(rangeError({ from: "", to: "" })).toBeNull();
    expect(rangeError({ from: "2026-11-05", to: "2026-11-05" })).toBeNull();
  });
  it("rechaza rangos invertidos o mal formados", () => {
    expect(rangeError({ from: "2026-11-30", to: "2026-11-01" })).not.toBeNull();
    expect(rangeError({ from: "11/11/2026", to: "" })).not.toBeNull();
  });
});

describe("listDateBounds", () => {
  const now = new Date("2026-11-09T15:00:00Z").getTime();

  it("el rango va de las 00:00 AR de 'desde' al final de 'hasta' (incluido)", () => {
    const b = listDateBounds({ from: "2026-11-01", to: "2026-11-05" }, false, now);
    expect(b.startDate?.toISOString()).toBe("2026-11-01T03:00:00.000Z");
    expect(b.endDate?.toISOString()).toBe("2026-11-06T02:59:59.999Z");
  });
  it("un rango fuera de la ventana de 90 días se pide igual", () => {
    const b = listDateBounds({ from: "2025-01-01", to: "2025-01-31" }, false, now);
    expect(b.startDate?.toISOString()).toBe("2025-01-01T03:00:00.000Z");
  });
  it("rango abierto: solo el extremo dado", () => {
    expect(listDateBounds({ from: "", to: "2026-11-05" }, false, now)).toEqual({
      startDate: undefined,
      endDate: new Date("2026-11-06T02:59:59.999Z"),
    });
  });
  it("sin rango: últimos 90 días, o todo con showAll", () => {
    expect(listDateBounds({ from: "", to: "" }, false, now).startDate?.getTime()).toBe(now - 90 * 86_400_000);
    expect(listDateBounds({ from: "", to: "" }, true, now)).toEqual({});
  });
  it("un rango inválido cae a la ventana por defecto", () => {
    expect(listDateBounds({ from: "2026-11-30", to: "2026-11-01" }, false, now).startDate?.getTime()).toBe(
      now - 90 * 86_400_000
    );
  });
});
