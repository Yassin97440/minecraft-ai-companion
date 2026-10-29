import fs from "node:fs";
import path from "node:path";

export type MemoryKind = "place" | "preference" | "fact";
export type MemoryEntry = { key: string; kind: MemoryKind; text: string; pos?: { x: number; y: number; z: number }; t: number };
export type Mission = {
  goal: string;
  objectives: { text: string; done: boolean }[];
  status: "active" | "done" | "abandoned";
  summary?: string;
};
type MemoryStore = { entries: MemoryEntry[]; mission: Mission | null };

const MAX_FACTS = 60;
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Mémoire durable et structurée (lieux, préférences, faits) + mission en cours.
 * Contrairement au journal (historique brut), elle est dédupliquée par clé et relue à chaque décision.
 */
export class Memory {
  private store: MemoryStore = { entries: [], mission: null };

  constructor(private file = path.join("data", "memory.json")) {
    try {
      this.store = { entries: [], mission: null, ...JSON.parse(fs.readFileSync(this.file, "utf8")) };
    } catch {
      /* première exécution */
    }
  }

  private save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.store, null, 2));
    } catch (err) {
      console.warn("[memory] écriture impossible:", err);
    }
  }

  /** Crée ou remplace l'entrée portant cette clé. */
  set(key: string, kind: MemoryKind, text: string, pos?: { x: number; y: number; z: number }) {
    const entry: MemoryEntry = {
      key: key.trim().toLowerCase(),
      kind,
      text: text.slice(0, 200),
      pos: pos && { x: Math.round(pos.x), y: Math.round(pos.y), z: Math.round(pos.z) },
      t: Date.now(),
    };
    this.store.entries = this.store.entries.filter((e) => e.key !== entry.key);
    this.store.entries.push(entry);
    if (this.store.entries.length > MAX_FACTS) this.store.entries.splice(0, this.store.entries.length - MAX_FACTS);
    this.save();
  }

  forget(key: string): boolean {
    const k = key.trim().toLowerCase();
    const before = this.store.entries.length;
    this.store.entries = this.store.entries.filter((e) => e.key !== k);
    this.save();
    return this.store.entries.length < before;
  }

  entries(): MemoryEntry[] {
    return [...this.store.entries];
  }

  activeMission(): Mission | null {
    return this.store.mission?.status === "active" ? this.store.mission : null;
  }

  startMission(goal: string, objectives: string[]): Mission {
    this.store.mission = { goal, objectives: objectives.map((text) => ({ text, done: false })), status: "active" };
    this.save();
    return this.store.mission;
  }

  /** Coche un objectif (correspondance approximative sur le texte). Renvoie la mission ou null si introuvable. */
  markObjective(text: string, done = true): Mission | null {
    const m = this.activeMission();
    if (!m) return null;
    const q = norm(text);
    const obj = m.objectives.find((o) => norm(o.text).includes(q) || q.includes(norm(o.text)));
    if (!obj) return null;
    obj.done = done;
    this.save();
    return m;
  }

  endMission(status: "done" | "abandoned", summary: string): boolean {
    const m = this.activeMission();
    if (!m) return false;
    m.status = status;
    m.summary = summary.slice(0, 200);
    this.save();
    return true;
  }

  format(): string {
    const lines = this.store.entries.map(
      (e) => `- [${e.kind}] ${e.key}: ${e.text}${e.pos ? ` (${e.pos.x}, ${e.pos.y}, ${e.pos.z})` : ""}`,
    );
    const m = this.store.mission;
    if (m?.status === "active") {
      lines.push(`- [MISSION EN COURS] ${m.goal} | ${m.objectives.map((o) => `${o.done ? "[x]" : "[ ]"} ${o.text}`).join(", ")}`);
    } else if (m) {
      lines.push(`- [dernière mission, ${m.status === "done" ? "terminée" : "abandonnée"}] ${m.goal}${m.summary ? ` : ${m.summary}` : ""}`);
    }
    return lines.length ? lines.join("\n") : "(rien de noté)";
  }
}

export type JournalEntry ={ t: number; kind: string; text: string };

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
