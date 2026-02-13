import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    const clients = await prisma.clients.findMany({
        where: {
            portal_user_id: { not: null }
        },
        select: {
            id: true,
            name: true,
            portal_user_id: true
        }
    });

    console.log("Clients with Portal User ID:");
    console.log(JSON.stringify(clients, null, 2));

    const clientUsers = await prisma.client_users.findMany({
        include: {
            clients: {
                select: { name: true }
            }
        }
    });

    console.log("\nClient Users (links):");
    console.log(JSON.stringify(clientUsers, null, 2));
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
