/**
 * Selección múltiple de clientes (filtro de Mis Horas).
 *
 * Lógica pura (sin React ni Prisma) para poder testearla. Una lista vacía
 * significa "todos los clientes" (sin filtro).
 */

export interface SelectableClient {
    id: string;
    name: string;
}

/** Texto del botón: "Todos los clientes", el nombre del único elegido o "N clientes". */
export function clientSelectionLabel(
    selectedIds: readonly string[],
    clients: readonly SelectableClient[]
): string {
    const known = selectedIds.filter((id) => clients.some((c) => c.id === id));
    if (known.length === 0) return "Todos los clientes";
    if (known.length === 1) return clients.find((c) => c.id === known[0])!.name;
    return `${known.length} clientes`;
}

/** Agrega o quita un id, conservando el orden de los demás. */
export function toggleSelectedId(selectedIds: readonly string[], id: string): string[] {
    return selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : [...selectedIds, id];
}

/** Proyectos de los clientes elegidos (ninguno si no hay clientes elegidos). */
export function projectsOfClients<P extends { client_id: string }>(
    projects: readonly P[],
    selectedIds: readonly string[]
): P[] {
    if (selectedIds.length === 0) return [];
    const set = new Set(selectedIds);
    return projects.filter((p) => set.has(p.client_id));
}
