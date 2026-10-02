import { describe, it, expect } from "vitest";
import { checkBreaks, segmentsOverlap, workedMinutes, workedSegments } from "@/lib/domain/segments";

const t = (hm: string) => new Date(`2026-09-21T${hm}:00-03:00`);

describe("workedSegments / workedMinutes", () => {
    it("sin pausas es el rango entero", () => {
        expect(workedMinutes(t("07:45"), t("09:45"))).toBe(120);
    });
    it("resta las pausas (caso: sesión corta + pausa + retoma)", () => {
        const breaks = [{ start: t("08:00"), end: t("09:00") }];
        expect(workedMinutes(t("07:45"), t("09:45"), breaks)).toBe(60);
        expect(workedSegments(t("07:45"), t("09:45"), breaks)).toHaveLength(2);
    });
    it("una pausa abierta llega hasta el fin del rango", () => {
        expect(workedMinutes(t("10:00"), t("11:00"), [{ start: t("10:30"), end: null }])).toBe(30);
    });
});

describe("segmentsOverlap", () => {
    it("lo trabajado por otro durante la pausa NO es solapamiento", () => {
        const merged = workedSegments(t("07:45"), t("09:45"), [{ start: t("08:00"), end: t("09:00") }]);
        const otro = workedSegments(t("08:00"), t("09:00"));
        expect(segmentsOverlap(merged, otro)).toBe(false);
    });
    it("lo que pisa un tramo trabajado SÍ es solapamiento", () => {
        const merged = workedSegments(t("07:45"), t("09:45"), [{ start: t("08:00"), end: t("09:00") }]);
        expect(segmentsOverlap(merged, workedSegments(t("09:30"), t("10:00")))).toBe(true);
    });
});

describe("checkBreaks", () => {
    it("acepta pausas válidas", () => {
        expect(checkBreaks(t("07:45"), t("09:45"), [{ start: t("08:00"), end: t("09:00") }])).toBeNull();
    });
    it("rechaza pausas fuera del rango, invertidas o encimadas", () => {
        expect(checkBreaks(t("07:45"), t("09:45"), [{ start: t("07:30"), end: t("08:00") }])).toMatch(/dentro/);
        expect(checkBreaks(t("07:45"), t("09:45"), [{ start: t("09:00"), end: t("08:00") }])).toMatch(/terminar/);
        expect(
            checkBreaks(t("07:00"), t("12:00"), [
                { start: t("08:00"), end: t("09:00") },
                { start: t("08:30"), end: t("10:00") },
            ])
        ).toMatch(/pisarse/);
    });
});
