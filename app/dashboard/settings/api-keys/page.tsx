import { listApiKeys, canRequestFinancialScope } from "@/lib/actions/api-keys";
import { ApiKeysManager } from "./api-keys-manager";

export const dynamic = "force-dynamic";

export default async function ApiKeysPage() {
    const [keys, canFinancials] = await Promise.all([
        listApiKeys(),
        canRequestFinancialScope(),
    ]);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold">API keys</h1>
                <p className="text-muted-foreground">
                    Para que tus agentes de IA consulten y carguen horas a tu nombre.
                    Las horas que cargan aparecen con 🤖 en Mis Horas.
                </p>
            </div>
            <ApiKeysManager keys={keys} canRequestFinancials={canFinancials} />
        </div>
    );
}
