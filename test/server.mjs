// Local test server: serves public/ and runs the Netlify function against a local Blobs store.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { BlobsServer } from "@netlify/blobs/server";
const PORT = Number(process.env.PORT || 8970), BPORT = PORT + 1;
fs.rmSync("test/.blobs", { recursive: true, force: true });
const bs = new BlobsServer({ directory: "test/.blobs", token: "tkn", port: BPORT });
await bs.start();
globalThis.netlifyBlobsContext = Buffer.from(JSON.stringify({ edgeURL: `http://localhost:${BPORT}`, uncachedEdgeURL: `http://localhost:${BPORT}`, token: "tkn", siteID: "site" })).toString("base64");
process.env.FAMILY_PASSWORD = "test-pass-123";
const fn = (await import("../netlify/functions/state.mjs")).default;
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".png": "image/png", ".webmanifest": "application/manifest+json" };
http.createServer(async (req, res) => {
  if (req.url.startsWith("/api/state")) {
    const chunks = []; for await (const c of req) chunks.push(c);
    const r = await fn(new Request("http://localhost" + req.url, { method: req.method, headers: req.headers, body: req.method === "GET" ? undefined : Buffer.concat(chunks) }));
    res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer())); return;
  }
  let p = req.url.split("?")[0]; if (p === "/") p = "/index.html";
  const f = path.join("public", p);
  if (fs.existsSync(f)) { res.writeHead(200, { "content-type": types[path.extname(f)] || "application/octet-stream" }); res.end(fs.readFileSync(f)); }
  else { res.writeHead(404); res.end(); }
}).listen(PORT, () => console.log("test server on", PORT));
