// Match sequence adapted from qiqi47/HOK_Ban_Pick (MIT).
export type Side = "blue" | "red";
export type Action = "ban" | "pick";
export interface Hero {
  id: number;
  name: string;
  roles: string[];
  portrait: string;
  splash: string;
  voice?: string;
  voiceText?: string;
}
export interface Step {
  side: Side;
  action: Action;
  phase: number;
}
export interface Team {
  id: string;
  name: string;
  logo: string;
  players: string[];
  score: number;
}
export interface Selection extends Step {
  hero: number;
}
export interface Game {
  number: number;
  blue: string;
  red: string;
  selections: Selection[];
  winner: string;
  peak: boolean;
}
export interface Match {
  version: 1 | 2;
  revision: number;
  title: string;
  subtitle: string;
  bestOf: number;
  global: boolean;
  teams: [Team, Team];
  blue: string;
  selections: Selection[];
  games: Game[];
  seconds: number;
  remaining: number;
  deadline: number | null;
  peak: boolean;
  revealed: boolean;
  bans: 4 | 5;
  status: "draft" | "ready" | "finished";
  preview: number | null;
  audio: {
    bgm: number;
    voice: number;
    muted: boolean;
    replay: number;
    track: number;
  };
}
export const otherSide = (side: Side): Side =>
  side === "blue" ? "red" : "blue";
export function initialMatch(): Match {
  return {
    version: 2,
    revision: 0,
    title: "班级荣耀挑战赛",
    subtitle: "CLASS CHAMPIONSHIP · 2026",
    bestOf: 3,
    global: true,
    teams: [
      {
        id: "team-a",
        name: "逐光",
        logo: "",
        players: ["选手 01", "选手 02", "选手 03", "选手 04", "选手 05"],
        score: 0,
      },
      {
        id: "team-b",
        name: "破晓",
        logo: "",
        players: ["选手 01", "选手 02", "选手 03", "选手 04", "选手 05"],
        score: 0,
      },
    ],
    blue: "team-a",
    selections: [],
    games: [],
    seconds: 45,
    remaining: 45,
    deadline: null,
    peak: false,
    revealed: false,
    bans: 5,
    status: "draft",
    preview: null,
    audio: { bgm: 0.35, voice: 0.85, muted: false, replay: 0, track: 0 },
  };
}
export function sequence(
  m: Pick<Match, "peak" | "bans"> & { version?: 1 | 2 },
): Step[] {
  if (m.peak)
    return (["blue", "red"] as Side[]).flatMap((side) =>
      Array.from({ length: 5 }, () => ({
        side,
        action: "pick" as Action,
        phase: 5,
      })),
    );
  const steps: Step[] = [];
  const add = (phase: number, action: Action, sides: Side[]) =>
    sides.forEach((side) => steps.push({ phase, action, side }));
  add(
    1,
    "ban",
    m.version === 1 && m.bans === 5
      ? ["blue", "red", "blue", "red", "blue", "red"]
      : ["blue", "red", "blue", "red"],
  );
  add(2, "pick", ["blue", "red", "red", "blue", "blue", "red"]);
  add(
    3,
    "ban",
    m.version !== 1 && m.bans === 5
      ? ["red", "blue", "red", "blue", "red", "blue"]
      : ["red", "blue", "red", "blue"],
  );
  add(4, "pick", ["red", "blue", "blue", "red"]);
  return steps;
}
export const teamFor = (m: Match, side: Side): Team =>
  m.teams.find((t) => (side === "blue" ? t.id === m.blue : t.id !== m.blue))!;
export const currentStep = (m: Match) => sequence(m)[m.selections.length];
export function usedBy(m: Match, teamId: string): number[] {
  return m.games.flatMap((g) =>
    g.selections
      .filter(
        (s) =>
          s.action === "pick" &&
          (s.side === "blue" ? g.blue : g.red) === teamId,
      )
      .map((s) => s.hero),
  );
}
export function unavailable(m: Match, hero: number): string | null {
  const step = currentStep(m);
  if (m.status !== "draft" || !step) return "本局选禁已完成";
  if (
    m.selections.some(
      (s) => s.hero === hero && (!m.peak || s.side === step.side),
    )
  )
    return "本局已选禁";
  if (
    !m.peak &&
    m.global &&
    step.action === "pick" &&
    usedBy(m, teamFor(m, step.side).id).includes(hero)
  )
    return "本队全局已使用";
  return null;
}
export function lockHero(m: Match, hero: number): Match {
  const reason = unavailable(m, hero);
  if (reason) throw new Error(reason);
  const selections = [...m.selections, { ...currentStep(m), hero }];
  const done = selections.length === sequence(m).length;
  return {
    ...m,
    selections,
    preview: null,
    status: done ? "ready" : "draft",
    remaining: m.seconds,
    deadline:
      !done && m.deadline !== null ? Date.now() + m.seconds * 1000 : null,
  };
}
export function undo(m: Match): Match {
  if (!m.selections.length || m.status === "finished") return m;
  return {
    ...m,
    selections: m.selections.slice(0, -1),
    status: "draft",
    preview: null,
    revealed: false,
    deadline: null,
    remaining: m.seconds,
  };
}
export function finishGame(m: Match, winner: string): Match {
  if (m.status !== "ready" || !m.teams.some((t) => t.id === winner))
    throw new Error("请先完成 BP，再确认本局胜方");
  if (m.peak && !m.revealed) throw new Error("请先揭晓巅峰对决阵容");
  const game: Game = {
    number: m.games.length + 1,
    blue: m.blue,
    red: teamFor(m, "red").id,
    selections: m.selections,
    winner,
    peak: m.peak,
  };
  return {
    ...m,
    teams: m.teams.map((t) => ({
      ...t,
      score: t.score + (t.id === winner ? 1 : 0),
    })) as [Team, Team],
    games: [...m.games, game],
    status: "finished",
    deadline: null,
  };
}
export function nextGame(m: Match): Match {
  if (m.status !== "finished") throw new Error("请先确认本局胜方");
  if (
    m.games.length >= m.bestOf ||
    m.teams.some((t) => t.score >= Math.ceil(m.bestOf / 2))
  )
    throw new Error("系列赛已结束，请新建系列赛");
  const finalSeven = m.version === 2 && m.bestOf === 7 && m.games.length === 6;
  if (
    finalSeven &&
    !m.teams.every(
      (t) =>
        t.score === 3 && m.games.filter((g) => g.winner === t.id).length === 3,
    )
  )
    throw new Error("BO7 第七局需前六局战成 3:3，请核对比分与赛果记录");
  return {
    ...m,
    selections: [],
    status: "draft",
    preview: null,
    revealed: false,
    peak: finalSeven,
    deadline: null,
    remaining: m.seconds,
  };
}
export function swapSides(m: Match): Match {
  if (m.selections.length || m.status !== "draft")
    throw new Error("换边需要在新一局选禁前进行");
  return { ...m, blue: teamFor(m, "red").id };
}
export function phaseLabel(m: Match) {
  if (m.status === "finished")
    return m.teams.some((t) => t.score >= Math.ceil(m.bestOf / 2))
      ? "系列赛结束"
      : "局间休息";
  if (m.status === "ready")
    return m.peak && !m.revealed ? "等待揭晓" : "阵容确认";
  const s = currentStep(m);
  return m.peak
    ? "巅峰对决 · 阵容提交"
    : `第${s.phase <= 2 ? "一" : "二"}轮 ${s.action === "ban" ? "禁用" : "选取"}`;
}
export function parseMatch(
  raw: unknown,
  heroes: Hero[],
  liveDisplay = false,
): Match {
  const m = raw as Match;
  const fail = () => {
    throw new Error("存档格式或比赛记录无效，未覆盖当前比赛");
  };
  if (
    !m ||
    ![1, 2].includes(m.version) ||
    !Array.isArray(m.teams) ||
    m.teams.length !== 2 ||
    !Array.isArray(m.games) ||
    !Array.isArray(m.selections)
  )
    return fail();
  if (
    typeof m.title !== "string" ||
    typeof m.subtitle !== "string" ||
    typeof m.global !== "boolean" ||
    typeof m.peak !== "boolean" ||
    typeof m.revealed !== "boolean"
  )
    return fail();
  if (
    !(m.version === 1 ? [1, 3, 5, 7, 9] : [3, 5, 7]).includes(m.bestOf) ||
    !(m.version === 1 ? [4, 5] : [5]).includes(m.bans) ||
    !Number.isInteger(m.seconds) ||
    m.seconds < 5 ||
    m.seconds > 300 ||
    !["draft", "ready", "finished"].includes(m.status)
  )
    return fail();
  if (m.teams[0].id === m.teams[1].id || !m.teams.some((t) => t.id === m.blue))
    return fail();
  if (
    !m.teams.every(
      (t) =>
        typeof t.id === "string" &&
        typeof t.name === "string" &&
        typeof t.logo === "string" &&
        (!t.logo || /^data:image\/(png|jpeg|webp);base64,/.test(t.logo)) &&
        Array.isArray(t.players) &&
        t.players.length === 5 &&
        t.players.every((p) => typeof p === "string") &&
        Number.isInteger(t.score) &&
        t.score >= 0 &&
        t.score <= 99,
    )
  )
    return fail();
  if (
    !m.audio ||
    !["bgm", "voice"].every(
      (k) =>
        Number.isFinite(m.audio[k as "bgm" | "voice"]) &&
        m.audio[k as "bgm" | "voice"] >= 0 &&
        m.audio[k as "bgm" | "voice"] <= 1,
    ) ||
    typeof m.audio.muted !== "boolean" ||
    !Number.isSafeInteger(m.audio.track) ||
    m.audio.track < 0 ||
    !Number.isSafeInteger(m.audio.replay) ||
    m.audio.replay < 0
  )
    return fail();
  const ids = new Set(heroes.map((h) => h.id));
  const verify = (list: Selection[], peak: boolean) => {
    const steps = sequence({ peak, bans: m.bans, version: m.version });
    if (list.length > steps.length) return false;
    return list.every(
      (s, i) =>
        ids.has(s.hero) &&
        s.side === steps[i].side &&
        s.action === steps[i].action &&
        s.phase === steps[i].phase &&
        !list
          .slice(0, i)
          .some((p) => p.hero === s.hero && (!peak || p.side === s.side)),
    );
  };
  if (
    !verify(m.selections, m.peak) ||
    (m.status === "draft") !== m.selections.length < sequence(m).length
  )
    return fail();
  for (const [i, g] of m.games.entries()) {
    if (
      !g ||
      g.number !== i + 1 ||
      !Array.isArray(g.selections) ||
      typeof g.peak !== "boolean" ||
      !m.teams.some((t) => t.id === g.blue) ||
      !m.teams.some((t) => t.id === g.red) ||
      g.blue === g.red ||
      ![g.blue, g.red].includes(g.winner) ||
      !verify(g.selections, g.peak) ||
      g.selections.length !==
        sequence({ peak: g.peak, bans: m.bans, version: m.version }).length
    )
      return fail();
    if (m.global && !g.peak)
      for (const s of g.selections.filter((s) => s.action === "pick")) {
        const id = s.side === "blue" ? g.blue : g.red;
        if (usedBy({ ...m, games: m.games.slice(0, i) }, id).includes(s.hero))
          return fail();
      }
  }
  if (m.status === "finished") {
    const g = m.games[m.games.length - 1];
    if (
      !g ||
      g.blue !== m.blue ||
      JSON.stringify(g.selections) !== JSON.stringify(m.selections)
    )
      return fail();
  } else if (m.global && !m.peak)
    for (const s of m.selections.filter((s) => s.action === "pick")) {
      if (usedBy(m, teamFor(m, s.side).id).includes(s.hero)) return fail();
    }
  if (
    !Number.isFinite(m.remaining) ||
    m.remaining < 0 ||
    m.remaining > 300 ||
    (m.deadline !== null && !Number.isFinite(m.deadline))
  )
    return fail();
  if (m.version === 2) {
    const round = m.status === "finished" ? m.games.length : m.games.length + 1;
    if (
      round > m.bestOf ||
      m.games.some((g) => g.peak !== (m.bestOf === 7 && g.number === 7)) ||
      m.peak !== (m.bestOf === 7 && round === 7)
    )
      return fail();
    if (
      m.peak &&
      !m.teams.every(
        (t) =>
          m.games.slice(0, 6).filter((g) => g.winner === t.id).length === 3,
      )
    )
      return fail();
  }
  return {
    ...m,
    ...(m.version === 1 && !m.games.length && !m.selections.length
      ? {
          version: 2 as const,
          bans: 5 as const,
          bestOf: [3, 5, 7].includes(m.bestOf) ? m.bestOf : 3,
          peak: false,
          revealed: false,
        }
      : {}),
    deadline: liveDisplay ? m.deadline : null,
    remaining: liveDisplay ? m.remaining : m.seconds,
    preview: null,
    revision: Date.now(),
    audio: { ...m.audio, replay: 0, track: 0 },
  };
}
