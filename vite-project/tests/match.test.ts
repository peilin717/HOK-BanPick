import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initialMatch,
  sequence,
  lockHero,
  undo,
  finishGame,
  nextGame,
  swapSides,
  unavailable,
  usedBy,
  parseMatch,
  teamFor,
} from "../src/match.ts";
import type { Match, Hero } from "../src/match.ts";
const heroes: Hero[] = Array.from({ length: 133 }, (_, i) => ({
  id: i + 1,
  name: `英雄${i + 1}`,
  roles: [],
  portrait: "",
  splash: "",
}));
function autoDraft(m: Match) {
  while (m.status === "draft") {
    const h = heroes.find((h) => !unavailable(m, h.id))!;
    m = lockHero(m, h.id);
  }
  return m;
}
function sixGames() {
  let m = { ...initialMatch(), bestOf: 7 };
  for (let i = 0; i < 6; i++) {
    m = finishGame(autoDraft(m), i % 2 ? "team-b" : "team-a");
    if (i < 5) m = nextGame(m);
  }
  return m;
}
test("KPL2026 exact 20-step sequence is two bans, three picks, three bans, two picks each", () => {
  const m = initialMatch();
  assert.equal(m.bans, 5);
  assert.equal(m.version, 2);
  const s = sequence(m);
  assert.deepEqual(
    s.map((x) => `${x.phase}:${x.side}:${x.action}`),
    [
      "1:blue:ban",
      "1:red:ban",
      "1:blue:ban",
      "1:red:ban",
      "2:blue:pick",
      "2:red:pick",
      "2:red:pick",
      "2:blue:pick",
      "2:blue:pick",
      "2:red:pick",
      "3:red:ban",
      "3:blue:ban",
      "3:red:ban",
      "3:blue:ban",
      "3:red:ban",
      "3:blue:ban",
      "4:red:pick",
      "4:blue:pick",
      "4:blue:pick",
      "4:red:pick",
    ],
  );
  assert.equal(
    s.slice(0, 10).filter((x) => x.side === "blue" && x.action === "pick")
      .length,
    3,
  );
  assert.equal(
    s.slice(0, 10).filter((x) => x.side === "red" && x.action === "pick")
      .length,
    3,
  );
});
test("BO7 3:3 automatically starts no-ban peak and unlocks prior heroes; 4:3 ends series", () => {
  const six = sixGames();
  assert.deepEqual(
    six.teams.map((t) => t.score),
    [3, 3],
  );
  let m = nextGame(six);
  assert.equal(m.peak, true);
  assert.equal(sequence(m).length, 10);
  const old = usedBy(m, "team-a").slice(0, 5);
  for (let side = 0; side < 2; side++)
    for (const id of old) {
      assert.equal(unavailable(m, id), null);
      m = lockHero(m, id);
    }
  assert.equal(parseMatch(m, heroes).peak, true);
  assert.throws(() => finishGame(m, "team-a"));
  m = finishGame({ ...m, revealed: true }, "team-a");
  assert.equal(parseMatch(m, heroes).status, "finished");
  assert.throws(() => nextGame(m));
});
test("BO3 and BO5 deciders remain normal BP; BO7 cannot enter peak early or continue after 4:0", () => {
  for (const bestOf of [3, 5]) {
    let m = { ...initialMatch(), bestOf };
    for (let i = 0; i < bestOf - 1; i++) {
      m = finishGame(autoDraft(m), i % 2 ? "team-b" : "team-a");
      m = nextGame(m);
    }
    assert.equal(m.peak, false);
    assert.equal(sequence(m).length, 20);
  }
  let m = { ...initialMatch(), bestOf: 7 };
  for (let i = 0; i < 4; i++) {
    m = finishGame(autoDraft(m), "team-a");
    if (i < 3) m = nextGame(m);
  }
  assert.throws(() => nextGame(m));
  assert.throws(() =>
    parseMatch({ ...initialMatch(), bestOf: 7, peak: true }, heroes),
  );
  const inconsistent = sixGames();
  inconsistent.teams[0].score = 2;
  assert.throws(() => nextGame(inconsistent));
});
test("legacy in-progress 3+2 ban save retains its original order; new empty save upgrades safely", () => {
  const old = lockHero({ ...initialMatch(), version: 1, bans: 5 }, 1);
  const loaded = parseMatch(old, heroes);
  assert.equal(loaded.version, 1);
  assert.equal(sequence(loaded)[4].action, "ban");
  assert.equal(
    parseMatch({ ...initialMatch(), version: 1, bans: 4 }, heroes).version,
    2,
  );
});
function drafted(m = initialMatch(), start = 1) {
  for (let i = 0; i < sequence(m).length; i++) m = lockHero(m, start + i);
  return m;
}
test("4/5 ban sequences preserve two phases, 5 picks and expected starting sides", () => {
  for (const bans of [4, 5] as const) {
    const steps = sequence({ peak: false, bans });
    assert.equal(steps.length, 10 + 2 * bans);
    for (const side of ["blue", "red"]) {
      assert.equal(
        steps.filter((s) => s.side === side && s.action === "ban").length,
        bans,
      );
      assert.equal(
        steps.filter((s) => s.side === side && s.action === "pick").length,
        5,
      );
    }
    assert.equal(steps.find((s) => s.phase === 3)?.side, "red");
    assert.equal(steps.find((s) => s.phase === 4)?.side, "red");
  }
});
test("lock prevents duplicates; undo restores legality and ready state", () => {
  let m = lockHero(initialMatch(), 1);
  assert.throws(() => lockHero(m, 1));
  m = undo(m);
  assert.equal(unavailable(m, 1), null);
  m = drafted(m);
  assert.equal(m.status, "ready");
  assert.throws(() => lockHero(m, 100));
  m = undo(m);
  assert.equal(m.status, "draft");
  assert.equal(m.selections.length, 19);
});
test("global hero ownership survives side swap; opponent can use the other team historical picks", () => {
  let m = drafted();
  const firstBlue = m.selections.find(
      (s) => s.side === "blue" && s.action === "pick",
    )!.hero,
    firstRed = m.selections.find(
      (s) => s.side === "red" && s.action === "pick",
    )!.hero;
  m = finishGame(m, "team-a");
  assert.deepEqual(usedBy(m, "team-a").length, 5);
  m = swapSides(nextGame(m));
  assert.equal(teamFor(m, "red").id, "team-a");
  for (let i = 0; i < 4; i++) m = lockHero(m, 80 + i);
  assert.equal(unavailable(m, firstRed), "本队全局已使用");
  assert.equal(unavailable(m, firstBlue), null);
  m = lockHero(m, 90);
  assert.equal(unavailable(m, firstBlue), "本队全局已使用");
  assert.equal(unavailable(m, firstRed), null);
});
test("historical bans are reusable and historical picks may be banned", () => {
  let m = nextGame(finishGame(drafted(), "team-a"));
  assert.equal(unavailable(m, 1), null);
  assert.equal(unavailable(m, 5), null);
  m = lockHero(m, 5);
  assert.equal(unavailable(m, 5), "本局已选禁");
});
test("cannot swap mid-game or advance unfinished match; BO3 stops at 2 wins", () => {
  assert.throws(() => nextGame(initialMatch()));
  assert.throws(() => swapSides(lockHero(initialMatch(), 1)));
  let m = finishGame(drafted(), "team-a");
  assert.throws(() => finishGame(m, "team-a"));
  m = finishGame(drafted(nextGame(m), 30), "team-a");
  assert.equal(m.teams[0].score, 2);
  assert.throws(() => nextGame(m));
});
test("peak allows mirror heroes and previously used heroes; requires reveal before recording", () => {
  let m = nextGame(
    finishGame(drafted({ ...initialMatch(), version: 1 }), "team-a"),
  );
  m = { ...m, peak: true };
  for (let side = 0; side < 2; side++)
    for (let id = 5; id < 10; id++) m = lockHero(m, id);
  assert.equal(m.status, "ready");
  assert.throws(() => finishGame(m, "team-b"));
  m = finishGame({ ...m, revealed: true }, "team-b");
  assert.equal(m.games[1].peak, true);
});
test("save validation rejects invented heroes, wrong order, missing team and illegal global reuse", () => {
  const m = drafted();
  assert.equal(parseMatch(m, heroes).selections.length, 20);
  for (const mutate of [
    (x: Match) => {
      x.selections[0].hero = 999;
    },
    (x: Match) => {
      x.selections[0].side = "red";
    },
    (x: Match) => {
      x.teams[1].id = x.teams[0].id;
    },
    (x: Match) => {
      x.status = "draft";
    },
  ]) {
    const bad = structuredClone(m);
    mutate(bad);
    assert.throws(() => parseMatch(bad, heroes));
  }
  let next = nextGame(finishGame(m, "team-a"));
  next = drafted(next, 30);
  next.selections[4].hero = 5;
  assert.throws(() => parseMatch(next, heroes));
});
test("valid finished series and peak saves round-trip; restored timers pause safely", () => {
  let m = finishGame(drafted({ ...initialMatch(), version: 1 }), "team-a");
  assert.equal(parseMatch(m, heroes).status, "finished");
  m = { ...nextGame(m), peak: true };
  for (let side = 0; side < 2; side++)
    for (let id = 5; id < 10; id++) m = lockHero(m, id);
  assert.equal(parseMatch(m, heroes).peak, true);
  const live = { ...initialMatch(), deadline: Date.now() + 10000 };
  assert.equal(parseMatch(live, heroes).deadline, null);
});
