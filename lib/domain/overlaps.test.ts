import { describe, it, expect } from "vitest";
import { judgeOverlaps, type OverlapView } from "@/lib/domain/overlaps";

const overlap = (same_project: boolean): OverlapView => ({
    id: same_project ? "e-same" : "e-other",
    title: "Algo",
    project_id: same_project ? "p-1" : "p-2",
    project: same_project ? "Odoo" : "Robots",
    start_time: "2026-10-02T12:00:00.000Z",
    end_time: "2026-10-02T14:00:00.000Z",
    same_project,
});

describe("judgeOverlaps", () => {
    it("sin solapamientos: OK", () => {
        expect(judgeOverlaps([], false)).toEqual({ ok: true });
    });

    it("mismo proyecto: rechaza SIEMPRE, aun con allow_overlap", () => {
        for (const allow of [false, true]) {
            const v = judgeOverlaps([overlap(true)], allow);
            expect(v.ok).toBe(false);
            if (!v.ok) expect(v.reason).toBe("same_project");
        }
    });

    it("mismo proyecto gana aunque también haya de otros proyectos", () => {
        const v = judgeOverlaps([overlap(false), overlap(true)], true);
        expect(v.ok).toBe(false);
        if (!v.ok) {
            expect(v.reason).toBe("same_project");
            expect(v.overlaps).toHaveLength(2);
        }
    });

    it("otro proyecto: pide confirmación sin allow_overlap", () => {
        const v = judgeOverlaps([overlap(false)], false);
        expect(v.ok).toBe(false);
        if (!v.ok) expect(v.reason).toBe("needs_confirmation");
    });

    it("otro proyecto con allow_overlap (usuario confirmó): OK", () => {
        expect(judgeOverlaps([overlap(false)], true)).toEqual({ ok: true });
    });
});
