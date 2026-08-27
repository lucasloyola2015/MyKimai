import { describe, it, expect } from "vitest";
import { updateProjectSchema } from "@/lib/validations/projects";

describe("updateProjectSchema — reasignación de cliente", () => {
  const uuid = "3f7c1b2a-9d4e-4c8b-9a1e-2b3c4d5e6f70";

  it("acepta client_id para mover el proyecto a otro cliente", () => {
    const r = updateProjectSchema.safeParse({ client_id: uuid, name: "Proyecto X" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.client_id).toBe(uuid);
  });

  it("rechaza un client_id que no es UUID", () => {
    const r = updateProjectSchema.safeParse({ client_id: "no-es-uuid" });
    expect(r.success).toBe(false);
  });

  it("sigue permitiendo actualizaciones sin client_id (parcial)", () => {
    expect(updateProjectSchema.safeParse({ name: "Solo nombre" }).success).toBe(true);
    expect(updateProjectSchema.safeParse({}).success).toBe(true);
  });
});
