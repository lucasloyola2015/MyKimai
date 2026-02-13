import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { format, differenceInMinutes } from "date-fns";
import { getClientContext } from "@/lib/auth/server";
import { prisma } from "@/lib/prisma/client";

export async function GET() {
    try {
        const context = await getClientContext();
        if (!context) {
            return NextResponse.json({ active: false });
        }

        const clientName = context.name;
        const now = new Date();

        // 1. PRIORIDAD: Buscar Timer Activo en la Base de Datos
        // Obtenemos el ID del admin para este cliente
        const clientModel = await prisma.clients.findUnique({
            where: { id: context.clientId },
            select: { user_id: true }
        });

        if (clientModel) {
            const activeEntry = await prisma.time_entries.findFirst({
                where: {
                    user_id: clientModel.user_id,
                    end_time: null
                },
                include: {
                    tasks: {
                        include: {
                            projects: true
                        }
                    }
                }
            });

            // Solo mostramos el detalle si el proyecto pertenece a este cliente (Privacidad)
            // Note: need to check if activeEntry.tasks and activeEntry.tasks.projects exist and if client_id match
            if (activeEntry && activeEntry.tasks?.projects?.client_id === context.clientId) {
                const start = new Date(activeEntry.start_time);
                const diffMinutes = differenceInMinutes(now, start);
                const hours = (diffMinutes / 60).toFixed(2);

                return NextResponse.json({
                    active: true,
                    mode: "timer",
                    project: activeEntry.tasks.projects.name,
                    task: activeEntry.tasks.name,
                    elapsed: `${hours}h`,
                    milestone: `${activeEntry.tasks.projects.name} / ${activeEntry.tasks.name} : ${hours}h`
                });
            }
        }

        // 2. FALLBACK: Analizar el Log de Sesión (Markdown)
        const fileName = `${format(now, "yyyy-MM-dd")}.md`;
        const filePath = path.join(process.cwd(), "session", fileName);

        if (!fs.existsSync(filePath)) {
            return NextResponse.json({ active: false });
        }

        const stats = fs.statSync(filePath);
        const lastModified = stats.mtime;
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

        if (lastModified < oneHourAgo) {
            return NextResponse.json({ active: false });
        }

        const content = fs.readFileSync(filePath, "utf-8");
        const lines = content.split("\n");
        const milestones = lines.filter(line => line.trim().startsWith("- ["));

        if (milestones.length === 0) {
            return NextResponse.json({ active: false });
        }

        // Buscamos hitos para este cliente o globales [ALL]
        const relevantMilestones = milestones.filter(m => {
            const lower = m.toLowerCase();
            return lower.includes("[all]") || lower.includes(`[${clientName.toLowerCase()}]`);
        });

        if (relevantMilestones.length === 0) {
            return NextResponse.json({ active: false });
        }

        const lastMilestoneLine = relevantMilestones[relevantMilestones.length - 1];
        const cleanedMilestone = lastMilestoneLine.replace(/^- \[\d{2}:\d{2}\] \[[^\]]+\] /, "").trim();

        return NextResponse.json({
            active: true,
            mode: "log",
            milestone: cleanedMilestone,
            timestamp: lastModified
        });

    } catch (error) {
        console.error("[WORK-STATUS] Error:", error);
        return NextResponse.json({ active: false }, { status: 500 });
    }
}
