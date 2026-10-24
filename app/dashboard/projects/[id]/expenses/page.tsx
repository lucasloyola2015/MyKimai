import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getProjectWithRelations } from "@/lib/actions/projects";
import { getProjectExpenses } from "@/lib/actions/expenses";
import { ExpensesManager } from "./expenses-manager";

export const dynamic = "force-dynamic";

interface Props {
    params: { id: string };
}

export default async function ProjectExpensesPage({ params }: Props) {
    const [project, expenses] = await Promise.all([
        getProjectWithRelations(params.id),
        getProjectExpenses(params.id),
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
                    Gastos — {project.name}
                </h1>
                <p className="text-muted-foreground">
                    Cliente: <span className="font-medium">{(project as any).clients?.name}</span>.
                    Compras y gastos del proyecto que se le refacturan al cliente: entran
                    en la próxima factura como una línea de detalle. Los comprobantes
                    adjuntos quedan solo en el sistema.
                </p>
            </div>

            <ExpensesManager projectId={params.id} initialExpenses={expenses} />
        </div>
    );
}
