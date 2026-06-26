import { describe, it, expect } from "vitest";
import { resolveRate } from "@/lib/utils/rates";

const task = (rate: any) => ({ rate }) as any;
const project = (rate: any) => ({ rate }) as any;
const client = (default_rate: any) => ({ default_rate }) as any;

describe("resolveRate — cascada de tarifas (SSOT): Tarea > Proyecto > Cliente > general", () => {
  it("usa la tarifa de la TAREA cuando está presente", () => {
    expect(
      resolveRate({ task: task(50), project: project(40), client: client(30), defaultRate: 20 })
    ).toEqual({ rate: 50, source: "Tarea" });
  });

  it("cae a PROYECTO si la tarea no tiene tarifa", () => {
    expect(resolveRate({ task: task(null), project: project(40), client: client(30) })).toEqual({
      rate: 40,
      source: "Proyecto",
    });
  });

  it("cae a CLIENTE si tarea y proyecto no tienen", () => {
    expect(resolveRate({ task: task(null), project: project(null), client: client(30) })).toEqual({
      rate: 30,
      source: "Cliente",
    });
  });

  it("cae a la tarifa general del USUARIO como último recurso", () => {
    expect(resolveRate({ client: client(null), defaultRate: 20 })).toEqual({
      rate: 20,
      source: "Usuario",
    });
  });

  it("devuelve { null, null } si no hay ninguna tarifa", () => {
    expect(resolveRate({})).toEqual({ rate: null, source: null });
  });

  it("convierte un Decimal de Prisma (objeto con toNumber)", () => {
    expect(resolveRate({ task: task({ toNumber: () => 55 }) })).toEqual({
      rate: 55,
      source: "Tarea",
    });
  });

  it("rate 0 en la tarea es una tarifa válida (no cae a la siguiente)", () => {
    expect(resolveRate({ task: task(0), project: project(40) })).toEqual({
      rate: 0,
      source: "Tarea",
    });
  });
});
