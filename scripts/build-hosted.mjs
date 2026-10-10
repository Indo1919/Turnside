import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, stat } from "node:fs/promises";
import { dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build as buildWorker } from "esbuild";
import { build as buildClient } from "vite";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "dist");
const manifestPath = resolve(root, ".openai/hosting.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (typeof manifest.project_id !== "string" || !manifest.project_id.trim())
  throw new Error("Hosting needs the registered Site project ID.");
if (Object.hasOwn(manifest, "static"))
  throw new Error(
    "Remove the static hosting declaration for this Worker build.",
  );

await buildClient({
  root,
  configFile: resolve(root, "vite.config.ts"),
  build: { outDir: output, emptyOutDir: true, sourcemap: false },
});

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
};
const assets = Object.create(null);
async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries.sort((a, b) =>
    a.name.localeCompare(b.name, "en"),
  )) {
    if (["server", ".openai"].includes(entry.name) && directory === output)
      continue;
    if (entry.name.startsWith(".env"))
      throw new Error(
        "Environment files must not be included in frontend assets.",
      );
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await collect(path);
    else if (entry.isFile()) {
      const bytes = await readFile(path);
      const url = `/${relative(output, path).split("\\").join("/")}`;
      assets[url] = {
        body: bytes.toString("base64"),
        mime:
          mime[extname(entry.name).toLowerCase()] || "application/octet-stream",
        etag: `"${createHash("sha256").update(bytes).digest("hex").slice(0, 24)}"`,
        size: bytes.byteLength,
      };
    } else throw new Error("Hosted assets must be regular files.");
  }
}
await collect(output);
if (!assets["/index.html"])
  throw new Error("The frontend build has no index.html.");

await mkdir(resolve(output, "server"), { recursive: true });
await buildWorker({
  absWorkingDir: root,
  entryPoints: [resolve(root, "hosting/worker.ts")],
  outfile: resolve(output, "server/index.js"),
  bundle: true,
  platform: "browser",
  format: "esm",
  target: "es2022",
  minify: true,
  sourcemap: false,
  legalComments: "none",
  charset: "utf8",
  define: { "process.env": "{}" },
  alias: {
    express: resolve(root, "hosting/express-fetch.ts"),
    buffer: "buffer/",
  },
  plugins: [
    {
      name: "embedded-client-assets",
      setup(build) {
        build.onResolve({ filter: /^turnside:assets$/ }, () => ({
          path: "assets",
          namespace: "embedded-client",
        }));
        build.onLoad(
          { filter: /^assets$/, namespace: "embedded-client" },
          () => ({
            contents: `export default ${JSON.stringify(assets)};`,
            loader: "js",
          }),
        );
      },
    },
  ],
});
await mkdir(resolve(output, ".openai"), { recursive: true });
await copyFile(manifestPath, resolve(output, ".openai/hosting.json"));
const workerSize = (await stat(resolve(output, "server/index.js"))).size;
console.info(
  `Hosted build includes ${Object.keys(assets).length} frontend assets and one ${Math.ceil(workerSize / 1024)} KiB Worker.`,
);
