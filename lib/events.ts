import { promises as fs } from "node:fs";
import path from "node:path";
import type { CosmeEvent } from "./types";

const DATA_PATH = path.join(process.cwd(), "data", "events.json");

export interface EventDataFile {
  updatedAt: string;
  events: CosmeEvent[];
}

export async function loadEvents(): Promise<EventDataFile> {
  try {
    const raw = await fs.readFile(DATA_PATH, "utf-8");
    const parsed = JSON.parse(raw) as EventDataFile;
    parsed.events = (parsed.events ?? []).sort(
      (a, b) => a.startDate.localeCompare(b.startDate)
    );
    return parsed;
  } catch {
    return { updatedAt: new Date().toISOString(), events: [] };
  }
}
