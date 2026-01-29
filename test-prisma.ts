
import { prisma } from "./lib/prisma/client";

async function main() {
    try {
        const counts = await prisma.time_entries.count({
            where: {
                is_billed: false
            } as any
        });
        console.log("Unbilled count:", counts);
    } catch (error) {
        console.error("Test failed:", error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
