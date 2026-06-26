import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(process.cwd()),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules", ".next", ".claude"],
    // DATABASE_URL dummy: si algún módulo bajo test importa el cliente Prisma,
    // el Pool se crea lazy (no conecta). La lógica testeada acá es pura.
    env: {
      DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    },
  },
});
