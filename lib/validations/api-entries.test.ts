import { describe, it, expect } from "vitest";
import {
    apiCreateEntrySchema,
    apiListEntriesSchema,
    apiUpdateEntrySchema,
    checkEntryRange,
} from "@/lib/validations/api-entries";

const PROJECT = "6f1b0c1e-7b5a-4d2e-9c3f-1a2b3c4d5e6f";

describe("checkEntryRange", () => {
    const now = new Date("2026-10-02T21:00:00Z");

    it("acepta un rango válido en el pasado", () => {
        expect(
            checkEntryRange(new Date("2026-10-02T12:00:00Z"), new Date("2026-10-02T15:00:00Z"), now)
        ).toBeNull();
    });

    it("rechaza fin <= inicio", () => {
        const t = new Date("2026-10-02T12:00:00Z");
        expect(checkEntryRange(t, t, now)).toMatch(/posterior/);
    });

    it("rechaza horas en el futuro (con 5 min de tolerancia)", () => {
        expect(
            checkEntryRange(new Date("2026-10-02T20:00:00Z"), new Date("2026-10-02T21:04:00Z"), now)
        ).toBeNull();
        expect(
            checkEntryRange(new Date("2026-10-02T20:00:00Z"), new Date("2026-10-02T21:06:00Z"), now)
        ).toMatch(/futuro/);
    });

    it("rechaza entradas de menos de 30 minutos", () => {
        expect(
            checkEntryRange(new Date("2026-10-02T12:00:00Z"), new Date("2026-10-02T12:29:00Z"), now)
        ).toMatch(/30 minutos/);
        // 20 min + pausa + 15 min: 35 trabajados → se registra unido.
        expect(
            checkEntryRange(new Date("2026-10-02T12:00:00Z"), new Date("2026-10-02T13:15:00Z"), now, [
                { start: new Date("2026-10-02T12:20:00Z"), end: new Date("2026-10-02T13:00:00Z") },
            ])
        ).toBeNull();
        // 10 min + pausa + 10 min: 20 trabajados → no se registra.
        expect(
            checkEntryRange(new Date("2026-10-02T12:00:00Z"), new Date("2026-10-02T13:00:00Z"), now, [
                { start: new Date("2026-10-02T12:10:00Z"), end: new Date("2026-10-02T12:50:00Z") },
            ])
        ).toMatch(/30 minutos/);
        expect(
            checkEntryRange(new Date("2026-10-02T12:00:00Z"), new Date("2026-10-02T12:30:00Z"), now)
        ).toBeNull();
    });

    it("rechaza entradas de más de 24 h", () => {
        expect(
            checkEntryRange(new Date("2026-09-30T12:00:00Z"), new Date("2026-10-01T12:01:00Z"), now)
        ).toMatch(/24/);
    });
});

describe("apiCreateEntrySchema", () => {
    const base = {
        project_id: PROJECT,
        title: "Firmware del PLC",
        start_time: "2026-10-02T09:00:00-03:00",
        end_time: "2026-10-02T12:30:00-03:00",
    };

    it("parsea con offset explícito y default allow_overlap=false", () => {
        const r = apiCreateEntrySchema.parse(base);
        expect(r.start_time.toISOString()).toBe("2026-10-02T12:00:00.000Z");
        expect(r.end_time.toISOString()).toBe("2026-10-02T15:30:00.000Z");
        expect(r.allow_overlap).toBe(false);
    });

    it("exige zona horaria en las fechas", () => {
        expect(apiCreateEntrySchema.safeParse({ ...base, start_time: "2026-10-02T09:00:00" }).success).toBe(false);
    });

    it("exige título no vacío", () => {
        expect(apiCreateEntrySchema.safeParse({ ...base, title: "   " }).success).toBe(false);
    });

    it("descarta campos de plata (el agente nunca manda montos)", () => {
        const r = apiCreateEntrySchema.parse({ ...base, amount: 999, rate_applied: 50, billable: false });
        expect(r).not.toHaveProperty("amount");
        expect(r).not.toHaveProperty("rate_applied");
        expect(r).not.toHaveProperty("billable");
    });
});

describe("apiUpdateEntrySchema", () => {
    it("exige al menos un campo", () => {
        expect(apiUpdateEntrySchema.safeParse({ entry_id: PROJECT }).success).toBe(false);
        expect(apiUpdateEntrySchema.safeParse({ entry_id: PROJECT, title: "Nuevo" }).success).toBe(true);
        expect(apiUpdateEntrySchema.safeParse({ entry_id: PROJECT, description: null }).success).toBe(true);
    });
});

describe("apiListEntriesSchema", () => {
    it("interpreta YYYY-MM-DD como día completo en hora de Argentina", () => {
        const r = apiListEntriesSchema.parse({ from: "2026-10-02", to: "2026-10-02" });
        expect(r.from.toISOString()).toBe("2026-10-02T03:00:00.000Z");
        expect(r.to.toISOString()).toBe("2026-10-03T02:59:59.999Z");
        expect(r.scope).toBe("mine");
    });

    it("acepta instantes ISO con offset", () => {
        const r = apiListEntriesSchema.parse({
            from: "2026-10-01T00:00:00Z",
            to: "2026-10-02T00:00:00-03:00",
        });
        expect(r.to.toISOString()).toBe("2026-10-02T03:00:00.000Z");
    });

    it("rechaza rangos invertidos, de más de 366 días y fechas inválidas", () => {
        expect(apiListEntriesSchema.safeParse({ from: "2026-10-02", to: "2026-10-01" }).success).toBe(false);
        expect(apiListEntriesSchema.safeParse({ from: "2025-01-01", to: "2026-10-02" }).success).toBe(false);
        expect(apiListEntriesSchema.safeParse({ from: "ayer", to: "2026-10-02" }).success).toBe(false);
    });
});
