import { getTeamMembers } from "@/lib/actions/team-members";
import { TeamMembersManager } from "./team-members-manager";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
    const members = await getTeamMembers();

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold">Equipo</h1>
                <p className="text-muted-foreground">
                    Invitá colaboradores para que carguen horas en tus proyectos
                    sin compartir credenciales.
                </p>
            </div>
            <TeamMembersManager initialMembers={members} />
        </div>
    );
}
