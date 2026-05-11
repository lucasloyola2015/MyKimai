import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getProjectWithRelations } from "@/lib/actions/projects";
import { getProjectMilestones } from "@/lib/actions/milestones";
import { MilestonesManager } from "./milestones-manager";

export const dynamic = "force-dynamic";

interface Props {
    params: { id: string };
}

export default async function ProjectMilestonesPage({ params }: Props) {
    const [project, milestones] = await Promise.all([
        getProjectWithRelations(params.id),
        getProjectMilestones(params.id),
    ]);

    if (!project) notFound();

    return (
        <div className="space-y-6">
            <div>
                <Link
                    href="/dashboard/projects"
                    className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
                >
                    <ArrowLeft className="mr-1 h-4 w-4" />
                    Proyectos
                </Link>
                <h1 className="mt-2 text-3xl font-bold">
                    Hitos — {project.name}
                </h1>
                <p className="text-muted-foreground">
                    Cliente: <span className="font-medium">{(project as any).clients?.name}</span>.
                    Definí entregables con fechas objetivo y horas
                    presupuestadas para mostrar progreso al cliente.
                </p>
            </div>

            <MilestonesManager
                projectId={params.id}
                projectCurrency={(project as any).currency ?? "USD"}
                initialMilestones={milestones}
            />
        </div>
    );
}
