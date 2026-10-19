// Shared family budget: one JSON document in Netlify Blobs, guarded by a family password.
import { getStore } from "@netlify/blobs";
import { createHash, timingSafeEqual } from "node:crypto";

const KEY = "household";
const CFG_KEYS = new Set(["settings", "opening", "month", "plans", "goals", "debts", "fixed", "ritual", "lastCount", "started"]);
const empty = () => ({ rev: 0, tx: [], cfg: {} });
const digest = (s) => createHash("sha256").update(String(s)).digest();
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

const LOCK = "lock";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function withLock(store, fn) {
  for (let i = 0; i < 60; i++) {
    const got = await store.setJSON(LOCK, { at: Date.now() }, { onlyIfNew: true });
    if (got.modified) {
      try { return await fn(); } finally { await store.delete(LOCK).catch(() => {}); }
    }
    const held = await store.get(LOCK, { type: "json" }).catch(() => null);
    if (held && Date.now() - held.at > 8000) await store.delete(LOCK).catch(() => {});
    await sleep(40 + Math.random() * 80);
  }
  throw new Error("busy");
}

function password() {
  return globalThis.Netlify?.env?.get?.("FAMILY_PASSWORD") ?? process.env.FAMILY_PASSWORD ?? "";
}

function authorized(req) {
  const pass = password();
  if (pass.length < 6) return false;
  const got = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  return timingSafeEqual(digest(got), digest(pass));
}

// Apply one phone's changes: new entries are added once (by id), removed entries are dropped,
// and each settings key that phone changed replaces the stored one.
function apply(doc, body) {
  const del = new Set(Array.isArray(body.del) ? body.del.filter((x) => typeof x === "string") : []);
  if (del.size) doc.tx = doc.tx.filter((t) => !del.has(t.id));
  const ids = new Set(doc.tx.map((t) => t.id));
  for (const t of Array.isArray(body.add) ? body.add : []) {
    if (t && typeof t.id === "string" && !ids.has(t.id) && !del.has(t.id)) {
      doc.tx.push(t);
      ids.add(t.id);
    }
  }
  if (body.cfg && typeof body.cfg === "object") {
    for (const [k, v] of Object.entries(body.cfg)) if (CFG_KEYS.has(k)) doc.cfg[k] = v;
  }
  doc.rev = (doc.rev || 0) + 1;
  doc.updated = new Date().toISOString();
}

export default async (req) => {
  if (!authorized(req)) return json({ error: "unauthorized" }, 401);
  const store = getStore({ name: "family-budget", consistency: "strong" });

  if (req.method === "GET") {
    const doc = await store.get(KEY, { type: "json" });
    return json(doc || empty());
  }

  if (req.method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch {
      return json({ error: "bad request" }, 400);
    }
    // Two phones can save at the same moment: only one request at a time edits the document.
    try {
      const doc = await withLock(store, async () => {
        const cur = (await store.get(KEY, { type: "json" })) || empty();
        apply(cur, body);
        await store.setJSON(KEY, cur);
        return cur;
      });
      // One snapshot per day, kept as a safety net.
      await store.setJSON(`backup-${doc.updated.slice(0, 10)}`, doc, { onlyIfNew: true }).catch(() => {});
      return json(doc);
    } catch {
      return json({ error: "busy" }, 409);
    }
  }

  return json({ error: "method not allowed" }, 405);
};

export const config = { path: "/api/state" };
