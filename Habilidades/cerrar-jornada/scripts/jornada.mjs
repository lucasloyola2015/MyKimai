#!/usr/bin/env node
/**
 * Evidencia de la jornada para el skill cerrar-jornada (hora de Argentina). Solo Node, sin deps.
 *
 *   node jornada.mjs [--date YYYY-MM-DD] [--pausa 15] [--cwd <dir>] [--sin-madrugada]
 *
 * Modelo (reglas de Lucas):
 * - Actividad = cualquier evento de las sesiones de Claude Code del repo (y sus worktrees), INCLUIDOS
 *   los subagentes que trabajan en segundo plano, más los commits del usuario. Un agente trabajando
 *   es trabajo, aunque el usuario no esté.
 * - El reloj corre mientras hay actividad. Tras `--pausa` minutos sin ningún evento (default 15)
 *   empieza una PAUSA, que termina cuando la actividad vuelve.
 * - Resultado: UNA entrada por día para el proyecto del repo, de la primera a la última actividad,
 *   con las pausas en el medio (pausas nativas de MyKimai). La franja 01:00–07:00 es trabajo
 *   AUTÓNOMO y sale como otra entrada aparte (`autonomous: true`); `--sin-madrugada` la descarta.
 * - Menos de 30 minutos trabajados no se registra.
 *
 * Proyecto de MyKimai del repo: `.mykimai.json` en la raíz, o el mapa central
 * `~/.mykimai/proyectos.json` (una carpeta mapeada cubre sus subcarpetas; gana la más específica).
 */

import { createReadStream, existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { execFileSync } from "node:child_process";
import { createInterface } from "node:readline";

const TZ = "America/Argentina/Buenos_Aires";
const AR_OFFSET_MS = 3 * 60 * 60 * 1000; // Argentina: UTC-3 todo el año
const MIN_WORKED_MIN = 30;

function parseArgs(argv) {
    const out = {};
    for (let i = 0; i < argv.length; i++) {
        if (argv[i].startsWith("--")) out[argv[i].slice(2)] = argv[i + 1]?.startsWith("--") ? true : argv[i + 1];
    }
    return out;
}
const args = parseArgs(process.argv.slice(2));

const todayAr = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const date = typeof args.date === "string" ? args.date : todayAr;
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("--date debe ser YYYY-MM-DD");
const pauseMin = Number(args.pausa ?? args.gap ?? 15);
const dropNight = process.argv.includes("--sin-madrugada");
const dayStart = new Date(`${date}T00:00:00-03:00`);
const dayEnd = new Date(dayStart.getTime() + 86_400_000);

/** ISO con offset de Argentina, ej. 2026-10-02T09:15:00-03:00 */
const toArIso = (d) => new Date(d.getTime() - AR_OFFSET_MS).toISOString().slice(0, 19) + "-03:00";
const toArHm = (d) => toArIso(d).slice(11, 16);
const round5 = (d) => new Date(Math.round(d.getTime() / 300_000) * 300_000);
const isNight = (t) => { const h = new Date(t.getTime() - AR_OFFSET_MS).getUTCHours(); return h >= 1 && h < 7; };

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
const normPath = (p) => resolve(p).replaceAll("\\", "/").replace(/\/+$/, "").toLowerCase();
function readJson(file) {
    try { return JSON.parse(readFileSync(file, "utf8")); } catch { return null; }
}
function resolveProject() {
    const local = readJson(join(repoRoot, ".mykimai.json"));
    if (local?.project_id) return { ...local, source: ".mykimai.json" };
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

/** Texto que escribió el usuario (no resultados de herramientas, mensajes entre sesiones ni avisos). */
function humanPrompt(entry) {
    if (entry.type !== "user") return null;
    const c = entry.message?.content;
    const text = typeof c === "string" ? c : Array.isArray(c) && !c.some((x) => x.type === "tool_result")
        ? c.filter((x) => x.type === "text").map((x) => x.text).join(" ")
        : "";
    if (!text || text.startsWith("<") || /^(Another Claude session|\[Request interrupted|\[Image|\(Re-invocation|This session is being continued|Base directory for this skill)/.test(text)) return null;
    return text.replace(/\s+/g, " ").trim().slice(0, 160);
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
    ? git(["log", "--all", `--since=${new Date(dayStart.getTime() - 86_400_000).toISOString()}`, `--author=${email}`, "--format=%h%x09%aI%x09%s"], cwd)
    : null;
const seenCommits = new Set();
for (const line of (log ?? "").split("\n").filter(Boolean)) {
    const [hash, when, ...subject] = line.split("\t");
    const t = new Date(when);
    if (t < dayStart || t >= dayEnd || seenCommits.has(hash)) continue;
    seenCommits.add(hash);
    commits.push({ hash, time: toArHm(t), subject: subject.join("\t") });
    points.push({ t, kind: "commit", label: `${hash} ${subject.join("\t")}` });
}

// ── Jornada: una entrada por clase (día / madrugada autónoma) con pausas ─────
function jornada(pts, autonomous) {
    if (!pts.length) return null;
    const sorted = [...pts].sort((a, b) => a.t - b.t);
    // Tramos de actividad continua: se corta cuando pasan más de `pauseMin` minutos sin eventos.
    const spans = [];
    for (const p of sorted) {
        const last = spans.at(-1);
        if (last && p.t - last.end <= pauseMin * 60_000) last.end = p.t;
        else spans.push({ start: p.t, end: p.t });
    }
    const rounded = spans.map((s) => {
        const a = round5(s.start);
        let z = round5(s.end);
        if (z <= a) z = new Date(a.getTime() + 300_000);
        return [a, z];
    });
    // Unir tramos que el redondeo dejó pegados o encimados.
    const merged = [];
    for (const [a, z] of rounded) {
        const last = merged.at(-1);
        if (last && a <= last[1]) last[1] = z > last[1] ? z : last[1];
        else merged.push([a, z]);
    }
    const start = merged[0][0];
    const end = merged.at(-1)[1];
    const breaks = merged.slice(1).map(([a], i) => [merged[i][1], a]);
    const workedMin = Math.round(merged.reduce((t, [a, z]) => t + (z - a), 0) / 60_000);
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

const entries = [jornada(points.filter((p) => !isNight(p.t)), false), dropNight ? null : jornada(points.filter((p) => isNight(p.t)), true)]
    .filter(Boolean);
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
        session_events: points.filter((p) => p.kind === "session").length,
        agent_events: points.filter((p) => p.kind === "agent").length,
        commits: commits.length,
    },
    // Menos de 30 min trabajados: no se registran.
    discarded_short: discarded,
    entries: entries.filter((e) => e.minutes >= MIN_WORKED_MIN).map((e, i) => ({ n: i + 1, ...e })),
    commits,
}, null, 2));
