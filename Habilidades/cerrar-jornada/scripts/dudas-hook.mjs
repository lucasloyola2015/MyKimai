#!/usr/bin/env node
/**
 * Hook `UserPromptSubmit` de Claude Code para el reparto de dudas del agente de horas.
 *
 * La corrida de las 7 no puede escribirle a otras sesiones (es desatendida) y el aviso de fin de
 * corrida no despierta a ninguna sesión. Este hook se lo dice al Claude de la primera sesión donde
 * Lucas escribe (esa sí está atendida): si hay dudas sin repartir en ~/.mykimai/sync/dudas.json, le
 * pide que siga "Reparto de dudas" de AGENTE.md. Como mucho una vez cada 2 horas; sin dudas
 * pendientes, no dice nada. Nunca frena el prompt: ante cualquier error, sale sin decir nada.
 *
 * Registro en ~/.claude/settings.json:
 *   "hooks": { "UserPromptSubmit": [ { "hooks": [ { "type": "command",
 *     "command": "node C:/Users/loyol/.claude/skills/cerrar-jornada/scripts/dudas-hook.mjs" } ] } ] }
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

const SYNC_DIR = process.env.MYKIMAI_SYNC_DIR ?? join(homedir(), ".mykimai", "sync");
const DUDAS_FILE = join(SYNC_DIR, "dudas.json");
const MARK_FILE = join(SYNC_DIR, "hook.json");
const EVERY_MS = 2 * 60 * 60 * 1000;
const AGENTE = "C:/Users/loyol/.claude/skills/cerrar-jornada/AGENTE.md";

const readJson = (file) => JSON.parse(readFileSync(file, "utf8").replace(/^\uFEFF/, ""));

async function main() {
    let input = "";
    for await (const chunk of process.stdin) input += chunk;
    // La corrida de las 7 (desatendida) no puede repartir: no se lo pidas.
    if (input.includes("[mykimai-sync]")) return;

    const pending = (readJson(DUDAS_FILE).dudas ?? []).filter((d) => !d.notified_at);
    if (!pending.length) return;

    let last = 0;
    try { last = Date.parse(readJson(MARK_FILE).reminded_at) || 0; } catch { /* primera vez */ }
    if (Date.now() - last < EVERY_MS) return;
    mkdirSync(dirname(MARK_FILE), { recursive: true });
    writeFileSync(MARK_FILE, JSON.stringify({ reminded_at: new Date().toISOString() }) + "\n", "utf8");

    const n = pending.length;
    console.log(
        `[Agente de horas de MyKimai] Hay ${n} ${n === 1 ? "duda" : "dudas"} de la carga automática de horas sin repartir. ` +
        `Además de responder lo que pide Lucas, repartilas siguiendo «Reparto de dudas» de ${AGENTE} ` +
        "(mensaje a la sesión donde pasó cada una, marcada como no leída y fijada) y contale en una línea que lo hiciste."
    );
}

main().catch(() => {}).finally(() => process.exit(0));
