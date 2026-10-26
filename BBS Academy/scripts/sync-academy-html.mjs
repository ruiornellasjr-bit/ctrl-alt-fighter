import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = resolve(root, "public");
await mkdir(resolve(publicDir, "assets"), { recursive: true });
const html = await readFile(resolve(root, "index.html"), "utf8");
await writeFile(resolve(publicDir, "index.html"), html, "utf8");
await copyFile(
  resolve(root, "assets/logo-bbs-one.png"),
  resolve(publicDir, "assets/logo-bbs-one.png"),
);
await copyFile(resolve(root, "academy-runtime.js"), resolve(publicDir, "academy-runtime.js"));
await mkdir(resolve(publicDir, "data"), { recursive: true });
await copyFile(resolve(root, "data/course-catalog.json"), resolve(publicDir, "data/course-catalog.json"));
await copyFile(resolve(root, "data/role-paths.json"), resolve(publicDir, "data/role-paths.json"));
