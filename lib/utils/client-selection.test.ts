import { describe, it, expect } from "vitest";
import {
  clientSelectionLabel,
  projectsOfClients,
  toggleSelectedId,
} from "@/lib/utils/client-selection";

const clients = [
  { id: "j", name: "Illinois Jeremias" },
  { id: "a", name: "Illinois Agustin" },
  { id: "e", name: "Illinois Ezequiel" },
];

describe("clientSelectionLabel", () => {
  it("sin selección = todos", () => {
    expect(clientSelectionLabel([], clients)).toBe("Todos los clientes");
  });
  it("uno = su nombre", () => {
    expect(clientSelectionLabel(["a"], clients)).toBe("Illinois Agustin");
  });
  it("varios = cantidad", () => {
    expect(clientSelectionLabel(["j", "a", "e"], clients)).toBe("3 clientes");
  });
  it("ignora ids que no están en la lista", () => {
    expect(clientSelectionLabel(["x"], clients)).toBe("Todos los clientes");
    expect(clientSelectionLabel(["x", "e"], clients)).toBe("Illinois Ezequiel");
  });
});

describe("toggleSelectedId", () => {
  it("agrega y quita", () => {
    expect(toggleSelectedId(["j"], "a")).toEqual(["j", "a"]);
    expect(toggleSelectedId(["j", "a"], "j")).toEqual(["a"]);
  });
});

describe("projectsOfClients", () => {
  const projects = [
    { id: "p1", client_id: "j" },
    { id: "p2", client_id: "a" },
    { id: "p3", client_id: "e" },
  ];
  it("sin clientes elegidos no hay proyectos", () => {
    expect(projectsOfClients(projects, [])).toEqual([]);
  });
  it("filtra por los clientes elegidos", () => {
    expect(projectsOfClients(projects, ["j", "e"]).map((p) => p.id)).toEqual(["p1", "p3"]);
  });
});
