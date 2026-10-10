import express from "express";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApiApp } from "./backend/api";
export { createApiApp } from "./backend/api";

dotenv.config({ path: [".env.local", ".env"], quiet: true });
const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  const app = createApiApp({ env: process.env });
  const port = Number(process.env.PORT) || 3000;
  if (process.env.NODE_ENV === "production") {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (_req, res) =>
      res.sendFile(path.join(__dirname, "dist", "index.html")),
    );
  } else {
    const { createServer } = await import("vite");
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }
  app.listen(port, process.env.HOST || "127.0.0.1", () =>
    console.log(`Turnside is ready at http://localhost:${port}`),
  );
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  startServer().catch(() => {
    console.error(
      "Turnside could not start. Check dependencies and the configured port.",
    );
    process.exitCode = 1;
  });
