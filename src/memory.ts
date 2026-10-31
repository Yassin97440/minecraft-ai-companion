import fs from "node:fs";
import path from "node:path";

export type MemoryKind = "place" | "preference" | "fact";
export type MemoryEntry = { key: string; kind: MemoryKind; text: string; pos?: { x: number; y: number; z: number }; t: number };
export type Mission = {
  goal: string;
  objectives: { text: string; done: boolean }[];
  status: "active" | "done" | "abandoned";
  summary?: string;
  /** Dernière activité (création ou objectif coché) : sert à expirer une mission oubliée. */
  updatedAt?: number;
};
type MemoryStore = { entries: MemoryEntry[]; mission: Mission | null };

const MAX_FACTS = 60;
/** Une mission sans aucun progrès depuis ce délai est abandonnée (le modèle a oublié `end_mission`). */
export const MISSION_TTL_MS = 30 * 60_000;
/** Les objets tombés à la mort disparaissent au bout de 5 min. */
export const DEATH_TTL_MS = 5 * 60_000;
/** Entrées vitales : jamais évincées par le plafond (sinon 60 coffres effacent la base ou le lieu de la mort). */
const PINNED = /^(mort|lit|mine|base|home)$/;
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Mémoire durable et structurée (lieux, préférences, faits) + mission en cours.
 * Contrairement au journal (historique brut), elle est dédupliquée par clé et relue à chaque décision.
 */
export class Memory {
  private store: MemoryStore = { entries: [], mission: null };

  constructor(
    private file = path.join("data", "memory.json"),
    private now: () => number = Date.now,
  ) {
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
      t: this.now(),
    };
    this.store.entries = this.store.entries.filter((e) => e.key !== entry.key);
    this.store.entries.push(entry);
    // Éviction : les plus anciennes entrées NON épinglées d'abord.
    let excess = this.store.entries.length - MAX_FACTS;
    this.store.entries = this.store.entries.filter((e) => !(excess > 0 && !PINNED.test(e.key) && excess-- > 0));
    this.save();
  }

  /** Lieu de la mort, si les affaires peuvent encore être là (< 5 min). */
  pendingDeath(): MemoryEntry | null {
    const e = this.store.entries.find((x) => x.key === "mort");
    return e?.pos && this.now() - e.t < DEATH_TTL_MS ? e : null;
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

  /** Mission en cours ; une mission inactive depuis MISSION_TTL_MS est abandonnée au passage. */
  activeMission(): Mission | null {
    const m = this.store.mission;
    if (m?.status !== "active") return null;
    if (this.now() - (m.updatedAt ?? 0) > MISSION_TTL_MS) {
      m.status = "abandoned";
      m.summary = "expirée : aucun progrès depuis 30 min";
      this.save();
      return null;
    }
    return m;
  }

  startMission(goal: string, objectives: string[]): Mission {
    this.store.mission = { goal, objectives: objectives.map((text) => ({ text, done: false })), status: "active", updatedAt: this.now() };
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
    m.updatedAt = this.now();
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
