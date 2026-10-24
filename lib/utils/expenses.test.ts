import { describe, it, expect } from "vitest";
import { buildExpenseDescription, convertExpenseAmount, expenseStoragePath, formatExpenseDate, safeStorageFileName } from "./expenses";

describe("convertExpenseAmount", () => {
    it("misma moneda: no convierte", () => {
        expect(convertExpenseAmount(139990, "ARS", "ARS", 1500)).toBe(139990);
    });

    it("ARS → USD divide por el tipo de cambio", () => {
        expect(convertExpenseAmount(139990, "ARS", "USD", 1500)).toBe(93.33);
    });

    it("USD → ARS multiplica por el tipo de cambio", () => {
        expect(convertExpenseAmount(100, "USD", "ARS", 1510)).toBe(151000);
    });

    it("sin tipo de cambio no inventa un monto", () => {
        expect(() => convertExpenseAmount(100, "USD", "ARS", 0)).toThrow();
    });
});

describe("formatExpenseDate", () => {
    it("no corre la fecha un día por la zona horaria", () => {
        expect(formatExpenseDate(new Date("2026-10-24T00:00:00.000Z"))).toBe("24/10/2026");
    });
});

describe("buildExpenseDescription", () => {
    it("incluye proyecto, descripción y fecha", () => {
        expect(
            buildExpenseDescription({
                description: " Conversor serial (HF2211A) ",
                expense_date: "2026-10-24T00:00:00.000Z",
                projectName: "Medidor de Potencia",
            })
        ).toBe("Gasto — Medidor de Potencia: Conversor serial (HF2211A) (24/10/2026)");
    });
});

describe("safeStorageFileName", () => {
    it("saca acentos, espacios y barras", () => {
        expect(safeStorageFileName("Factura Mercado Libre ñandú/../x.pdf")).toBe("Factura_Mercado_Libre_nandu_.._x.pdf");
    });

    it("nunca queda vacío", () => {
        expect(safeStorageFileName("")).toBe("archivo");
    });
});

describe("expenseStoragePath", () => {
    it("arma owner/gasto/id-nombre", () => {
        expect(expenseStoragePath("o1", "e1", "u1", "foto 1.jpg")).toBe("o1/e1/u1-foto_1.jpg");
    });
});
