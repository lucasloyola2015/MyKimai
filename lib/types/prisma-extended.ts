/**
 * Tipos extendidos de Prisma con relaciones comunes
 * Estos tipos ayudan a evitar el uso de 'as any' cuando se trabajan con relaciones
 */

import type {
    time_entries,
    tasks,
    projects,
    clients,
    invoices,
    invoice_items,
} from "@prisma/client";

/**
 * Time entry con todas sus relaciones
 */
export type TimeEntryWithRelations = time_entries & {
    task?: tasks & {
        project?: projects & {
            client?: clients;
        };
    };
};

/**
 * Task con todas sus relaciones
 */
export type TaskWithRelations = tasks & {
    project?: projects & {
        client?: clients;
    };
};

/**
 * Invoice con cliente
 */
export type InvoiceWithClient = invoices & {
    client: clients;
};

/**
 * Invoice con items y relaciones completas
 */
export type InvoiceWithItems = invoices & {
    client: clients;
    invoice_items: (invoice_items & {
        time_entry?: time_entries & {
            task?: tasks & {
                project?: projects & {
                    client?: clients;
                };
            };
        };
    })[];
};
