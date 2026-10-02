/**
 * Regla de solapamiento de horas cargadas por API (lógica pura → testeable).
 *
 * - Solapar con horas del MISMO proyecto: nunca (sería cobrar dos veces las
 *   mismas horas). El agente debe ofrecer editar la entrada existente o
 *   ajustar el horario.
 * - Solapar con horas de OTROS proyectos: permitido (trabajo en paralelo),
 *   pero solo con confirmación explícita del usuario (`allow_overlap: true`).
 *   Sin ella la API rechaza y devuelve los conflictos, para que el agente
 *   pregunte qué hacer.
 */

export interface OverlapView {
    id: string;
    title: string | null;
    project_id: string;
    project: string;
    start_time: string;
    end_time: string | null;
    same_project: boolean;
}

export type OverlapVerdict =
    | { ok: true }
    | { ok: false; reason: "same_project" | "needs_confirmation"; error: string; overlaps: OverlapView[] };

export function judgeOverlaps(overlaps: OverlapView[], allowOverlap: boolean): OverlapVerdict {
    const sameProject = overlaps.filter((o) => o.same_project);
    if (sameProject.length > 0) {
        return {
            ok: false,
            reason: "same_project",
            error:
                "Ya hay horas de ESTE proyecto en ese horario. No se pueden duplicar: " +
                "preguntale al usuario si quiere completar/editar la entrada existente (update_time_entry) o ajustar el horario.",
            overlaps,
        };
    }
    if (overlaps.length > 0 && !allowOverlap) {
        return {
            ok: false,
            reason: "needs_confirmation",
            error:
                "Ya hay horas de OTROS proyectos en ese horario. Mostráselas al usuario y preguntale qué hacer; " +
                "si confirma que fue trabajo en paralelo, reintentá con allow_overlap=true.",
            overlaps,
        };
    }
    return { ok: true };
}
