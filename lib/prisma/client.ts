import { PrismaClient } from "@/lib/generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
};

function createPrisma() {
    const connectionString = process.env.DATABASE_URL;
    
    // #region agent log
    try {
        const fs = require('fs');
        const logPath = 'c:\\Users\\loyol\\Documents\\MyKimai\\.cursor\\debug.log';
        const logData = {
            location: 'lib/prisma/client.ts:8',
            message: 'createPrisma called',
            data: {
                hasConnectionString: !!connectionString,
                connectionStringLength: connectionString?.length || 0,
                connectionStringPreview: connectionString ? connectionString.substring(0, 50) + '...' : 'none',
                timestamp: Date.now(),
            },
            timestamp: Date.now(),
            sessionId: 'debug-session',
            runId: 'run1',
            hypothesisId: 'A'
        };
        fs.appendFileSync(logPath, JSON.stringify(logData) + '\n');
    } catch (e) {}
    // #endregion
    
    if (!connectionString) {
        // #region agent log
        try {
            const fs = require('fs');
            const logPath = 'c:\\Users\\loyol\\Documents\\MyKimai\\.cursor\\debug.log';
            const logData = {
                location: 'lib/prisma/client.ts:25',
                message: 'DATABASE_URL missing',
                data: { timestamp: Date.now() },
                timestamp: Date.now(),
                sessionId: 'debug-session',
                runId: 'run1',
                hypothesisId: 'B'
            };
            fs.appendFileSync(logPath, JSON.stringify(logData) + '\n');
        } catch (e) {}
        // #endregion
        throw new Error("DATABASE_URL is required for Prisma");
    }
    
    try {
        // #region agent log
        try {
            const fs = require('fs');
            const logPath = 'c:\\Users\\loyol\\Documents\\MyKimai\\.cursor\\debug.log';
            const logData = {
                location: 'lib/prisma/client.ts:35',
                message: 'Creating PrismaPg adapter',
                data: { timestamp: Date.now() },
                timestamp: Date.now(),
                sessionId: 'debug-session',
                runId: 'run1',
                hypothesisId: 'C'
            };
            fs.appendFileSync(logPath, JSON.stringify(logData) + '\n');
        } catch (e) {}
        // #endregion
        
        const adapter = new PrismaPg({ connectionString });
        
        // #region agent log
        try {
            const fs = require('fs');
            const logPath = 'c:\\Users\\loyol\\Documents\\MyKimai\\.cursor\\debug.log';
            const logData = {
                location: 'lib/prisma/client.ts:42',
                message: 'Creating PrismaClient',
                data: { hasAdapter: !!adapter, timestamp: Date.now() },
                timestamp: Date.now(),
                sessionId: 'debug-session',
                runId: 'run1',
                hypothesisId: 'D'
            };
            fs.appendFileSync(logPath, JSON.stringify(logData) + '\n');
        } catch (e) {}
        // #endregion
        
        const client = new PrismaClient({
            adapter,
            log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
        });
        
        // #region agent log
        try {
            const fs = require('fs');
            const logPath = 'c:\\Users\\loyol\\Documents\\MyKimai\\.cursor\\debug.log';
            const logData = {
                location: 'lib/prisma/client.ts:52',
                message: 'PrismaClient created successfully',
                data: { hasClient: !!client, timestamp: Date.now() },
                timestamp: Date.now(),
                sessionId: 'debug-session',
                runId: 'run1',
                hypothesisId: 'E'
            };
            fs.appendFileSync(logPath, JSON.stringify(logData) + '\n');
        } catch (e) {}
        // #endregion
        
        return client;
    } catch (error) {
        // #region agent log
        try {
            const fs = require('fs');
            const logPath = 'c:\\Users\\loyol\\Documents\\MyKimai\\.cursor\\debug.log';
            const logData = {
                location: 'lib/prisma/client.ts:62',
                message: 'Error creating Prisma client',
                data: {
                    errorMessage: error instanceof Error ? error.message : String(error),
                    errorStack: error instanceof Error ? error.stack : undefined,
                    timestamp: Date.now(),
                },
                timestamp: Date.now(),
                sessionId: 'debug-session',
                runId: 'run1',
                hypothesisId: 'F'
            };
            fs.appendFileSync(logPath, JSON.stringify(logData) + '\n');
        } catch (e) {}
        // #endregion
        throw error;
    }
}

export const prisma = globalForPrisma.prisma ?? createPrisma();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
