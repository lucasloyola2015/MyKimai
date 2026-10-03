#!/usr/bin/env node
/**
 * Evidencia de la jornada para el skill cerrar-jornada (hora de Argentina). Solo Node, sin deps.
 *
 *   node jornada.mjs [--date YYYY-MM-DD] [--pausa 60] [--cwd <dir>] [--sin-noche]
 *
 * Modelo (reglas de Lucas):
 * - Actividad = cualquier evento de las sesiones de Claude Code del repo (y sus worktrees), INCLUIDOS
 *   los subagentes que trabajan en segundo plano, más los commits del usuario. Un agente trabajando
 *   es trabajo, aunque el usuario no esté.
 * - El reloj corre mientras hay actividad. Tras `--pausa` minutos sin ningún evento (default 60)
 *   empieza una PAUSA, que termina cuando la actividad vuelve.
 * - Resultado: para la fecha, UNA entrada de la jornada (07:00–24:00) para el proyecto del repo, de
 *   la primera a la última actividad, con las pausas en el medio (pausas nativas de MyKimai). La
 *   noche (00:00 → 07:00 del día siguiente) es trabajo AUTÓNOMO de los agentes y sale como otra
 *   entrada aparte (`autonomous: true`); `--sin-noche` la descarta.
 * - Menos de 30 minutos trabajados no se registra.
 *
 * Proyecto de MyKimai del repo: `.mykimai.json` en la raíz, o el mapa central
 * `~/.mykimai/proyectos.json` (una carpeta mapeada cubre sus subcarpetas; gana la más específica).
 */

import { createReadStream, existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { execFileSync } from "node:child_process";
import { createInterface } from "node:readline";
import {
    DEFAULT_PAUSE_MIN, MIN_WORKED_MIN, dayWindow, humanPrompt, matchFolder, toArHm, toArIso, windowSegments,
    workdayOf, workedMinutes,
} from "./sync-core.mjs";

const TZ = "America/Argentina/Buenos_Aires";

function parseArgs(argv) {
    const out = {};
    for (let i = 0; i < argv.length; i++) {
        if (argv[i].startsWith("--")) out[argv[i].slice(2)] = argv[i + 1]?.startsWith("--") ? true : argv[i + 1];
    }
    return out;
}
const args = parseArgs(process.argv.slice(2));

// Por defecto, la fecha en curso: a las 02:00 todavía es la noche de ayer.
const date = typeof args.date === "string" ? args.date : workdayOf(Date.now());
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("--date debe ser YYYY-MM-DD");
const pauseMin = Number(args.pausa ?? args.gap ?? DEFAULT_PAUSE_MIN);
const dropNight = process.argv.includes("--sin-noche") || process.argv.includes("--sin-madrugada");
const DAY = dayWindow(date, "day"); // 07:00–24:00
const NIGHT = dayWindow(date, "night"); // 00:00 → 07:00 del día siguiente
// Una pausa antes y después: la actividad vecina da continuidad en los bordes (07:00 y 24:00).
const PAUSE_MS = pauseMin * 60_000;
const dayStart = new Date(DAY.start - PAUSE_MS);
const dayEnd = new Date(NIGHT.end + PAUSE_MS);

function git(gitArgs, cwd) {
    try {
        return execFileSync("git", gitArgs, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    } catch {
        return null;
    }
}

const cwd = resolve(typeof args.cwd === "string" ? args.cwd : process.cwd());
const commonDir = git(["rev-parse", "--path-format=absolute", "--git-common-dir"], cwd) ?? git(["rev-parse", "--git-common-dir"], cwd);
const repoRoot = commonDir ? dirname(resolve(cwd, commonDir)) : cwd;
const repo = basename(repoRoot);

// ── Proyecto de MyKimai del repo ─────────────────────────────────────────────
function readJson(file) {
    try { return JSON.parse(readFileSync(file, "utf8").replace(/^﻿/, "")); } catch { return null; }
}
function resolveProject() {
    const local = readJson(join(repoRoot, ".mykimai.json"));
    if (local?.project_id) return { ...local, source: ".mykimai.json" };
    const hit = matchFolder(readJson(join(homedir(), ".mykimai", "proyectos.json")) ?? {}, repoRoot);
    return hit?.entry?.project_id ? { ...hit.entry, source: "~/.mykimai/proyectos.json" } : null;
}
const project = resolveProject();

// ── Sesiones del repo (y worktrees), incluidos los subagentes ────────────────
const sanitize = (p) => p.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();
const projectsDir = join(homedir(), ".claude", "projects");
const prefix = sanitize(repoRoot);
const files = []; // { file, agent }
function collect(dir, agent) {
    for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        let st;
        try { st = statSync(full); } catch { continue; }
        if (st.isDirectory()) {
            if (name === "tool-results") continue;
            collect(full, agent || name === "subagents");
        } else if (name.endsWith(".jsonl") && st.mtime >= dayStart) {
            files.push({ file: full, agent });
        }
    }
}
if (existsSync(projectsDir)) {
    for (const dir of readdirSync(projectsDir)) {
        const key = dir.toLowerCase();
        if (key === prefix || key.startsWith(prefix + "-")) collect(join(projectsDir, dir), false);
    }
}

const points = []; // { t, kind: 'session' | 'agent' | 'commit', prompt?, label? }
for (const { file, agent } of files) {
    const rl = createInterface({ input: createReadStream(file, "utf8"), crlfDelay: Infinity });
    for await (const line of rl) {
        let entry;
        try { entry = JSON.parse(line); } catch { continue; }
        if ((entry.type !== "user" && entry.type !== "assistant") || !entry.timestamp) continue;
        const t = new Date(entry.timestamp);
        if (t < dayStart || t >= dayEnd) continue;
        // Los mensajes "user" de un subagente son el encargo del agente padre, no del usuario.
        points.push({ t, kind: agent ? "agent" : "session", prompt: agent ? null : humanPrompt(entry) });
    }
}

// ── Commits del usuario en el día ────────────────────────────────────────────
const email = git(["config", "user.email"], cwd);
const commits = [];
const log = email
    ? git(["log", "--exclude=refs/stash", "--all", `--since=${new Date(dayStart.getTime() - 86_400_000).toISOString()}`, `--author=${email}`, "--format=%h%x09%aI%x09%s"], cwd)
    : null;
const seenCommits = new Set();
for (const line of (log ?? "").split("\n").filter(Boolean)) {
    const [hash, when, ...subject] = line.split("\t");
    const t = new Date(when);
    if (t < dayStart || t >= dayEnd || seenCommits.has(hash)) continue;
    seenCommits.add(hash);
    // La lista de commits es solo la de la fecha (los de la pausa vecina solo dan continuidad).
    if (t >= DAY.start && t < NIGHT.end) commits.push({ hash, time: toArHm(t), subject: subject.join("\t") });
    points.push({ t, kind: "commit", label: `${hash} ${subject.join("\t")}` });
}

// ── Una entrada por ventana (jornada / noche autónoma) con pausas ───────────
function jornada(nearPts, pts, autonomous, window) {
    if (!pts.length) return null;
    // Tramos de actividad continua (se corta tras `pauseMin` minutos sin eventos), redondeados a 5 min.
    const merged = windowSegments(nearPts.map((p) => p.t.getTime()), window, pauseMin);
    if (!merged.length) return null;
    const start = merged[0][0];
    const end = merged.at(-1)[1];
    const breaks = merged.slice(1).map(([a], i) => [merged[i][1], a]);
    const workedMin = workedMinutes(merged);
    return {
        autonomous,
        start_time: toArIso(start),
        end_time: toArIso(end),
        from_to: `${toArHm(start)}–${toArHm(end)}`,
        minutes: workedMin,
        // Pausas para la API (breaks): no se cobran.
        breaks: breaks.map(([a, z]) => ({ start_time: toArIso(a), end_time: toArIso(z), from_to: `${toArHm(a)}–${toArHm(z)}` })),
        worked_spans: merged.map(([a, z]) => `${toArHm(a)}–${toArHm(z)}`),
        events: { session: pts.filter((p) => p.kind === "session").length, agent: pts.filter((p) => p.kind === "agent").length, commits: pts.filter((p) => p.kind === "commit").length },
        commits: pts.filter((p) => p.kind === "commit").map((p) => p.label),
        // Evidencia para el título y la descripción: lo que pidió el usuario (hasta 15).
        prompts: pts.filter((p) => p.prompt).sort((a, b) => a.t - b.t).map((p) => `${toArHm(p.t)} ${p.prompt}`).slice(0, 15),
    };
}

// Los tramos se arman con la actividad de la ventana y la de la pausa vecina, y se recortan a la
// ventana (windowSegments); la evidencia es solo la de adentro.
// La noche no mira después de las 07:00 (igual que el agente: el resultado no depende de cuándo se corre).
const near = (w) => points.filter((p) => p.t.getTime() >= w.start - PAUSE_MS && p.t.getTime() < w.end + (w === NIGHT ? 0 : PAUSE_MS));
const inside = (w) => points.filter((p) => p.t.getTime() >= w.start && p.t.getTime() < w.end);
const entries = [jornada(near(DAY), inside(DAY), false, DAY), dropNight ? null : jornada(near(NIGHT), inside(NIGHT), true, NIGHT)]
    .filter(Boolean);
const dated = points.filter((p) => p.t.getTime() >= DAY.start && p.t.getTime() < NIGHT.end);
const discarded = entries.filter((e) => e.minutes < MIN_WORKED_MIN).map((e) => `${e.from_to} (${e.minutes} min trabajados${e.autonomous ? ", autónomo" : ""})`);

console.log(JSON.stringify({
    date,
    timezone: TZ,
    repo,
    repo_path: repoRoot,
    project,
    pause_after_minutes: pauseMin,
    evidence: {
        session_files: files.filter((f) => !f.agent).length,
        subagent_files: files.filter((f) => f.agent).length,
        session_events: dated.filter((p) => p.kind === "session").length,
        agent_events: dated.filter((p) => p.kind === "agent").length,
        commits: commits.length,
    },
    // Menos de 30 min trabajados: no se registran.
    discarded_short: discarded,
    entries: entries.filter((e) => e.minutes >= MIN_WORKED_MIN).map((e, i) => ({ n: i + 1, ...e })),
    commits,
}, null, 2));
