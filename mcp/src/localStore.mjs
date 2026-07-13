import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STORE_PATH = join(__dirname, "..", "data", "local-bookings.json");

async function ensureStore() {
  await mkdir(dirname(STORE_PATH), { recursive: true });
  try {
    await readFile(STORE_PATH, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await writeFile(STORE_PATH, "[]\n", "utf8");
  }
}

export async function readBookings() {
  await ensureStore();
  const raw = await readFile(STORE_PATH, "utf8");
  return JSON.parse(raw || "[]");
}

export async function writeBookings(bookings) {
  await ensureStore();
  await writeFile(STORE_PATH, `${JSON.stringify(bookings, null, 2)}\n`, "utf8");
}
