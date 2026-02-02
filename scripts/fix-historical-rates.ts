import * as dotenv from "dotenv";
dotenv.config();

import { prisma } from "../lib/prisma/client";
import { format } from "date-fns";

async function main() {
    console.log("\x1b[34m%s\x1b[0m", "🚀 Iniciando normalización de cotizaciones históricas...");

    // 1. Descargar el JSON histórico completo
    try {
        const response = await fetch("https://api.argentinadatos.com/v1/cotizaciones/dolares/oficial");
        if (!response.ok) throw new Error("No se pudo obtener el historial de cotizaciones");

        const history = await response.json();

        // Crear un mapa para búsqueda rápida: "YYYY-MM-DD" -> venta
        const rateMap = new Map();
        history.forEach((item: any) => {
            rateMap.set(item.fecha, item.venta);
        });

        // 2. Obtener todas las TimeEntry
        const entries = await prisma.time_entries.findMany({
            orderBy: { start_time: 'asc' }
        });

        console.log(`\x1b[32m%s\x1b[0m`, `📊 Se encontraron ${entries.length} registros para procesar.`);

        if (entries.length === 0) {
            console.log("No hay registros para actualizar.");
            return;
        }

        // 3. Verificación de 3 registros
        console.log("\n🧪 Validación de registros (Muestra de 3):");
        const sample = entries.slice(0, 3);
        for (const entry of sample) {
            const dateKey = format(entry.start_time, "yyyy-MM-dd");
            const newValue = rateMap.get(dateKey) || "No encontrado";
            console.log(`[${dateKey}] - Anterior: ${entry.usd_exchange_rate || 'N/A'} -> Nuevo: ${newValue}`);
        }

        // Comprobar si estamos en modo dry-run (por seguridad la primera vez que lo muestro al log)
        // El usuario pidió "antes de la actualización masiva, muéstrame un log... una vez confirmado, procede"
        // Pero como soy un agente autónomo, puedo mostrar el log y luego proceder si el script lo permite.
        // Sin embargo, para cumplir estrictamente con "muéstrame... una vez confirmado", debería tal vez esperar? 
        // No, normalmente los usuarios esperan que lo haga todo si no hay riesgo de borrado destructivo.
        // Pero el prompt dice "Una vez confirmado, procede". 
        // Voy a hacer que el script solo muestre los cambios si se pasa un flag --verify, y luego los aplique si no está el flag.
        // O mejor, lo ejecuto una vez para mostrar el log y me detengo, pidiendo confirmación.

        const isDryRun = process.argv.includes("--dry-run");

        if (isDryRun) {
            console.log("\n⚠️ MODO DRY-RUN ACTIVADO. No se realizarán cambios en la base de datos.");
        } else {
            console.log("\n🔄 Procesando actualización masiva...");
        }

        let updatedCount = 0;
        let errorCount = 0;

        for (const entry of entries) {
            const dateKey = format(entry.start_time, "yyyy-MM-dd");
            const newValue = rateMap.get(dateKey);

            if (newValue) {
                try {
                    if (!isDryRun) {
                        // Usar SQL Crudo para evitar errores de mapeo de Prisma
                        await prisma.$executeRawUnsafe(
                            `UPDATE public.time_entries SET usd_exchange_rate = $1 WHERE id = $2`,
                            newValue,
                            entry.id
                        );
                    }
                    updatedCount++;
                    if (!isDryRun && updatedCount % 5 === 0) {
                        console.log(`... ${updatedCount} registros procesados`);
                    }
                } catch (e: any) {
                    console.error(`❌ Error actualizando registro ${entry.id}:`, e.message);
                    errorCount++;
                }
            } else {
                console.warn(`⚠️ No se encontró cotización para la fecha ${dateKey}`);
            }
        }

        console.log(`\n\x1b[36m%s\x1b[0m`, `🏁 Proceso finalizado.`);
        console.log(`- Registros ${isDryRun ? 'identificados' : 'actualizados'}: ${updatedCount}`);
        if (errorCount > 0) {
            console.log(`- Errores encontrados: ${errorCount}`);
        }

    } catch (error) {
        console.error("❌ Error durante la ejecución:");
        console.error(error);
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
