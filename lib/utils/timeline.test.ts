import { describe, it, expect } from "vitest";
import { dayKey, timelineStartHourByDay } from "@/lib/utils/timeline";

// Fechas construidas en hora local (como las usa DayTimeline).
const at = (d: number, h: number, m = 0) => new Date(2026, 8, d, h, m);

describe("timelineStartHourByDay", () => {
    it("arranca a las 7 si ninguna entrada del día empieza antes", () => {
        const map = timelineStartHourByDay([at(12, 17, 15), at(12, 9, 0)]);
        expect(map.get(dayKey(at(12, 0)))).toBe(7);
    });

    it("arranca en la hora en punto de la entrada más temprana si es antes de las 7", () => {
        const map = timelineStartHourByDay([at(13, 10, 0), at(13, 5, 40), at(13, 6, 10)]);
        expect(map.get(dayKey(at(13, 0)))).toBe(5);
    });

    it("cada día tiene su propia escala", () => {
        const map = timelineStartHourByDay([at(14, 3, 0), at(15, 8, 0)]);
        expect(map.get(dayKey(at(14, 0)))).toBe(3);
        expect(map.get(dayKey(at(15, 0)))).toBe(7);
    });

    it("una entrada que arranca justo a medianoche lleva la escala a 00h", () => {
        const map = timelineStartHourByDay([at(16, 0, 0)]);
        expect(map.get(dayKey(at(16, 0)))).toBe(0);
    });
});
