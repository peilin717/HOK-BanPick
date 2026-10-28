import { readFileSync } from "node:fs";
import {
  initialMatch,
  lockHero,
  unavailable,
  finishGame,
  nextGame,
} from "../src/match.ts";
const { heroes } = JSON.parse(
  readFileSync(new URL("../public/data/heroes.json", import.meta.url), "utf8"),
);
let m = { ...initialMatch(), bestOf: 7 };
for (let i = 0; i < 6; i++) {
  while (m.status === "draft")
    m = lockHero(
      m,
      heroes.find((h: { id: number }) => !unavailable(m, h.id)).id,
    );
  m = finishGame(m, i % 2 ? "team-b" : "team-a");
  if (i < 5) m = nextGame(m);
}
process.stdout.write(JSON.stringify(m));
