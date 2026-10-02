import { describe, it, expect } from "vitest";
import {
  DEFAULT_PROJECT_FILTERS,
  countProjectsByStatus,
  filterAndSortProjects,
  groupProjectsByClient,
  hasActiveProjectFilters,
  parseProjectFilters,
  projectFiltersToSearchParams,
  type FilterableProject,
  type ProjectFilters,
} from "@/lib/utils/project-filters";

const project = (over: Partial<FilterableProject> & { id: string }): FilterableProject => ({
  name: over.id,
  description: null,
  status: "active",
  client_id: "c1",
  is_billable: true,
  created_at: "2026-01-01T00:00:00Z",
  clients: { name: "Illinois Agustin", is_billable: true },
  ...over,
});

const filters = (over: Partial<ProjectFilters> = {}): ProjectFilters => ({
  ...DEFAULT_PROJECT_FILTERS,
  ...over,
});

const ids = (list: FilterableProject[]) => list.map((p) => p.id);

const PROJECTS = [
  project({ id: "a", name: "Prensa hidráulica", created_at: "2026-03-01T00:00:00Z" }),
  project({ id: "b", name: "Banco de pruebas", status: "completed", created_at: "2026-02-01T00:00:00Z" }),
  project({
    id: "c",
    name: "Web personal",
    client_id: "c2",
    clients: { name: "Lucas Loyola", is_billable: false },
    created_at: "2026-04-01T00:00:00Z",
  }),
  project({
    id: "d",
    name: "Automatización línea 2",
    client_id: "c3",
    is_billable: false,
    clients: { name: "Interlabs", is_billable: true },
    description: "PLC y tablero",
    created_at: "2026-05-01T00:00:00Z",
  }),
  project({ id: "e", name: "Mantenimiento", status: "paused", created_at: "2026-01-15T00:00:00Z" }),
];

describe("filterAndSortProjects — estado", () => {
  it("por defecto muestra solo los activos", () => {
    expect(ids(filterAndSortProjects(PROJECTS, filters({ sort: "name" })))).toEqual(["d", "a", "c"]);
  });

  it("'all' muestra todos los estados", () => {
    expect(filterAndSortProjects(PROJECTS, filters({ status: "all" }))).toHaveLength(5);
  });

  it("filtra por un estado puntual", () => {
    expect(ids(filterAndSortProjects(PROJECTS, filters({ status: "completed" })))).toEqual(["b"]);
  });
});

describe("filterAndSortProjects — cliente, facturación y búsqueda", () => {
  it("filtra por cliente", () => {
    expect(ids(filterAndSortProjects(PROJECTS, filters({ status: "all", clientId: "c1", sort: "name" })))).toEqual([
      "b",
      "e",
      "a",
    ]);
  });

  it("facturable efectivo: el cliente no facturable lo hereda al proyecto", () => {
    const billable = filterAndSortProjects(PROJECTS, filters({ billable: "billable", sort: "name" }));
    const nonBillable = filterAndSortProjects(PROJECTS, filters({ billable: "non_billable", sort: "name" }));
    expect(ids(billable)).toEqual(["a"]);
    // c: cliente no facturable · d: proyecto no facturable
    expect(ids(nonBillable)).toEqual(["d", "c"]);
  });

  it("busca en nombre, cliente y descripción, sin acentos ni mayúsculas", () => {
    expect(ids(filterAndSortProjects(PROJECTS, filters({ query: "HIDRAULICA" })))).toEqual(["a"]);
    expect(ids(filterAndSortProjects(PROJECTS, filters({ query: "interlabs" })))).toEqual(["d"]);
    expect(ids(filterAndSortProjects(PROJECTS, filters({ query: "plc" })))).toEqual(["d"]);
  });

  it("todos los términos de la búsqueda tienen que coincidir", () => {
    expect(ids(filterAndSortProjects(PROJECTS, filters({ query: "illinois prensa" })))).toEqual(["a"]);
    expect(filterAndSortProjects(PROJECTS, filters({ query: "illinois web" }))).toHaveLength(0);
  });
});

describe("filterAndSortProjects — orden", () => {
  const all = filters({ status: "all" });

  it("por última actividad; los que no tienen horas al final por fecha de creación", () => {
    const lastActivity = { b: "2026-09-30T10:00:00Z", e: new Date("2026-09-01T10:00:00Z") };
    expect(ids(filterAndSortProjects(PROJECTS, { ...all, sort: "activity" }, lastActivity))).toEqual([
      "b",
      "e",
      "d",
      "c",
      "a",
    ]);
  });

  it("por más recientes (creación)", () => {
    expect(ids(filterAndSortProjects(PROJECTS, { ...all, sort: "recent" }))).toEqual(["d", "c", "a", "b", "e"]);
  });

  it("por cliente y luego nombre", () => {
    expect(ids(filterAndSortProjects(PROJECTS, { ...all, sort: "client" }))).toEqual(["b", "e", "a", "d", "c"]);
  });

  it("no muta el array original", () => {
    const copy = [...PROJECTS];
    filterAndSortProjects(PROJECTS, { ...all, sort: "name" });
    expect(PROJECTS).toEqual(copy);
  });
});

describe("countProjectsByStatus", () => {
  it("cuenta por estado respetando los demás filtros", () => {
    expect(countProjectsByStatus(PROJECTS, filters({ clientId: "c1" }))).toEqual({
      active: 1,
      paused: 1,
      completed: 1,
      cancelled: 0,
      all: 3,
    });
  });
});

describe("groupProjectsByClient", () => {
  it("agrupa conservando el orden recibido", () => {
    const sorted = filterAndSortProjects(PROJECTS, filters({ status: "all", sort: "client" }));
    expect(
      groupProjectsByClient(sorted).map((g) => [g.clientName, ids(g.projects)])
    ).toEqual([
      ["Illinois Agustin", ["b", "e", "a"]],
      ["Interlabs", ["d"]],
      ["Lucas Loyola", ["c"]],
    ]);
  });
});

describe("filtros ⇄ URL", () => {
  it("los defaults no ensucian la URL", () => {
    expect(projectFiltersToSearchParams(DEFAULT_PROJECT_FILTERS).toString()).toBe("");
    expect(hasActiveProjectFilters(DEFAULT_PROJECT_FILTERS)).toBe(false);
  });

  it("ida y vuelta conserva los filtros", () => {
    const f = filters({ status: "all", clientId: "c1", billable: "non_billable", sort: "name", query: "prensa" });
    expect(parseProjectFilters(projectFiltersToSearchParams(f))).toEqual(f);
    expect(hasActiveProjectFilters(f)).toBe(true);
  });

  it("valores desconocidos en la URL caen al default", () => {
    expect(parseProjectFilters(new URLSearchParams("status=borrado&sort=x&billable=y"))).toEqual(
      DEFAULT_PROJECT_FILTERS
    );
  });

  it("cambiar solo el orden no cuenta como filtro activo", () => {
    expect(hasActiveProjectFilters(filters({ sort: "name" }))).toBe(false);
  });
});
