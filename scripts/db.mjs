#!/usr/bin/env node
/**
 * Runner de SQL contra la DB de Supabase (PRODUCCIÓN) para las migraciones
 * manuales y las verificaciones read-only.
 *
 *   node scripts/db.mjs query "SELECT ..."                       # transacción READ ONLY
 *   node scripts/db.mjs apply supabase/migrations/X.sql           # DRY-RUN: corre y hace ROLLBACK
 *   node scripts/db.mjs apply supabase/migrations/X.sql --commit  # aplica de verdad (COMMIT)
 *
 * Lee DATABASE_URL de `.env.local` (directorio actual) o, si se corre desde un
 * worktree, del `.env.local` del checkout principal. Nunca imprime la conexión.
 *
 * Garantías:
 * - Todo corre en UNA transacción: si algo falla, no queda nada a medias.
 * - `query` usa READ ONLY: no puede escribir aunque el SQL lo intente.
 * - lock_timeout corto: si una tabla está tomada, falla rápido en vez de
 *   encolar a la app de producción detrás de un ALTER.
 * - Igual que el SQL Editor: nada de CREATE INDEX CONCURRENTLY (no corre en transacción).
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { execSync } from "node:child_process";
import * as dotenv from "dotenv";
import pg from "pg";

function fail(message) {
    console.error(`✖ ${message}`);
    process.exit(1);
}

function loadDatabaseUrl() {
    const candidates = [resolve(".env.local")];
    try {
        const commonDir = execSync("git rev-parse --git-common-dir", { encoding: "utf8" }).trim();
        candidates.push(resolve(dirname(resolve(commonDir)), ".env.local"));
    } catch {
        // Fuera de un repo git: solo el cwd.
    }
    const envFile = candidates.find((f) => existsSync(f));
    if (!envFile) fail("No encontré .env.local (ni en el cwd ni en el checkout principal).");

    dotenv.config({ path: envFile, quiet: true });
    const raw = process.env.DATABASE_URL;
    if (!raw) fail(`DATABASE_URL no está definida en ${envFile}.`);

    // Igual que lib/prisma/client.ts: sslmode en la URL pisa la config `ssl` de pg.
    try {
        const url = new URL(raw);
        url.searchParams.delete("sslmode");
        return url.toString();
    } catch {
        return raw;
    }
}

async function withClient(fn) {
    const client = new pg.Client({
        connectionString: loadDatabaseUrl(),
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 10_000,
        application_name: "mykimai-db-script",
    });
    client.on("notice", (n) => console.log(`  NOTICE: ${n.message}`));
    await client.connect();
    try {
        return await fn(client);
    } finally {
        await client.end();
    }
}

function printResults(result) {
    const results = Array.isArray(result) ? result : [result];
    for (const r of results) {
        if (r.rows?.length) {
            console.table(r.rows);
        } else if (r.command) {
            console.log(`${r.command}${r.rowCount != null ? ` (${r.rowCount})` : ""}`);
        }
    }
}

async function runQuery(sql) {
    await withClient(async (client) => {
        await client.query("BEGIN READ ONLY");
        try {
            await client.query("SET LOCAL statement_timeout = '30s'");
            printResults(await client.query(sql));
        } finally {
            await client.query("ROLLBACK");
        }
    });
}

async function runApply(file, commit) {
    if (!existsSync(file)) fail(`No existe el archivo ${file}.`);
    const sql = readFileSync(file, "utf8");
    if (/\bCONCURRENTLY\b/i.test(sql.replace(/--.*$/gm, ""))) {
        fail("El SQL usa CONCURRENTLY, que no corre dentro de una transacción. Usá CREATE INDEX normal.");
    }

    const mode = commit ? "APPLY (COMMIT)" : "DRY-RUN (ROLLBACK)";
    console.log(`▶ ${mode}: ${file}`);

    await withClient(async (client) => {
        await client.query("BEGIN");
        try {
            await client.query("SET LOCAL lock_timeout = '5s'");
            await client.query("SET LOCAL statement_timeout = '120s'");
            printResults(await client.query(sql));
        } catch (error) {
            await client.query("ROLLBACK");
            fail(`Falló y se revirtió todo (ROLLBACK): ${error.message}`);
        }
        await client.query(commit ? "COMMIT" : "ROLLBACK");
    });

    console.log(
        commit
            ? "✔ Aplicada (COMMIT)."
            : "✔ DRY-RUN OK: corrió sin errores y se revirtió. No cambió nada. Para aplicar: --commit"
    );
}

const [command, arg, ...flags] = process.argv.slice(2);

try {
    if (command === "query" && arg) {
        await runQuery(arg);
    } else if (command === "apply" && arg) {
        await runApply(arg, flags.includes("--commit"));
    } else {
        fail(
            'Uso:\n  node scripts/db.mjs query "SELECT ..."\n  node scripts/db.mjs apply <archivo.sql> [--commit]'
        );
    }
} catch (error) {
    fail(error.message);
}
