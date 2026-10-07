/**
 * Validación de la API de agentes para clientes y proyectos (alta y edición). Reusa los esquemas
 * de las Server Actions: mismas reglas en la app y en la API.
 */

import { z } from "zod";
import { createClientSchema } from "./clients";
import { createProjectSchema, updateProjectSchema } from "./projects";

const uuid = z.string().uuid({ message: "ID inválido (esperado UUID)" });
/** Fecha de proyecto: YYYY-MM-DD (o null para borrarla). */
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Fecha inválida (YYYY-MM-DD)" });

export const apiCreateClientSchema = createClientSchema;
export type ApiCreateClientInput = z.input<typeof apiCreateClientSchema>;

/** Edición parcial; el acceso al portal (contraseña) se maneja solo desde la app. */
export const apiUpdateClientSchema = createClientSchema.partial().extend({ client_id: uuid });
export type ApiUpdateClientInput = z.input<typeof apiUpdateClientSchema>;

const dates = {
    start_date: ymd.nullable().optional().transform((d) => (d == null ? d : new Date(`${d}T00:00:00Z`))),
    end_date: ymd.nullable().optional().transform((d) => (d == null ? d : new Date(`${d}T00:00:00Z`))),
};

export const apiCreateProjectSchema = createProjectSchema.extend(dates);
export type ApiCreateProjectInput = z.input<typeof apiCreateProjectSchema>;

export const apiUpdateProjectSchema = updateProjectSchema.extend({ ...dates, project_id: uuid });
export type ApiUpdateProjectInput = z.input<typeof apiUpdateProjectSchema>;
