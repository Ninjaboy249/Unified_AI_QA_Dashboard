import express from "express";
import path from "node:path";
import { app } from "./app.js";

const port = Number(process.env.PORT ?? 4000);
const staticDir = path.resolve(process.cwd(), "dist");

app.use(express.static(staticDir));
app.get(/.*/, (_req, res) => res.sendFile(path.join(staticDir, "index.html")));

app.listen(port, () => {
  console.log(`Unified AI QA Dashboard API listening on http://localhost:${port}`);
});
