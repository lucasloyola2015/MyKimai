/**
 * Filtros y orden de la vista de Proyectos (/dashboard/projects).
 *
 * Lógica pura (sin React ni Prisma) para poder testearla. El estado de los
 * filtros se refleja en la URL (`?status=all&client=<id>&sort=name&q=...`)
 * para que se conserve al volver desde el detalle de un proyecto.
 */

export type ProjectStatusFilter = "active" | "paused" | "completed" | "cancelled" | "all";
export type ProjectBillableFilter = "all" | "billable" | "non_billable";
export type ProjectSort = "activity" | "recent" | "name" | "client";

export interface ProjectFilters {
    status: ProjectStatusFilter;
    /** "" = todos los clientes. */
    clientId: string;
    billable: ProjectBillableFilter;
    sort: ProjectSort;
    query: string;
}

/** Por defecto se ven solo los activos, ordenados por última actividad. */
export const DEFAULT_PROJECT_FILTERS: ProjectFilters = {
    status: "active",
    clientId: "",
    billable: "all",
    sort: "activity",
    query: "",
};

const STATUS_VALUES: ProjectStatusFilter[] = ["active", "paused", "completed", "cancelled", "all"];
const BILLABLE_VALUES: ProjectBillableFilter[] = ["all", "billable", "non_billable"];
const SORT_VALUES: ProjectSort[] = ["activity", "recent", "name", "client"];

/** Lo mínimo que necesitan los filtros de cada proyecto. */
export interface FilterableProject {
    id: string;
    name: string;
    description: string | null;
    status: string;
    client_id: string;
    is_billable: boolean;
    created_at: Date | string;
    clients: { name: string; is_billable: boolean };
}

/** Fecha de la última hora cargada, por project id (sin entrada = sin horas). */
export type LastActivityMap = Record<string, Date | string>;

/** Facturable efectivo: el cliente no facturable lo hereda a sus proyectos. */
export function isProjectBillable(project: FilterableProject): boolean {
    return project.is_billable && project.clients.is_billable;
}

/** Minúsculas y sin acentos, para que "facturacion" encuentre "Facturación". */
function normalize(text: string): string {
    return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function matchesQuery(project: FilterableProject, query: string): boolean {
    const terms = normalize(query).split(/\s+/).filter(Boolean);
    if (terms.length === 0) return true;
    const haystack = normalize(
        [project.name, project.clients.name, project.description ?? ""].join(" ")
    );
    return terms.every((term) => haystack.includes(term));
}

/** Todos los filtros salvo el de estado (lo usan también los contadores). */
function matchesNonStatusFilters(project: FilterableProject, filters: ProjectFilters): boolean {
    if (filters.clientId && project.client_id !== filters.clientId) return false;
    if (filters.billable === "billable" && !isProjectBillable(project)) return false;
    if (filters.billable === "non_billable" && isProjectBillable(project)) return false;
    return matchesQuery(project, filters.query);
}

const time = (date: Date | string) => new Date(date).getTime();

function compareProjects(
    a: FilterableProject,
    b: FilterableProject,
    sort: ProjectSort,
    lastActivity: LastActivityMap
): number {
    const byName = a.name.localeCompare(b.name, "es", { sensitivity: "base" });
    const byCreatedDesc = time(b.created_at) - time(a.created_at);

    switch (sort) {
        case "activity": {
            // Los que nunca tuvieron horas van al final, por fecha de creación.
            const la = lastActivity[a.id];
            const lb = lastActivity[b.id];
            if (la && lb) return time(lb) - time(la) || byName;
            if (la) return -1;
            if (lb) return 1;
            return byCreatedDesc || byName;
        }
        case "recent":
            return byCreatedDesc || byName;
        case "name":
            return byName;
        case "client":
            return a.clients.name.localeCompare(b.clients.name, "es", { sensitivity: "base" }) || byName;
    }
}

/** Aplica los filtros y devuelve una copia ordenada. */
export function filterAndSortProjects<T extends FilterableProject>(
    projects: T[],
    filters: ProjectFilters,
    lastActivity: LastActivityMap = {}
): T[] {
    return projects
        .filter(
            (p) =>
                (filters.status === "all" || p.status === filters.status) &&
                matchesNonStatusFilters(p, filters)
        )
        .sort((a, b) => compareProjects(a, b, filters.sort, lastActivity));
}

/**
 * Cantidad de proyectos por estado respetando los demás filtros (cliente,
 * facturación, búsqueda), para mostrar en cada pestaña de estado.
 */
export function countProjectsByStatus(
    projects: FilterableProject[],
    filters: ProjectFilters
): Record<ProjectStatusFilter, number> {
    const counts: Record<ProjectStatusFilter, number> = {
        active: 0,
        paused: 0,
        completed: 0,
        cancelled: 0,
        all: 0,
    };
    for (const p of projects) {
        if (!matchesNonStatusFilters(p, filters)) continue;
        counts.all++;
        if (p.status in counts) counts[p.status as ProjectStatusFilter]++;
    }
    return counts;
}

/** Agrupa (ya ordenados) por cliente, conservando el orden de aparición. */
export function groupProjectsByClient<T extends FilterableProject>(
    projects: T[]
): { clientId: string; clientName: string; projects: T[] }[] {
    const groups = new Map<string, { clientId: string; clientName: string; projects: T[] }>();
    for (const p of projects) {
        let group = groups.get(p.client_id);
        if (!group) {
            group = { clientId: p.client_id, clientName: p.clients.name, projects: [] };
            groups.set(p.client_id, group);
        }
        group.projects.push(p);
    }
    return Array.from(groups.values());
}

/** ¿Hay algún filtro aplicado distinto del default? (el orden no cuenta) */
export function hasActiveProjectFilters(filters: ProjectFilters): boolean {
    return (
        filters.status !== DEFAULT_PROJECT_FILTERS.status ||
        filters.clientId !== "" ||
        filters.billable !== "all" ||
        filters.query.trim() !== ""
    );
}

function pick<T extends string>(value: string | null, allowed: T[], fallback: T): T {
    return value && (allowed as string[]).includes(value) ? (value as T) : fallback;
}

/** Lee los filtros de la URL; valores desconocidos caen al default. */
export function parseProjectFilters(params: { get(name: string): string | null }): ProjectFilters {
    return {
        status: pick(params.get("status"), STATUS_VALUES, DEFAULT_PROJECT_FILTERS.status),
        clientId: params.get("client") ?? "",
        billable: pick(params.get("billable"), BILLABLE_VALUES, DEFAULT_PROJECT_FILTERS.billable),
        sort: pick(params.get("sort"), SORT_VALUES, DEFAULT_PROJECT_FILTERS.sort),
        query: params.get("q") ?? "",
    };
}

/** Serializa los filtros a query string, omitiendo los valores por defecto. */
export function projectFiltersToSearchParams(filters: ProjectFilters): URLSearchParams {
    const params = new URLSearchParams();
    if (filters.status !== DEFAULT_PROJECT_FILTERS.status) params.set("status", filters.status);
    if (filters.clientId) params.set("client", filters.clientId);
    if (filters.billable !== DEFAULT_PROJECT_FILTERS.billable) params.set("billable", filters.billable);
    if (filters.sort !== DEFAULT_PROJECT_FILTERS.sort) params.set("sort", filters.sort);
    if (filters.query.trim()) params.set("q", filters.query.trim());
    return params;
}
