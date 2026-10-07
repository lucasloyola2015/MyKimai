import { describe, expect, it } from "vitest";
import {
    apiCreateClientSchema,
    apiCreateProjectSchema,
    apiUpdateClientSchema,
    apiUpdateProjectSchema,
} from "./api-catalog";

const UUID = "2cd2d49d-0721-44bb-8c2e-3bb5ea4f7089";

describe("API: clientes", () => {
    it("acepta un cliente con solo el nombre y rechaza uno sin nombre", () => {
        expect(apiCreateClientSchema.safeParse({ name: "Panadería Don José" }).success).toBe(true);
        expect(apiCreateClientSchema.safeParse({ name: "" }).success).toBe(false);
    });

    it("valida email, moneda y tarifa", () => {
        expect(apiCreateClientSchema.safeParse({ name: "X", email: "no-es-mail" }).success).toBe(false);
        expect(apiCreateClientSchema.safeParse({ name: "X", email: "" }).success).toBe(true);
        expect(apiCreateClientSchema.safeParse({ name: "X", currency: "PESOS" }).success).toBe(false);
        expect(apiCreateClientSchema.safeParse({ name: "X", default_rate: -1 }).success).toBe(false);
    });

    it("la edición es parcial, exige client_id y no deja tocar la contraseña del portal", () => {
        expect(apiUpdateClientSchema.safeParse({ client_id: UUID, tax_id: "20-12345678-9" }).success).toBe(true);
        expect(apiUpdateClientSchema.safeParse({ tax_id: "20-12345678-9" }).success).toBe(false);
        const parsed = apiUpdateClientSchema.safeParse({ client_id: UUID, newPassword: "secreta123" });
        expect(parsed.success && "newPassword" in parsed.data).toBe(false);
    });
});

describe("API: proyectos", () => {
    it("exige cliente y nombre; las fechas van YYYY-MM-DD", () => {
        const ok = apiCreateProjectSchema.safeParse({ client_id: UUID, name: "Amasadora", start_date: "2026-10-07" });
        expect(ok.success).toBe(true);
        expect(ok.success && ok.data.start_date).toEqual(new Date("2026-10-07T00:00:00Z"));
        expect(apiCreateProjectSchema.safeParse({ name: "Amasadora" }).success).toBe(false);
        expect(apiCreateProjectSchema.safeParse({ client_id: UUID, name: "A", start_date: "07/10/2026" }).success).toBe(false);
    });

    it("la edición es parcial, exige project_id y valida estado y tarifa", () => {
        expect(apiUpdateProjectSchema.safeParse({ project_id: UUID, status: "paused" }).success).toBe(true);
        expect(apiUpdateProjectSchema.safeParse({ project_id: UUID, status: "archivado" }).success).toBe(false);
        expect(apiUpdateProjectSchema.safeParse({ project_id: UUID, rate: -5 }).success).toBe(false);
        expect(apiUpdateProjectSchema.safeParse({ project_id: UUID, end_date: null }).success).toBe(true);
        expect(apiUpdateProjectSchema.safeParse({ status: "paused" }).success).toBe(false);
    });
});
