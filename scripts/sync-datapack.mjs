// Copie datapack/companion dans le monde du serveur (l'ancienne copie est remplacée), puis rappelle de faire /reload.
// Chemin du monde par défaut : server/world ; autre monde : WORLD_DIR=chemin npm run sync-datapack
import fs from "node:fs";
import path from "node:path";

const world = process.env.WORLD_DIR ?? path.join("server", "world");
const source = path.join("datapack", "companion");
const target = path.join(world, "datapacks", "companion");

if (!fs.existsSync(source)) throw new Error(`Datapack introuvable : ${source}`);
if (!fs.existsSync(world)) throw new Error(`Monde introuvable : ${world} (lance le serveur une fois, ou fixe WORLD_DIR)`);

fs.rmSync(target, { recursive: true, force: true });
fs.cpSync(source, target, { recursive: true });
console.log(`Datapack copié vers ${target}`);
console.log("Dans la console du serveur (ou en jeu, en op), tape : reload");
