import { describe, it, expect } from "vitest";
import { autonomousTitle, discountedRate, isAutonomousTask } from "@/lib/domain/autonomous";

describe("autonomousTitle", () => {
    it("agrega el prefijo", () => {
        expect(autonomousTitle("Auditoría de seguridad")).toBe("Trabajo autónomo: Auditoría de seguridad");
    });
    it("no lo duplica (sin importar mayúsculas)", () => {
        expect(autonomousTitle("Trabajo autónomo: Auditoría")).toBe("Trabajo autónomo: Auditoría");
        expect(autonomousTitle("trabajo autónomo: auditoría")).toBe("trabajo autónomo: auditoría");
    });
    it("respeta el máximo de 255 caracteres", () => {
        expect(autonomousTitle("x".repeat(300))).toHaveLength(255);
    });
});

describe("discountedRate", () => {
    it("aplica el 50% por defecto", () => {
        expect(discountedRate(25)).toBe(12.5);
        expect(discountedRate(15)).toBe(7.5);
    });
    it("acepta otro descuento", () => {
        expect(discountedRate(25, 0.7)).toBe(7.5);
    });
    it("sin tarifa de referencia devuelve null (la cascada usa la del cliente)", () => {
        expect(discountedRate(null)).toBeNull();
    });
});

describe("isAutonomousTask", () => {
    it("reconoce el nombre de la tarea", () => {
        expect(isAutonomousTask("Trabajo autónomo")).toBe(true);
        expect(isAutonomousTask(" trabajo autónomo ")).toBe(true);
        expect(isAutonomousTask("Desarrollo")).toBe(false);
        expect(isAutonomousTask(null)).toBe(false);
    });
});
