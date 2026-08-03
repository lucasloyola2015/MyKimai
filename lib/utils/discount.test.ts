import { describe, it, expect } from "vitest";
import { buildDiscountDescription } from "@/lib/utils/discount";

describe("descripción de la línea de descuento", () => {
  it("incluye el motivo cargado por el usuario", () => {
    expect(buildDiscountDescription(10, "Cliente frecuente")).toBe(
      "Descuento 10% — Cliente frecuente"
    );
  });

  it("recorta espacios del motivo", () => {
    expect(buildDiscountDescription(15, "  Acuerdo comercial  ")).toBe(
      "Descuento 15% — Acuerdo comercial"
    );
  });

  it("sin motivo, muestra solo el porcentaje", () => {
    expect(buildDiscountDescription(10)).toBe("Descuento 10%");
    expect(buildDiscountDescription(10, "")).toBe("Descuento 10%");
    expect(buildDiscountDescription(10, "   ")).toBe("Descuento 10%");
    expect(buildDiscountDescription(10, null)).toBe("Descuento 10%");
  });

  it("no arrastra decimales innecesarios", () => {
    expect(buildDiscountDescription(10.0, "X")).toBe("Descuento 10% — X");
    expect(buildDiscountDescription(12.5, "X")).toBe("Descuento 12.5% — X");
  });
});
