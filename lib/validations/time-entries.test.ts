import { describe, it, expect } from "vitest";
import { moveTimeEntryEdgeSchema, timeEntriesFilterSchema } from "@/lib/validations/time-entries";

const ID = "3f2b8c1e-5d4a-4b7e-9c2d-1a2b3c4d5e6f";

describe("timeEntriesFilterSchema", () => {
  it("acepta clientes, proyecto y rango", () => {
    const r = timeEntriesFilterSchema.safeParse({
      clientIds: [ID],
      projectId: ID,
      startDate: new Date("2026-11-01T03:00:00Z"),
      endDate: new Date("2026-11-06T02:59:59.999Z"),
    });
    expect(r.success).toBe(true);
  });
  it("acepta un rango abierto o vacío", () => {
    expect(timeEntriesFilterSchema.safeParse({ startDate: new Date() }).success).toBe(true);
    expect(timeEntriesFilterSchema.safeParse({}).success).toBe(true);
  });
  it("rechaza un rango invertido", () => {
    const r = timeEntriesFilterSchema.safeParse({
      startDate: new Date("2026-11-10T00:00:00Z"),
      endDate: new Date("2026-11-01T00:00:00Z"),
    });
    expect(r.success).toBe(false);
  });
  it("rechaza ids que no son UUID y fechas inválidas", () => {
    expect(timeEntriesFilterSchema.safeParse({ clientIds: ["x"] }).success).toBe(false);
    expect(timeEntriesFilterSchema.safeParse({ startDate: "no-es-fecha" }).success).toBe(false);
  });
});

describe("moveTimeEntryEdgeSchema", () => {
  const time = "2026-11-09T12:00:00-03:00";
  it("acepta mover la tarea sin pausa y la pausa con su id", () => {
    expect(moveTimeEntryEdgeSchema.safeParse({ entryId: ID, edge: "entry-start", time }).success).toBe(true);
    expect(moveTimeEntryEdgeSchema.safeParse({ entryId: ID, edge: "break-end", breakId: ID, time }).success).toBe(true);
  });
  it("una pausa sin id, un extremo desconocido o una fecha inválida se rechazan", () => {
    expect(moveTimeEntryEdgeSchema.safeParse({ entryId: ID, edge: "break-start", time }).success).toBe(false);
    expect(moveTimeEntryEdgeSchema.safeParse({ entryId: ID, edge: "middle", time }).success).toBe(false);
    expect(moveTimeEntryEdgeSchema.safeParse({ entryId: ID, edge: "entry-end", time: "nope" }).success).toBe(false);
  });
});
