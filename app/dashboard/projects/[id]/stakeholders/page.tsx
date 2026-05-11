import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getProjectWithRelations } from "@/lib/actions/projects";
import { getProjectStakeholders } from "@/lib/actions/project-access";
import { StakeholdersManager } from "./stakeholders-manager";

export const dynamic = "force-dynamic";

interface Props {
    params: { id: string };
}

export default async function ProjectStakeholdersPage({ params }: Props) {
    const [project, stakeholders] = await Promise.all([
        getProjectWithRelations(params.id),
        getProjectStakeholders(params.id),
    ]);

    if (!project) notFound();

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <Link
                        href="/dashboard/projects"
                        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
                    >
                        <ArrowLeft className="mr-1 h-4 w-4" />
                        Proyectos
                    </Link>
                    <h1 className="mt-2 text-3xl font-bold">
                        Stakeholders — {project.name}
                    </h1>
                    <p className="text-muted-foreground">
                        Cliente: <span className="font-medium">{(project as any).clients?.name}</span>.
                        Definí qué usuarios del portal del cliente pueden ver este proyecto.
                    </p>
                </div>
            </div>

            <StakeholdersManager
                projectId={params.id}
                initialStakeholders={stakeholders}
            />
        </div>
    );
}
