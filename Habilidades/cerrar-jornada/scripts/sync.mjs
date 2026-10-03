#!/usr/bin/env node
/**
 * Agente de horas de MyKimai: arma y carga las horas de TODAS las carpetas mapeadas a partir de las
 * sesiones de Claude Code (incluidos los subagentes) y los commits. Solo Node, sin dependencias.
 *
 *   node sync.mjs plan  [--date YYYY-MM-DD] [--out <plan.json>] [--pausa 60] [--now <ISO>] [--simular]
 *   node sync.mjs apply [--plan <plan.json>] [--textos <textos.json> | --textos -] [--dry-run] [--forzar]
 *   node sync.mjs dudas [--plan <plan.json>]
 *
 * plan:  cada fecha tiene su jornada (07:00–21:00) y su noche (21:00 → 07:00 del día siguiente,
 *        trabajo autónomo). Sin --date, las fechas COMPLETAS (ya terminó su noche) desde la última
 *        sincronizada (máx. 7, nunca antes de FLOOR_DATE). Con --date, esa fecha. No escribe nada en
 *        MyKimai. --simular calcula como si no hubiera nada cargado (para comparar reglas; apply lo
 *        rechaza).
 * apply: crea las entradas nuevas (con el título y la descripción de los textos, por `ref`; `-` los
 *        lee de stdin) y ajusta horarios/pausas de las que el agente cargó antes y nadie tocó.
 *        Revalida cada acción contra lo que hay en MyKimai en ese momento.
 * dudas: junta las dudas del plan y los errores del apply en ~/.mykimai/sync/dudas.json, con el
 *        mensaje para cada una. Las reparte una sesión atendida (AGENTE.md, "Reparto de dudas").
 *
 * Reglas: sync-core.mjs. Estado local: ~/.mykimai/sync-state.json. Mapa: ~/.mykimai/proyectos.json.
 * API key: MYKIMAI_API_KEY (en Windows se lee primero de HKCU\Environment, que es la vigente).
 */

import { copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { execFileSync } from "node:child_process";
import { createInterface } from "node:readline";
import {
    DEFAULT_PAUSE_MIN, MIN_WORKED_MIN,
    addDays, adminMask, advanceLastFullDay, agentTaskText, arYmd, autoRef, dayWindow, decideAction,
    fingerprint, frozenReason, humanPrompt, isSyncPrompt, matchFolder, maxOf, minOf, normPath, rawUserText,
    resolveWindow, spread, toArHm, toArIso, toEntryTimes, turnEvent, windowSegments, windowsToProcess,
    workedMinutes,
} from "./sync-core.mjs";

// Primera fecha del agente: su noche (02/10 21:00 → 03/10 07:00) es la primera que carga solo.
// Lo anterior se cargó a mano (y lo que ya está cargado, el agente lo respeta).
const FLOOR_DATE = "2026-10-02";
const MAX_DAYS_BACK = 7;
/** Un plan más viejo que esto no se aplica sin --forzar (lo cargado pudo cambiar en el medio). */
const MAX_PLAN_AGE_MS = 3 * 60 * 60 * 1000;
const MYKIMAI_DIR = join(homedir(), ".mykimai");
const STATE_FILE = process.env.MYKIMAI_SYNC_STATE ?? join(MYKIMAI_DIR, "sync-state.json");
const MAP_FILE = join(MYKIMAI_DIR, "proyectos.json");
const DEFAULT_PLAN = join(MYKIMAI_DIR, "sync", "plan.json");
const APPLY_FILE = join(MYKIMAI_DIR, "sync", "apply.json");
const DUDAS_FILE = join(MYKIMAI_DIR, "sync", "dudas.json");
const API_URL = process.env.MYKIMAI_URL ?? "https://jobs.loyola.com.ar/api/mcp";

function parseArgs(argv) {
    const out = { _: [] };
    for (let i = 0; i < argv.length; i++) {
        if (!argv[i].startsWith("--")) out._.push(argv[i]);
        else if (argv[i + 1] === undefined || argv[i + 1].startsWith("--")) out[argv[i].slice(2)] = true;
        else out[argv[i].slice(2)] = argv[++i];
    }
    return out;
}

/**
 * Lee JSON (tolera el BOM que agrega PowerShell). Si el archivo no existe, `fallback`; si existe y
 * está roto, corta: seguir con un mapa o un estado vacío cargaría mal sin avisar.
 */
function readJson(file, fallback) {
    let text;
    try {
        text = readFileSync(file, "utf8");
    } catch (err) {
        if (err.code === "ENOENT") return fallback;
        throw err;
    }
    try {
        return JSON.parse(text.replace(/^﻿/, ""));
    } catch (err) {
        throw new Error(`${file} no es JSON válido (${err.message}). Corregilo antes de seguir.`);
    }
}
/** Escritura atómica (archivo temporal + rename); con `backup`, guarda la versión anterior en .bak. */
function writeJson(file, data, { backup = false } = {}) {
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", "utf8");
    if (backup && existsSync(file)) copyFileSync(file, `${file}.bak`);
    renameSync(tmp, file);
}

function git(args, cwd) {
    try {
        return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    } catch {
        return null;
    }
}

// ── API de MyKimai (MCP por HTTP) ────────────────────────────────────────────
/** Falla que se reintenta en la corrida siguiente: red, HTTP, o error interno del servidor. */
class RetryableError extends Error {}

function readApiKey() {
    if (process.platform === "win32") {
        try {
            const out = execFileSync("reg", ["query", "HKCU\\Environment", "/v", "MYKIMAI_API_KEY"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
            const m = out.match(/MYKIMAI_API_KEY\s+REG_\w+\s+(\S+)/);
            if (m) return m[1].trim();
        } catch { /* no está en el registro */ }
    }
    if (process.env.MYKIMAI_API_KEY) return process.env.MYKIMAI_API_KEY.trim();
    throw new Error("Falta la API key: variable de entorno MYKIMAI_API_KEY (ver SETUP.md del skill cerrar-jornada).");
}

let rpcId = 0;
let apiKey;
/**
 * Llama una herramienta del MCP. `ok:false` con `data.code` es un rechazo del dominio (conflicto,
 * inválido…): definitivo. Sin `code` es un error interno: se tira como RetryableError.
 */
async function api(tool, args) {
    apiKey ??= readApiKey();
    let res;
    try {
        res = await fetch(API_URL, {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json, text/event-stream", "Content-Type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method: "tools/call", params: { name: tool, arguments: args } }),
        });
    } catch (err) {
        throw new RetryableError(`${tool}: sin conexión con MyKimai (${err.message})`);
    }
    if (!res.ok) throw new RetryableError(`${tool}: HTTP ${res.status}`);
    const body = await res.json();
    if (body.error) throw new RetryableError(`${tool}: ${body.error.message}`);
    let data;
    try {
        data = JSON.parse(body.result?.content?.[0]?.text ?? "{}");
    } catch {
        throw new RetryableError(`${tool}: respuesta ilegible del servidor`);
    }
    if (body.result?.isError && !data.code) throw new RetryableError(`${tool}: ${data.error ?? "error interno"}`);
    return { ok: !body.result?.isError, data };
}
async function apiOrThrow(tool, args) {
    const r = await api(tool, args);
    if (!r.ok) throw new Error(`${tool}: ${r.data.error ?? JSON.stringify(r.data)}`);
    return r.data;
}

// ── Evidencia: transcripciones ───────────────────────────────────────────────
function listTranscripts(sinceMs) {
    const root = join(homedir(), ".claude", "projects");
    const files = [];
    const walk = (dir, agent) => {
        let names;
        try { names = readdirSync(dir); } catch { return; }
        for (const name of names) {
            const full = join(dir, name);
            let st;
            try { st = statSync(full); } catch { continue; }
            if (st.isDirectory()) {
                if (name !== "tool-results") walk(full, agent || name === "subagents");
            } else if (name.endsWith(".jsonl") && st.mtimeMs >= sinceMs) {
                files.push({ file: full, agent });
            }
        }
    };
    if (existsSync(root)) walk(root, false);
    return files;
}

/** Primera carpeta que registra una transcripción (donde arrancó la sesión). */
async function firstCwdOf(file) {
    if (!existsSync(file)) return null;
    const rl = createInterface({ input: createReadStream(file, "utf8"), crlfDelay: Infinity });
    for await (const line of rl) {
        try {
            const e = JSON.parse(line);
            if (e.cwd) {
                rl.close();
                return e.cwd;
            }
        } catch { /* línea rota */ }
    }
    return null;
}

/** Qué hizo un subagente: la descripción de su .meta.json (o el encargo, sin el arnés de workflows). */
function agentDescription(file, task) {
    try {
        const meta = JSON.parse(readFileSync(file.replace(/\.jsonl$/, ".meta.json"), "utf8"));
        if (meta?.description) return meta.workflowPhase ? `${meta.description} (${meta.workflowPhase})` : meta.description;
    } catch { /* sin meta */ }
    return task;
}

/**
 * Eventos de usuario/asistente dentro de [from, to). Cada evento cuenta para la carpeta donde ARRANCÓ
 * su sesión (un `cd` a otro repo no cambia de cliente); los subagentes, la de su sesión madre.
 * Se descartan las sesiones del propio agente y la administración de horas (adminMask).
 */
async function readTranscripts(files, from, to) {
    const raw = [];
    const marked = new Set();
    const startCwd = new Map();
    const agentTasks = new Map();
    for (const { file, agent } of files) {
        const rl = createInterface({ input: createReadStream(file, "utf8"), crlfDelay: Infinity });
        const events = [];
        let task = null;
        for await (const line of rl) {
            let e;
            try { e = JSON.parse(line); } catch { continue; }
            if (e.type !== "user" && e.type !== "assistant") continue;
            if (!agent && e.sessionId && e.cwd && !startCwd.has(e.sessionId)) startCwd.set(e.sessionId, e.cwd);
            if (!agent && isSyncPrompt(rawUserText(e))) marked.add(e.sessionId);
            if (agent && !task && e.type === "user") task = agentTaskText(rawUserText(e));
            events.push({
                t: e.timestamp ? Date.parse(e.timestamp) : NaN,
                session: e.sessionId,
                lineCwd: e.cwd ?? null,
                prompt: agent ? null : humanPrompt(e),
                turn: agent ? null : turnEvent(e),
            });
        }
        const mask = agent ? null : adminMask(events.map((x) => x.turn));
        events.forEach((ev, i) => {
            if (mask?.[i] || !(ev.t >= from && ev.t < to)) return;
            raw.push({ t: ev.t, session: ev.session, lineCwd: ev.lineCwd, kind: agent ? "agent" : "session", prompt: ev.prompt, file });
        });
        if (agent) agentTasks.set(file, agentDescription(file, task));
    }
    // Subagentes cuya sesión madre no se leyó (no cambió en el rango): su carpeta de arranque.
    for (const p of raw) {
        if (p.kind !== "agent" || !p.session || startCwd.has(p.session)) continue;
        const mainFile = join(p.file.split(/[\\/]subagents[\\/]/)[0] + ".jsonl");
        startCwd.set(p.session, await firstCwdOf(mainFile));
    }
    const points = raw
        .filter((p) => !marked.has(p.session))
        .map((p) => ({ ...p, cwd: startCwd.get(p.session) ?? p.lineCwd }))
        .filter((p) => p.cwd);
    return { points, agentTasks };
}

// ── Evidencia: commits ───────────────────────────────────────────────────────
const cache = new Map();
const memo = (key, fn) => (cache.has(key) ? cache.get(key) : (cache.set(key, fn()), cache.get(key)));

/** Raíz del repo principal (los worktrees apuntan a él); null si no es git. Para clasificar. */
const repoRoot = (cwd) => memo(`root:${cwd}`, () => {
    if (!existsSync(cwd)) return null;
    const common = git(["rev-parse", "--path-format=absolute", "--git-common-dir"], cwd);
    return common ? dirname(resolve(cwd, common)) : null;
});
/** Carpeta del checkout (worktree o submódulo): ahí se leen sus commits. */
const toplevel = (cwd) => memo(`top:${cwd}`, () => (existsSync(cwd) ? git(["rev-parse", "--show-toplevel"], cwd) : null));
/** Submódulos de un repo (sus commits son trabajo del mismo proyecto). */
function submodulesOf(root) {
    const out = git(["config", "--file", ".gitmodules", "--get-regexp", "^submodule\\..*\\.path$"], root);
    return (out ?? "").split("\n").filter(Boolean).map((l) => join(root, l.split(" ").slice(1).join(" "))).filter((p) => existsSync(join(p, ".git")));
}
/** Repos dentro de una carpeta mapeada que no es repo (p. ej. 2-Interlabs/FinalVersion). */
function nestedRepos(dir, depth = 2) {
    const out = [];
    let names;
    try { names = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
    for (const d of names) {
        if (!d.isDirectory() || ["node_modules", ".claude", ".git", ".venv", "venv"].includes(d.name)) continue;
        const full = join(dir, d.name);
        if (existsSync(join(full, ".git"))) out.push(full);
        else if (depth > 1) out.push(...nestedRepos(full, depth - 1));
    }
    return out;
}

/** Repos donde buscar commits: los checkouts de las sesiones y los repos de las carpetas mapeadas, con sus submódulos. */
function commitRoots(sessionCwds, map) {
    const roots = new Map(); // ruta normalizada → ruta real
    const add = (root) => {
        if (!root || roots.has(normPath(root))) return;
        roots.set(normPath(root), root);
        for (const sub of submodulesOf(root)) add(sub);
    };
    for (const cwd of sessionCwds) add(toplevel(cwd));
    for (const [path, entry] of Object.entries(map)) {
        if (!entry?.project_id || !existsSync(path)) continue;
        if (existsSync(join(path, ".git"))) add(resolve(path));
        else nestedRepos(path).forEach(add);
    }
    return [...roots.values()];
}

function readCommits(roots, from, to) {
    const seen = new Set();
    const out = [];
    for (const root of roots) {
        const email = git(["config", "user.email"], root);
        if (!email) continue;
        const log = git(["log", "--all", `--since=${new Date(from - 86_400_000).toISOString()}`, `--author=${email}`, "--format=%h%x09%aI%x09%s"], root);
        for (const line of (log ?? "").split("\n").filter(Boolean)) {
            const [hash, when, ...subject] = line.split("\t");
            const t = Date.parse(when);
            if (!(t >= from && t < to) || seen.has(hash)) continue;
            seen.add(hash);
            // El repo por su nombre, no el del worktree (…/FinalVersion/.claude/worktrees/x → FinalVersion).
            const repo = basename(root.split(/[\\/]\.claude[\\/]worktrees[\\/]/)[0]);
            out.push({ t, cwd: root, session: null, kind: "commit", label: `${toArHm(t)} [${repo}] ${subject.join("\t")}` });
        }
    }
    return out;
}

// ── plan ─────────────────────────────────────────────────────────────────────
function classify(map, cwd) {
    const root = repoRoot(cwd);
    const hit = matchFolder(map, cwd, root);
    return { folder: root ?? cwd, hit };
}

const uniq = (list) => [...new Set(list)];

function evidenceOf(points, agentTasks, allPoints) {
    const sessions = new Map();
    for (const p of points) {
        if (!p.session) continue;
        const s = sessions.get(p.session) ?? { session_id: p.session, cwd: p.cwd, from: p.t, to: p.t };
        if (p.t < s.from) s.from = p.t;
        if (p.t > s.to) s.to = p.t;
        sessions.set(p.session, s);
    }
    const firstT = minOf(points.map((p) => p.t));
    // Contexto: lo último que pidió el usuario en cada sesión ANTES de esta franja (lo que los agentes siguieron haciendo).
    const context = [];
    for (const s of sessions.values()) {
        let before = null;
        for (const p of allPoints) if (p.session === s.session_id && p.prompt && p.t < firstT && (!before || p.t > before.t)) before = p;
        if (before) context.push(`${arYmd(before.t)} ${toArHm(before.t)} ${before.prompt}`);
    }
    const sorted = [...points].sort((a, b) => a.t - b.t);
    // Sin repetir el mismo pedido, y repartido a lo largo de toda la franja (no solo el arranque).
    const prompts = uniq(sorted.filter((p) => p.prompt).map((p) => p.prompt)).map((text) => {
        const p = sorted.find((x) => x.prompt === text);
        return `${toArHm(p.t)} ${text}`;
    });
    const commits = sorted.filter((p) => p.kind === "commit").map((p) => p.label);
    const tasks = uniq([...new Set(points.filter((p) => p.kind === "agent").map((p) => p.file))].map((f) => agentTasks.get(f)).filter(Boolean));
    return {
        events: {
            session: points.filter((p) => p.kind === "session").length,
            agent: points.filter((p) => p.kind === "agent").length,
            commits: commits.length,
        },
        prompts: spread(prompts, 25),
        prompts_total: prompts.length,
        context_prompts: context.slice(0, 5),
        agent_tasks: spread(tasks, 15),
        agent_tasks_total: tasks.length,
        commits: spread(commits, 30),
        commits_total: commits.length,
        sessions: [...sessions.values()].map((s) => ({ ...s, from: toArIso(s.from), to: toArIso(s.to) })),
    };
}

async function plan(opts) {
    // --now simula la hora de la corrida (pruebas); por defecto, ahora.
    const nowMs = typeof opts.now === "string" ? Date.parse(opts.now) : Date.now();
    if (Number.isNaN(nowMs)) throw new Error("--now debe ser ISO 8601 con zona horaria");
    const pauseMin = Number(opts.pausa ?? DEFAULT_PAUSE_MIN);
    const state = readJson(STATE_FILE, {});
    const map = readJson(MAP_FILE, {});
    if (typeof opts.date === "string" && !/^\d{4}-\d{2}-\d{2}$/.test(opts.date)) throw new Error("--date debe ser YYYY-MM-DD");
    const simulate = Boolean(opts.simular);
    const picked = typeof opts.date === "string"
        ? { windows: [{ date: opts.date, scope: "day" }, { date: opts.date, scope: "night" }], skipped: null }
        : windowsToProcess({ lastFullDay: state.last_full_day, nowMs, floor: FLOOR_DATE, maxDaysBack: MAX_DAYS_BACK });
    // complete: la ventana ya terminó. auto: corrida automática (solo esas avanzan last_full_day).
    const windows = picked.windows.map((w) => ({ ...w, complete: dayWindow(w.date, w.scope).end <= nowMs }));
    const result = {
        generated_at: toArIso(nowMs), auto: typeof opts.date !== "string" && !simulate, simulated: simulate,
        pause_after_minutes: pauseMin, windows,
        // Fechas que quedaron afuera por llevar más de una semana sin sincronizar (cargarlas con --date).
        skipped_days: picked.skipped,
        actions: [], discarded: [], doubts: [], ignored: [],
    };
    if (!windows.length) return result;

    const spans = windows.map((w) => ({ ...w, ...dayWindow(w.date, w.scope) }));
    const from = minOf(spans.map((s) => s.start));
    const to = maxOf(spans.map((s) => s.end));

    const { points: sessionPoints, agentTasks } = await readTranscripts(listTranscripts(from), from, to);
    const points = [...sessionPoints, ...readCommits(commitRoots(uniq(sessionPoints.map((p) => p.cwd)), map), from, to)];

    const projectList = (await apiOrThrow("list_projects", { include_inactive: true })).projects;
    const projects = new Map(projectList.map((p) => [p.id, p]));
    // La noche de la última fecha termina al día siguiente; un día antes por lo que arrancó la víspera.
    const listed = simulate
        ? { entries: [] }
        : await apiOrThrow("list_time_entries", { from: addDays(windows[0].date, -1), to: addDays(windows.at(-1).date, 2) });
    if (listed.truncated) throw new Error("La API devolvió la lista de horas truncada; acotar el rango.");
    const stateEntries = simulate ? {} : state.entries ?? {};

    const seenDoubts = new Set();
    for (const w of spans) {
        const byProject = new Map();
        const unmapped = new Map();
        for (const p of points) {
            if (!(p.t >= w.start && p.t < w.end)) continue;
            const { folder, hit } = classify(map, p.cwd);
            if (hit?.entry?.ignorar) continue;
            if (!hit) {
                const u = unmapped.get(normPath(folder)) ?? { folder, points: [] };
                u.points.push(p);
                unmapped.set(normPath(folder), u);
                continue;
            }
            const autonomous = w.scope === "night";
            const ref = autoRef(hit.entry.project_id, w.date, autonomous);
            const c = byProject.get(ref) ?? { ref, date: w.date, project_id: hit.entry.project_id, label: hit.entry.label, autonomous, points: [] };
            c.points.push(p);
            byProject.set(ref, c);
        }

        // Una hora propia congelada (facturada, editada a mano o borrada) se respeta tal como está:
        // no se recalcula y, si existe, cuenta con sus tramos reales para las demás.
        const candidates = [];
        for (const c of byProject.values()) {
            const segments = windowSegments(c.points.map((p) => p.t), w, pauseMin);
            if (!segments.length) continue;
            const current = listed.entries.find((x) => x.external_ref === c.ref);
            const frozen = frozenReason(current, stateEntries[c.ref]);
            if (frozen) {
                const proj = projects.get(c.project_id);
                result.discarded.push({ ref: c.ref, date: c.date, window: w.scope, project: proj ? `${proj.client.name} / ${proj.name}` : c.label, autonomous: c.autonomous, raw_minutes: workedMinutes(segments), reason: frozen });
                continue;
            }
            candidates.push({ ...c, segments, firstEvent: minOf(c.points.map((p) => p.t)), evidence: evidenceOf(c.points, agentTasks, sessionPoints) });
        }
        const existing = listed.entries.filter((e) => {
            const s = Date.parse(e.start_time);
            const z = e.end_time ? Date.parse(e.end_time) : nowMs;
            return s < w.end && z > w.start;
        });
        const resolved = resolveWindow({ window: w, candidates, existing, projects, now: nowMs });

        for (const e of resolved.entries) {
            const current = listed.entries.find((x) => x.external_ref === e.ref);
            const decision = decideAction(e, current, stateEntries[e.ref]);
            result.actions.push({
                ...decision,
                ref: e.ref,
                date: e.date,
                window: w.scope,
                project: { id: e.project.id, name: e.project.name, client: e.project.client.name, billable: e.project.is_billable },
                autonomous: e.autonomous,
                ...toEntryTimes(e.segments),
                // Minutos con actividad antes de recortar contra lo ya cargado del mismo cliente.
                raw_minutes: e.raw_minutes,
                // Proyectos del mismo cliente trabajados en paralelo que se unificaron en esta hora.
                unified: e.unified,
                allow_overlap: e.allow_overlap,
                notes: e.notes,
                current: current ? { id: current.id, title: current.title, description: current.description } : null,
                evidence: e.evidence,
            });
        }
        for (const d of resolved.discarded) {
            result.discarded.push({ ref: d.ref, date: d.date, window: w.scope, project: d.project ? `${d.project.client.name} / ${d.project.name}` : null, autonomous: d.autonomous, raw_minutes: d.raw_minutes, reason: d.reason });
        }
        for (const d of resolved.doubts) {
            const key = `${d.kind}|${d.ref}`;
            if (seenDoubts.has(key)) continue;
            seenDoubts.add(key);
            result.doubts.push({ ...d, window: w.scope, project: d.project ? { id: d.project.id, name: d.project.name, client: d.project.client?.name } : null });
        }
        for (const u of unmapped.values()) {
            const segs = windowSegments(u.points.map((p) => p.t), w, pauseMin);
            const item = { date: w.date, window: w.scope, folder: u.folder, minutes: workedMinutes(segs), worked_spans: toEntryTimes(segs).worked_spans };
            if (item.minutes >= MIN_WORKED_MIN) {
                result.doubts.push({ kind: "carpeta_sin_proyecto", ref: `carpeta:${normPath(u.folder)}:${w.date}:${w.scope}`, ...item, evidence: evidenceOf(u.points, agentTasks, sessionPoints),
                    message: `Trabajo en una carpeta sin proyecto de MyKimai (${u.folder}): ${item.minutes} min.` });
            } else {
                result.ignored.push({ ...item, reason: `carpeta sin proyecto y menos de ${MIN_WORKED_MIN} min` });
            }
        }
    }
    return result;
}

// ── apply ────────────────────────────────────────────────────────────────────
async function readStdin() {
    let text = "";
    for await (const chunk of process.stdin) text += chunk;
    return text;
}

async function readTextos(opts) {
    if (opts.textos === "-") {
        const text = (await readStdin()).replace(/^﻿/, "").trim();
        if (!text) return {};
        try { return JSON.parse(text); } catch (err) { throw new Error(`Los textos de stdin no son JSON válido (${err.message}).`); }
    }
    return typeof opts.textos === "string" ? readJson(opts.textos, {}) : {};
}

async function apply(opts) {
    const planFile = typeof opts.plan === "string" ? opts.plan : DEFAULT_PLAN;
    const p = readJson(planFile, null);
    if (!p) throw new Error(`No hay plan en ${planFile}: correr antes \`sync.mjs plan\`.`);
    if (p.simulated) throw new Error("Ese plan es una simulación (--simular): no se carga.");
    if (!opts.forzar && Date.now() - Date.parse(p.generated_at) > MAX_PLAN_AGE_MS) {
        throw new Error(`El plan es de ${p.generated_at}: volvé a correr \`sync.mjs plan\` (o --forzar).`);
    }
    const textos = await readTextos(opts);
    const dryRun = Boolean(opts["dry-run"]);
    const state = readJson(STATE_FILE, {});
    state.entries ??= {};

    // Revalidar contra lo que hay AHORA en MyKimai (Lucas pudo editar o borrar desde el plan).
    const dates = uniq(p.actions.map((a) => a.date)).sort();
    const fresh = dates.length
        ? (await apiOrThrow("list_time_entries", { from: addDays(dates[0], -1), to: addDays(dates.at(-1), 2) })).entries
        : [];

    // Primero los ajustes (pueden hacerle lugar a una alta), después las altas.
    const order = { skip: 0, noop: 1, update: 2, create: 3 };
    const actions = [...p.actions].sort((a, b) => order[a.action] - order[b.action]);
    const results = [];
    const blocked = new Set();
    for (const a of actions) {
        const current = fresh.find((e) => e.external_ref === a.ref);
        const rec = state.entries[a.ref];
        let kind = a.action;
        let reason = a.reason;
        if (kind === "create" && (current || rec)) {
            kind = "skip";
            reason = current ? "ya existe (se cargó después del plan)" : "la borraste; no la vuelvo a crear";
        } else if (kind === "update" || kind === "noop") {
            const frozen = frozenReason(current, rec);
            if (!current || (frozen && !(kind === "noop" && !rec))) {
                kind = "skip";
                reason = frozen ?? "ya no existe";
            }
        }
        if (kind === "skip" || (kind === "noop" && rec)) {
            results.push({ ref: a.ref, date: a.date, action: kind, reason });
            continue;
        }

        const times = { start_time: a.start_time, end_time: a.end_time, breaks: a.breaks.map(({ start_time, end_time }) => ({ start_time, end_time })) };
        let call = null;
        if (kind === "create") {
            const t = textos[a.ref];
            if (!t?.title?.trim()) {
                // Reintentable: la próxima corrida vuelve a escribir los textos.
                blocked.add(a.date);
                results.push({ ref: a.ref, date: a.date, action: "retry", error: "falta el título en los textos" });
                continue;
            }
            call = ["create_time_entry", { project_id: a.project.id, title: t.title.trim(), description: t.description?.trim() || undefined, ...times, autonomous: a.autonomous, allow_overlap: a.allow_overlap || undefined, external_ref: a.ref }];
        } else if (kind === "update") {
            call = ["update_time_entry", { entry_id: current.id, ...times, allow_overlap: a.allow_overlap || undefined }];
        }
        if (dryRun) {
            results.push({ ref: a.ref, date: a.date, action: kind, dry_run: true, call: call ? { tool: call[0], args: call[1] } : null });
            continue;
        }
        try {
            let entry = current; // noop de una hora que el agente todavía no tenía registrada: la adopta
            if (call) {
                const r = await api(...call);
                if (!r.ok) {
                    results.push({ ref: a.ref, date: a.date, action: "error", code: r.data.code, error: r.data.error, details: r.data.details });
                    continue;
                }
                entry = r.data.entry ?? r.data;
            }
            state.entries[a.ref] = { entry_id: entry.id, fingerprint: fingerprint(entry), written_at: new Date().toISOString() };
            results.push({ ref: a.ref, date: a.date, action: kind, entry_id: entry.id, project: a.project.name, title: entry.title, from_to: `${toArHm(Date.parse(entry.start_time))}–${toArHm(Date.parse(entry.end_time))}`, minutes: entry.duration_minutes, amount: entry.amount });
        } catch (err) {
            if (!(err instanceof RetryableError)) throw err;
            blocked.add(a.date);
            results.push({ ref: a.ref, date: a.date, action: "retry", error: err.message });
        }
    }

    if (!dryRun && p.auto) {
        // Una fecha queda sincronizada con su jornada y su noche completas y sin errores reintentables,
        // y solo de a una fecha contigua (nunca se saltea una).
        const completeDates = uniq(p.windows.map((w) => w.date))
            .filter((d) => ["day", "night"].every((scope) => p.windows.some((w) => w.date === d && w.scope === scope && w.complete)));
        state.last_full_day = advanceLastFullDay({ lastFullDay: state.last_full_day, floor: FLOOR_DATE, completeDates, blockedDates: [...blocked] }) ?? undefined;
    }
    const out = { dry_run: dryRun, plan: planFile, plan_generated_at: p.generated_at, last_full_day: state.last_full_day ?? null, retry_dates: [...blocked].sort(), results };
    if (!dryRun) {
        state.last_run = { at: new Date().toISOString(), plan: planFile, errors: results.filter((r) => r.action === "error").length, retries: results.filter((r) => r.action === "retry").length };
        writeJson(STATE_FILE, state, { backup: true });
        writeJson(APPLY_FILE, out);
    }
    return out;
}

// ── dudas ────────────────────────────────────────────────────────────────────
/**
 * Junta las dudas del plan y los errores definitivos del apply con el mensaje para cada una y las
 * sesiones (carpeta y franja) donde pasó ese trabajo. Las de corridas anteriores que nadie repartió
 * siguen pendientes; las avisadas se olvidan a las dos semanas.
 */
function dudas(opts) {
    const planFile = typeof opts.plan === "string" ? opts.plan : DEFAULT_PLAN;
    const p = readJson(planFile, null);
    if (!p) throw new Error("No hay plan: correr antes `sync.mjs plan`.");
    const applied = readJson(APPLY_FILE, { results: [] });
    const previous = new Map((readJson(DUDAS_FILE, {}).dudas ?? []).map((d) => [d.id, d]));

    const items = p.doubts.map((d) => ({ ...d, id: `${d.kind}|${d.ref}` }));
    // Solo los errores de este plan (el apply.json puede ser de otra corrida).
    const appliedHere = applied.plan_generated_at === p.generated_at ? applied.results : [];
    for (const r of appliedHere.filter((x) => x.action === "error")) {
        const a = p.actions.find((x) => x.ref === r.ref);
        if (!a) continue;
        items.push({ kind: "error_al_cargar", id: `error|${a.ref}`, date: a.date, window: a.window, ref: a.ref, project: a.project,
            minutes: a.minutes, worked_spans: a.worked_spans, evidence: a.evidence,
            message: `No pude cargar "${a.project.client} / ${a.project.name}": ${r.error ?? r.code}.` });
    }

    const dudasOut = items.map((d) => ({
        id: d.id,
        kind: d.kind,
        date: d.date,
        window: d.window ?? null,
        message: d.message,
        minutes: d.minutes ?? null,
        worked_spans: d.worked_spans ?? [],
        folder: d.folder ?? null,
        project: d.project ?? null,
        // Dónde pasó: la sesión de reparto elige con esto a qué sesión de Claude Desktop avisarle.
        sessions: (d.evidence?.sessions ?? []).map(({ cwd, from, to }) => ({ cwd, from, to })),
        text: doubtText(d),
        notified_at: previous.get(d.id)?.notified_at ?? null,
    }));
    const ids = new Set(dudasOut.map((d) => d.id));
    const twoWeeksAgo = Date.now() - 14 * 86_400_000;
    for (const old of previous.values()) {
        if (ids.has(old.id)) continue;
        if (!old.notified_at || Date.parse(old.notified_at) > twoWeeksAgo) dudasOut.push(old);
    }
    const out = { generated_at: toArIso(Date.now()), pending: dudasOut.filter((d) => !d.notified_at).length, dudas: dudasOut };
    writeJson(DUDAS_FILE, out);
    return { dudas_file: DUDAS_FILE, ...out };
}

const QUESTION = {
    carpeta_sin_proyecto: "¿a qué proyecto va este trabajo? Si no se factura, decime \"ignorar\" y no vuelvo a preguntar por esta carpeta.",
    cargado_a_mano_parcial: "¿cargo esa actividad extra (extendiendo la hora que ya está) o la dejo así?",
    proyecto_inactivo: "¿lo cargo igual, lo paso a otro proyecto o no lo cargo?",
    proyecto_inexistente: "¿a qué proyecto va? El mapa de carpetas apunta a uno que no existe.",
    hora_en_curso: "si quedó prendido, frenalo o corregilo en Mis Horas.",
    hora_desmedida: "si quedó un timer prendido, corregí esa hora en Mis Horas.",
    error_al_cargar: "¿cómo lo resuelvo?",
};

function doubtText(d) {
    const day = d.date ? `${d.date.slice(8, 10)}/${d.date.slice(5, 7)}${d.window === "night" ? " (noche)" : ""}` : "";
    const when = [day, d.worked_spans?.length ? `franjas ${d.worked_spans.join(", ")}` : "", d.minutes ? `${d.minutes} min` : ""].filter(Boolean).join(" · ");
    return [
        `[Agente de horas de MyKimai] ${d.message}`,
        when && `(${when})`,
        `Lucas: ${QUESTION[d.kind] ?? "¿cómo lo resuelvo?"}`,
        "(Para Claude: no hagas nada hasta que Lucas conteste. Después resolvelo con \"Agente de las 7\" del skill cerrar-jornada, mostrale la tabla antes de cargar y, al terminar, desfijá esta sesión.)",
    ].filter(Boolean).join("\n");
}

// ── main ─────────────────────────────────────────────────────────────────────
const opts = parseArgs(process.argv.slice(2));
const command = opts._[0];
try {
    if (command === "plan") {
        const file = typeof opts.out === "string" ? resolve(opts.out) : DEFAULT_PLAN;
        // Si el plan falla, que no quede el de la corrida anterior para aplicar por error.
        rmSync(file, { force: true });
        const out = await plan(opts);
        writeJson(file, out);
        console.log(JSON.stringify({ plan_file: file, ...out }, null, 2));
    } else if (command === "apply") {
        console.log(JSON.stringify(await apply(opts), null, 2));
    } else if (command === "dudas") {
        console.log(JSON.stringify(dudas(opts), null, 2));
    } else {
        console.error("Uso: node sync.mjs plan [--date YYYY-MM-DD] [--out plan.json] [--simular] | apply [--plan plan.json] [--textos textos.json | --textos -] [--dry-run] [--forzar] | dudas");
        process.exit(2);
    }
} catch (err) {
    console.error(`✖ ${err.message}`);
    process.exit(1);
}
