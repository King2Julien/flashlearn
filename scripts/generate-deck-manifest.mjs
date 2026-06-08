import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const decksDirectory = path.join(projectRoot, "decks");
const manifestPath = path.join(decksDirectory, "index.json");

const fileNames = (await readdir(decksDirectory))
  .filter((fileName) => fileName.endsWith(".json") && fileName !== "index.json")
  .sort((left, right) => left.localeCompare(right));

const deckPaths = [];

for (const fileName of fileNames) {
  const filePath = path.join(decksDirectory, fileName);
  let deck;

  try {
    deck = JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    throw new Error(`${fileName} is not valid JSON: ${error.message}`);
  }

  if (!deck.id || !deck.title || !Array.isArray(deck.questions)) {
    throw new Error(`${fileName} is not a valid Flashlearn deck.`);
  }

  deckPaths.push(`./decks/${fileName}`);
}

await writeFile(manifestPath, `${JSON.stringify(deckPaths, null, 2)}\n`);
console.log(`Generated decks/index.json with ${deckPaths.length} decks.`);
