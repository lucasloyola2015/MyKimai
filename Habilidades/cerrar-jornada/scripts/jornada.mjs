#!/usr/bin/env node
/**
 * Evidencia de la jornada para el skill cerrar-jornada: bloques de actividad de
 * un día (hora de Argentina) a partir de las sesiones de Claude Code del repo
 * (incluye sus worktrees) y de los commits del usuario. Solo Node, sin deps.
 *
 *   node jornada.mjs [--date YYYY-MM-DD] [--gap 45] [--cwd <dir>]
 *
 * --gap: minutos sin actividad que cortan un bloque (pausa). Default 45.
 * Salida: JSON con los bloques (horarios ISO con offset -03:00, listos para la API)
 * y el proyecto de MyKimai del repo, si está mapeado:
 *   1. `.mykimai.json` en la raíz del repo, o
 *   2. el mapa central `~/.mykimai/proyectos.json` ({ "<ruta del repo>": { project_id, label } }).
 */

import { createReadStream, existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { execFileSync } from "node:child_process";
import { createInterface } from "node:readline";

const TZ = "America/Argentina/Buenos_Aires";
const AR_OFFSET_MS = 3 * 60 * 60 * 1000; // Argentina: UTC-3 todo el año

function parseArgs(argv) {
    const out = {};
    for (let i = 0; i < argv.length; i++) {
        if (argv[i].startsWith("--")) out[argv[i].slice(2)] = argv[i + 1];
    }
    return out;
}
const args = parseArgs(process.argv.slice(2));

const todayAr = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
}).format(new Date());
const date = args.date ?? todayAr;
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("--date debe ser YYYY-MM-DD");
const gapMin = Number(args.gap ?? 45);
const dayStart = new Date(`${date}T00:00:00-03:00`);
const dayEnd = new Date(dayStart.getTime() + 86_400_000);

/** ISO con offset de Argentina, ej. 2026-10-02T09:15:00-03:00 */
const toArIso = (d) => new Date(d.getTime() - AR_OFFSET_MS).toISOString().slice(0, 19) + "-03:00";
const toArHm = (d) => toArIso(d).slice(11, 16);
const round5 = (d) => new Date(Math.round(d.getTime() / 300_000) * 300_000);

function git(gitArgs, cwd) {
    try {
        return execFileSync("git", gitArgs, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    } catch {
        return null;
    }
}

const cwd = resolve(args.cwd ?? process.cwd());
const commonDir =
    git(["rev-parse", "--path-format=absolute", "--git-common-dir"], cwd) ??
    git(["rev-parse", "--git-common-dir"], cwd);
const repoRoot = commonDir ? dirname(resolve(cwd, commonDir)) : cwd;
const repo = basename(repoRoot);

// ── Proyecto de MyKimai del repo ─────────────────────────────────────────────
const normPath = (p) => resolve(p).replaceAll("\\", "/").replace(/\/+$/, "").toLowerCase();
function readJson(file) {
    try {
        return JSON.parse(readFileSync(file, "utf8"));
    } catch {
        return null;
    }
}
function resolveProject() {
    const local = readJson(join(repoRoot, ".mykimai.json"));
    if (local?.project_id) return { ...local, source: ".mykimai.json" };
    // Una carpeta mapeada cubre también sus subcarpetas; gana la ruta más específica.
    const map = readJson(join(homedir(), ".mykimai", "proyectos.json")) ?? {};
    const here = normPath(repoRoot);
    let best = null;
    for (const [path, entry] of Object.entries(map)) {
        const key = normPath(path);
        if (!entry?.project_id || (here !== key && !here.startsWith(key + "/"))) continue;
        if (!best || key.length > best.key.length) best = { key, entry };
    }
    return best ? { ...best.entry, source: "~/.mykimai/proyectos.json" } : null;
}
const project = resolveProject();

// ── Sesiones de Claude Code del repo (y sus worktrees) ──────────────────────
const sanitize = (p) => p.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();
const projectsDir = join(homedir(), ".claude", "projects");
const prefix = sanitize(repoRoot);
const sessionFiles = [];
if (existsSync(projectsDir)) {
    for (const dir of readdirSync(projectsDir)) {
        const key = dir.toLowerCase();
        if (key !== prefix && !key.startsWith(prefix + "-")) continue;
        const full = join(projectsDir, dir);
        for (const f of readdirSync(full)) {
            if (!f.endsWith(".jsonl")) continue;
            const file = join(full, f);
            if (statSync(file).mtime >= dayStart) sessionFiles.push(file);
        }
    }
}

const points = []; // { t: Date, kind: 'session' | 'commit', label? }
for (const file of sessionFiles) {
    const rl = createInterface({ input: createReadStream(file, "utf8"), crlfDelay: Infinity });
    for await (const line of rl) {
        let entry;
        try {
            entry = JSON.parse(line);
        } catch {
            continue;
        }
        if ((entry.type !== "user" && entry.type !== "assistant") || !entry.timestamp) continue;
        const t = new Date(entry.timestamp);
        if (t < dayStart || t >= dayEnd) continue;
        points.push({ t, kind: "session", prompt: humanPrompt(entry) });
    }
}

/** Texto que escribió el usuario (no resultados de herramientas ni mensajes entre sesiones). */
function humanPrompt(entry) {
    if (entry.type !== "user") return null;
    const c = entry.message?.content;
    const text = typeof c === "string" ? c : Array.isArray(c) && !c.some((x) => x.type === "tool_result")
        ? c.filter((x) => x.type === "text").map((x) => x.text).join(" ")
        : "";
    if (!text || text.startsWith("<") || /^(Another Claude session|\[Request interrupted|\[Image|\(Re-invocation|This session is being continued|Base directory for this skill)/.test(text)) return null;
    return text.replace(/\s+/g, " ").trim().slice(0, 160);
}

// ── Commits del usuario en el día ────────────────────────────────────────────
const email = git(["config", "user.email"], cwd);
const commits = [];
const log = email
    ? git(
          [
              "log",
              "--all",
              `--since=${new Date(dayStart.getTime() - 86_400_000).toISOString()}`,
              `--author=${email}`,
              "--format=%h%x09%aI%x09%s",
          ],
          cwd
      )
    : null;
for (const line of (log ?? "").split("\n").filter(Boolean)) {
    const [hash, when, ...subject] = line.split("\t");
    const t = new Date(when);
    if (t < dayStart || t >= dayEnd) continue;
    commits.push({ hash, time: toArHm(t), subject: subject.join("\t") });
    points.push({ t, kind: "commit", label: `${hash} ${subject.join("\t")}` });
}

// ── Bloques: actividad continua, cortada por pausas > gap ────────────────────
// La franja 01:00–07:00 (hora AR) no cuenta: de madrugada trabajan agentes solos.
// `--incluir-madrugada` la incluye.
const includeNight = process.argv.includes("--incluir-madrugada");
const isNight = (t) => { const h = new Date(t.getTime() - AR_OFFSET_MS).getUTCHours(); return h >= 1 && h < 7; };
const nightPoints = includeNight ? 0 : points.filter((p) => isNight(p.t)).length;
const dayPoints = includeNight ? points : points.filter((p) => !isNight(p.t));
dayPoints.sort((a, b) => a.t - b.t);
const blocks = [];
for (const p of dayPoints) {
    const last = blocks.at(-1);
    if (last && p.t - last.end <= gapMin * 60_000) {
        last.end = p.t;
        last.points.push(p);
    } else {
        blocks.push({ start: p.t, end: p.t, points: [p] });
    }
}

const result = {
    date,
    timezone: TZ,
    repo,
    repo_path: repoRoot,
    project,
    gap_minutes: gapMin,
    evidence: {
        session_files: sessionFiles.length,
        session_events: points.filter((p) => p.kind === "session").length,
        commits: commits.length,
        excluded_night_points: nightPoints,
    },
    blocks: blocks.map((b, i) => {
        let start = round5(b.start);
        let end = round5(b.end);
        if (end <= start) end = new Date(start.getTime() + 300_000);
        return {
            n: i + 1,
            start_time: toArIso(start),
            end_time: toArIso(end),
            from_to: `${toArHm(start)}–${toArHm(end)}`,
            minutes: Math.round((end - start) / 60_000),
            raw: { first: toArIso(b.start), last: toArIso(b.end) },
            session_events: b.points.filter((p) => p.kind === "session").length,
            commits: b.points.filter((p) => p.kind === "commit").map((p) => p.label),
            // Evidencia para la descripción: lo que pidió el usuario en el bloque (hasta 12).
            prompts: b.points.filter((p) => p.prompt).map((p) => `${toArHm(p.t)} ${p.prompt}`).slice(0, 12),
            single_point: b.points.length === 1,
        };
    }),
    commits,
};

console.log(JSON.stringify(result, null, 2));
