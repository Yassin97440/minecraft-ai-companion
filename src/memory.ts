import fs from "node:fs";
import path from "node:path";

export type JournalEntry = { t: number; kind: string; text: string };

const MAX_ENTRIES = 200;

/** Journal persistant : sert de mémoire long terme (et de source de running gags). */
export class Journal {
  private entries: JournalEntry[] = [];

  constructor(private file = path.join("data", "journal.json")) {
    try {
      this.entries = JSON.parse(fs.readFileSync(this.file, "utf8"));
    } catch {
      this.entries = [];
    }
  }

  append(kind: string, text: string) {
    this.entries.push({ t: Date.now(), kind, text: text.slice(0, 300) });
    if (this.entries.length > MAX_ENTRIES) this.entries.splice(0, this.entries.length - MAX_ENTRIES);
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.entries, null, 2));
    } catch (err) {
      console.warn("[journal] écriture impossible:", err);
    }
  }

  recent(n = 15): JournalEntry[] {
    return this.entries.slice(-n);
  }

  format(n = 15): string {
    const items = this.recent(n);
    if (!items.length) return "(vide)";
    return items.map((e) => `- [${e.kind}] ${e.text}`).join("\n");
  }
}
