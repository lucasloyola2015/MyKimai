import { describe, it, expect } from "vitest";
import {
  createManualTimeEntrySchema,
  editTimeEntrySegmentSchema,
  moveTimeEntryEdgeSchema,
  timeEntriesFilterSchema,
} from "@/lib/validations/time-entries";

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

describe("editTimeEntrySegmentSchema", () => {
  const segment = { start: { kind: "break-end", breakId: ID }, end: { kind: "entry-end" } };
  it("acepta correr minutos enteros y eliminar", () => {
    expect(editTimeEntrySegmentSchema.safeParse({ op: "move", entryId: ID, segment, deltaMs: -15 * 60_000 }).success).toBe(true);
    expect(editTimeEntrySegmentSchema.safeParse({ op: "remove", entryId: ID, segment }).success).toBe(true);
  });
  it("rechaza corrimientos nulos, no enteros o de más de un día, y pausas sin id", () => {
    for (const deltaMs of [0, 1.5, 2 * 86_400_000]) {
      expect(editTimeEntrySegmentSchema.safeParse({ op: "move", entryId: ID, segment, deltaMs }).success).toBe(false);
    }
    const bad = { start: { kind: "break-end" }, end: { kind: "entry-end" } };
    expect(editTimeEntrySegmentSchema.safeParse({ op: "remove", entryId: ID, segment: bad }).success).toBe(false);
  });
});

describe("createManualTimeEntrySchema", () => {
  const ok = {
    project_id: ID,
    title: "Revisión de planos",
    start_time: "2026-11-09T09:00:00-03:00",
    end_time: "2026-11-09T11:30:00.000Z",
  };
  it("acepta una tarea con horario con zona", () => {
    expect(createManualTimeEntrySchema.safeParse(ok).success).toBe(true);
    expect(createManualTimeEntrySchema.safeParse({ ...ok, allow_overlap: true, description: null }).success).toBe(true);
  });
  it("rechaza sin título, horario sin zona o proyecto inválido", () => {
    expect(createManualTimeEntrySchema.safeParse({ ...ok, title: "  " }).success).toBe(false);
    expect(createManualTimeEntrySchema.safeParse({ ...ok, start_time: "2026-11-09T09:00:00" }).success).toBe(false);
    expect(createManualTimeEntrySchema.safeParse({ ...ok, project_id: "x" }).success).toBe(false);
  });
});
