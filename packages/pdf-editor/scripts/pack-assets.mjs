import { copyFile, mkdir } from "node:fs/promises";
await mkdir(new URL("../dist/", import.meta.url), { recursive: true });
await copyFile(new URL("../src/style.css", import.meta.url), new URL("../dist/style.css", import.meta.url));
