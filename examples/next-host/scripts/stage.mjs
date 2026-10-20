import { cp, mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const temp = await mkdtemp(join(tmpdir(), "tpdf-next-host-"));
const host = join(temp, "examples", "next-host");
const library = join(temp, "packages", "pdf-editor");
await mkdir(join(temp, "examples"), { recursive: true });
await mkdir(join(temp, "packages"), { recursive: true });
const filter = (path) => !/(^|[\\/])(node_modules|\.next|test-results|release)([\\/]|$)/.test(path);
await cp(join(root, "examples", "next-host"), host, { recursive: true, filter });
await cp(join(root, "packages", "pdf-editor"), library, { recursive: true, filter });
// Print only the standalone host path for shell command substitution.
process.stdout.write(host + "\n");
