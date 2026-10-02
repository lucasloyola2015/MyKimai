/**
 * Tramos trabajados de una entrada = su rango menos las pausas (lógica pura → testeable).
 *
 * Se usa para (1) la duración mínima, que se mide sobre lo trabajado, y (2) los solapamientos:
 * lo que pasa durante una pausa de una entrada no choca con ella (p. ej. una sesión corta que
 * se une a otra del mismo cliente, con una pausa en el medio en la que se trabajó para otro).
 */

export interface BreakLike {
    start: Date;
    end: Date | null;
}
export type Segment = [Date, Date];

/** Rango [start, end) menos las pausas (una pausa abierta se toma hasta el fin del rango). */
export function workedSegments(start: Date, end: Date, breaks: BreakLike[] = []): Segment[] {
    let segs: Segment[] = [[start, end]];
    for (const b of breaks) {
        const bs = b.start;
        const be = b.end ?? end;
        if (be <= bs) continue;
        segs = segs.flatMap(([a, z]): Segment[] =>
            be <= a || bs >= z ? [[a, z]] : [...(bs > a ? [[a, bs] as Segment] : []), ...(be < z ? [[be, z] as Segment] : [])]
        );
    }
    return segs;
}

export function workedMinutes(start: Date, end: Date, breaks: BreakLike[] = []): number {
    return Math.round(workedSegments(start, end, breaks).reduce((t, [a, z]) => t + (z.getTime() - a.getTime()), 0) / 60_000);
}

export function segmentsOverlap(a: Segment[], b: Segment[]): boolean {
    return a.some(([as, az]) => b.some(([bs, bz]) => as < bz && bs < az));
}

/** Pausas válidas: dentro del rango, inicio < fin y sin pisarse entre sí. Devuelve el error o null. */
export function checkBreaks(start: Date, end: Date, breaks: { start: Date; end: Date }[]): string | null {
    const sorted = [...breaks].sort((x, y) => x.start.getTime() - y.start.getTime());
    for (const [i, b] of sorted.entries()) {
        if (b.end <= b.start) return "Cada pausa debe terminar después de empezar.";
        if (b.start <= start || b.end >= end) return "Las pausas deben quedar dentro del horario de la entrada.";
        if (i > 0 && b.start < sorted[i - 1].end) return "Las pausas no pueden pisarse entre sí.";
    }
    return null;
}
