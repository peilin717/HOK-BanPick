import { useEffect, useRef, useState } from "react";
import {
  initialMatch,
  currentStep,
  teamFor,
  sequence,
  usedBy,
  unavailable,
  lockHero,
  undo,
  finishGame,
  nextGame,
  swapSides,
  phaseLabel,
  parseMatch,
} from "./match";
import type { Hero, Match, Team } from "./match";
import { AudioDesk, tracks, saveTrack, removeTrack } from "./audio";
import type { Track } from "./audio";
import Board, { Logo, Portrait } from "./Board";
import SplitConsole from "./SplitConsole";
import "./App.css";
const KEY = "hok-class-cup-v1",
  DISPLAY =
    location.pathname.replace(/\/$/, "") === "/display" ||
    new URLSearchParams(location.search).has("display"),
  CONTROL = location.pathname.replace(/\/$/, "") === "/control",
  EMBEDDED = new URLSearchParams(location.search).has("embedded");
const ROLES = ["全部", "对抗路", "中路", "发育路", "打野", "游走"];
function download(name: string, data: unknown) {
  const u = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}
export default function App() {
  return DISPLAY || CONTROL ? <MatchApp /> : <SplitConsole />;
}
function MatchApp() {
  const [heroes, setHeroes] = useState<Hero[]>([]),
    [date, setDate] = useState(""),
    [loadError, setLoadError] = useState(""),
    [ready, setReady] = useState(false);
  const [m, setM] = useState<Match>(initialMatch),
    state = useRef(m);
  state.current = m;
  const [now, setNow] = useState(Date.now()),
    [tab, setTab] = useState("heroes"),
    [query, setQuery] = useState(""),
    [role, setRole] = useState("全部");
  const [message, setMessage] = useState(""),
    [writer, setWriter] = useState(false),
    [audioStatus, setAudioStatus] = useState("声音尚未启用"),
    [audioEnabled, setAudioEnabled] = useState(false);
  const [library, setLibrary] = useState<Track[]>([]),
    [trackStage, setTrackStage] = useState("all"),
    [audioError, setAudioError] = useState("");
  const [confirmation, setConfirmation] = useState<{
    text: string;
    run: () => void;
  } | null>(null);
  const ask = (text: string, run: () => void) => setConfirmation({ text, run });
  const desk = useRef<AudioDesk | null>(null),
    releaseLock = useRef<() => void>(),
    releaseAudio = useRef<() => void>();
  const remaining = m.deadline
    ? Math.max(0, Math.ceil((m.deadline - now) / 1000))
    : m.remaining;
  function update(fn: (prev: Match) => Match) {
    if (!writer) {
      setMessage("另一个裁判窗口正在控制比赛，请关闭该窗口");
      return;
    }
    try {
      const next = { ...fn(state.current), revision: Date.now() };
      localStorage.setItem(KEY, JSON.stringify(next));
      state.current = next;
      setM(next);
      setMessage("");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "操作失败");
    }
  }
  useEffect(() => {
    let cancelled = false;
    fetch("/data/heroes.json")
      .then((r) => {
        if (!r.ok) throw Error("英雄资源尚未就绪，请先执行资源同步");
        return r.json();
      })
      .then((c) => {
        if (cancelled) return;
        const list: Hero[] = c.heroes;
        setHeroes(list);
        setDate(c.updatedAt || "");
        const raw = localStorage.getItem(KEY);
        if (raw) {
          try {
            const restored = parseMatch(JSON.parse(raw), list, DISPLAY);
            setM(restored);
            state.current = restored;
          } catch {
            setMessage("已有存档未通过校验，原始数据已保留，请先导出检查");
          }
        }
        setReady(true);
      })
      .catch((e) => setLoadError(e.message));
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (DISPLAY) return;
    let stopped = false;
    if (!navigator.locks) {
      setMessage("请使用支持控制台互斥锁的新版 Chrome 或 Edge");
      return;
    }
    void navigator.locks.request("hok-bp-controller", async () => {
      if (stopped) return;
      setWriter(true);
      await new Promise<void>((r) => {
        releaseLock.current = r;
      });
    });
    return () => {
      stopped = true;
      releaseLock.current?.();
    };
  }, []);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const listen = (e: StorageEvent) => {
      if (e.key === KEY && e.newValue) {
        try {
          const next = JSON.parse(e.newValue) as Match;
          setM(next);
          state.current = next;
        } catch {
          setMessage("同步消息损坏，请检查控制台");
        }
      }
    };
    window.addEventListener("storage", listen);
    return () => window.removeEventListener("storage", listen);
  }, []);
  useEffect(() => {
    if (!ready || !writer) return;
    const raw = localStorage.getItem(KEY);
    if (raw) {
      try {
        const restored = parseMatch(JSON.parse(raw), heroes);
        localStorage.setItem(KEY, JSON.stringify(restored));
        setM(restored);
        state.current = restored;
      } catch {
        /* Do not overwrite invalid saved data. */
      }
    }
  }, [ready, writer, heroes]);
  useEffect(() => {
    desk.current?.sync(m, heroes);
  }, [m, heroes]);
  useEffect(
    () => () => {
      desk.current?.dispose();
      releaseAudio.current?.();
    },
    [],
  );
  useEffect(() => {
    if (tab === "audio")
      void tracks()
        .then(setLibrary)
        .catch(() => setAudioError("媒体存储不可用"));
  }, [tab]);
  async function enableAudio() {
    if (!navigator.locks) return;
    if (desk.current) {
      await desk.current.enable(state.current);
      setAudioEnabled(true);
      return;
    }
    void navigator.locks.request(
      "hok-bp-audio",
      { ifAvailable: true },
      async (lock) => {
        if (!lock) {
          setAudioStatus("另一窗口正在播放，请先在那里关闭声音");
          return;
        }
        const a = new AudioDesk(setAudioStatus);
        desk.current = a;
        a.prime(state.current);
        await a.enable(state.current);
        setAudioEnabled(true);
        await new Promise<void>((r) => {
          releaseAudio.current = r;
        });
        a.dispose();
        desk.current = null;
        setAudioEnabled(false);
      },
    );
  }
  const setAudio = (patch: Partial<Match["audio"]>) =>
    update((p) => ({ ...p, audio: { ...p.audio, ...patch } }));
  const editTeam = (id: string, patch: Partial<Team>) =>
    update((p) => ({
      ...p,
      teams: p.teams.map((t) => (t.id === id ? { ...t, ...patch } : t)) as [
        Team,
        Team,
      ],
    }));
  async function importLogo(file: File, id: string) {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      setMessage("请选择 PNG、JPG 或 WebP 队标");
      return;
    }
    try {
      const b = await createImageBitmap(file),
        c = document.createElement("canvas");
      c.width = 256;
      c.height = 256;
      const scale = Math.min(256 / b.width, 256 / b.height);
      c.getContext("2d")!.drawImage(
        b,
        (256 - b.width * scale) / 2,
        (256 - b.height * scale) / 2,
        b.width * scale,
        b.height * scale,
      );
      b.close();
      editTeam(id, { logo: c.toDataURL("image/png") });
    } catch {
      setMessage("图片读取失败");
    }
  }
  if (loadError)
    return (
      <main className="loading">
        <h1>英雄资料加载失败</h1>
        <p>{loadError}</p>
        <button onClick={() => location.reload()}>重试</button>
      </main>
    );
  if (!ready)
    return (
      <main className="loading">
        <div className="event-mark">H</div>
        <h1>正在载入比赛资源</h1>
      </main>
    );
  if (DISPLAY)
    return (
      <main className="display-page">
        <Board m={m} heroes={heroes} remaining={remaining} />
        <div className="display-tools">
          <button
            onClick={() => void document.documentElement.requestFullscreen()}
          >
            全屏展示
          </button>
          <button
            onClick={() =>
              audioEnabled ? releaseAudio.current?.() : void enableAudio()
            }
          >
            {audioEnabled ? "关闭此窗口声音" : "启用此窗口声音"}
          </button>
          <span>{audioStatus}</span>
        </div>
      </main>
    );
  const step = currentStep(m),
    chosen = heroes.find((h) => h.id === m.preview),
    visible = heroes.filter(
      (h) =>
        (role === "全部" || h.roles.includes(role)) &&
        (!query || h.name.includes(query) || String(h.id).includes(query)),
    );
  return (
    <main className={`control-page ${EMBEDDED ? "embedded-control" : ""}`}>
      <aside className="sidebar">
        <div className="brand">
          <div className="event-mark">H</div>
          <span>
            荣耀赛事台<small>DRAFT CONTROL</small>
          </span>
        </div>
        <div className="sidebar-label">比赛工作台</div>
        <nav>
          {[
            ["heroes", "◈", "选禁控制"],
            ["teams", "⚑", "队伍与赛制"],
            ["history", "▦", "全局用将"],
            ["audio", "♫", "音乐与语音"],
            ["resources", "◉", "资源状态"],
          ].map(([id, icon, label]) => (
            <button
              aria-label={label}
              className={tab === id ? "selected" : ""}
              key={id}
              onClick={() => setTab(id)}
            >
              <span>{icon}</span>
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="status-dot" />
          本地比赛工作区<small>{heroes.length} 位英雄 · 国服资料</small>
          <small>{writer ? "裁判控制已连接" : "等待取得裁判控制权"}</small>
        </div>
      </aside>
      <div className="workspace">
        <header className="toolbar">
          <div>
            <span className="eyebrow">赛事控制中心</span>
            <h1>{m.title}</h1>
          </div>
          <div className="toolbar-actions">
            <span className="save-status">● 自动保存</span>
            <button onClick={() => download(`BP-存档-${Date.now()}.json`, m)}>
              导出存档
            </button>
            <a className="button primary" href="/display" target="hok-display">
              打开大屏 ↗
            </a>
          </div>
        </header>
        {message && (
          <div className="notice" role="alert">
            {message}
            <button onClick={() => setMessage("")}>×</button>
          </div>
        )}
        {!writer && (
          <div className="notice">此窗口只读：等待其他裁判窗口关闭。</div>
        )}
        {m.version === 1 && (
          <div className="notice">
            这是旧版比赛存档，保留原选禁顺序。请导出备份后新建系列赛，应用新版
            2＋3 Ban 规则。
          </div>
        )}
        <section className="operation-bar">
          <div className="round">
            <span>当前进度</span>
            <strong>{phaseLabel(m)}</strong>
            <small>
              {m.status === "draft"
                ? `${teamFor(m, step.side).name} · 第 ${m.selections.length + 1} / ${sequence(m).length} 手`
                : "双方阵容已确认"}
            </small>
          </div>
          <div className="timer">
            <strong className={remaining <= 10 ? "urgent" : ""}>
              {String(remaining).padStart(2, "0")}
            </strong>
            <button
              disabled={m.status !== "draft"}
              onClick={() =>
                update((p) => ({
                  ...p,
                  remaining: p.deadline
                    ? Math.max(0, Math.ceil((p.deadline - Date.now()) / 1000))
                    : p.remaining,
                  deadline: p.deadline ? null : Date.now() + p.remaining * 1000,
                }))
              }
            >
              {m.deadline ? "暂停计时" : "开始计时"}
            </button>
            <button
              onClick={() =>
                update((p) => ({ ...p, remaining: p.seconds, deadline: null }))
              }
            >
              重置
            </button>
          </div>
          <div className="round-actions">
            <button
              disabled={!m.selections.length || m.status === "finished"}
              onClick={() => update(undo)}
            >
              ↶ 撤销一手
            </button>
            <button
              disabled={!!m.selections.length || m.status !== "draft"}
              onClick={() => update(swapSides)}
            >
              ⇄ 交换红蓝方
            </button>
            {m.status === "ready" && m.peak && !m.revealed && (
              <button
                className="primary"
                onClick={() => update((p) => ({ ...p, revealed: true }))}
              >
                揭晓双方阵容
              </button>
            )}
            {m.status === "ready" &&
              (!m.peak || m.revealed) &&
              m.teams.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    ask(
                      `确认本局胜方为「${t.name}」？将记录全局用将并增加比分。`,
                      () => update((p) => finishGame(p, t.id)),
                    );
                  }}
                >
                  {t.name} 获胜
                </button>
              ))}
            {m.status === "finished" && (
              <button className="primary" onClick={() => update(nextGame)}>
                开始下一局 →
              </button>
            )}
          </div>
        </section>
        {tab === "heroes" && (
          <section className="panel hero-panel">
            <div className="panel-heading">
              <div>
                <h2>
                  英雄池 <span>{visible.length}</span>
                </h2>
                <p>点击预选，确认后锁定。本队全局已用英雄自动禁选。</p>
              </div>
              <input
                aria-label="搜索英雄"
                placeholder="搜索英雄名称 / ID"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="filters">
              {ROLES.map((r) => (
                <button
                  className={role === r ? "active" : ""}
                  key={r}
                  onClick={() => setRole(r)}
                >
                  {r}
                </button>
              ))}
            </div>
            <div className="hero-grid">
              {visible.map((h) => {
                const reason = unavailable(m, h.id);
                return (
                  <button
                    title={reason || h.name}
                    aria-label={`预选${h.name}`}
                    className={`hero-tile ${reason ? "unavailable" : ""} ${m.preview === h.id ? "chosen" : ""}`}
                    key={h.id}
                    disabled={!!reason || !writer}
                    onClick={() => update((p) => ({ ...p, preview: h.id }))}
                  >
                    <Portrait hero={h} />
                    <strong>{h.name}</strong>
                    {reason &&
                      (m.selections.some((s) => s.hero === h.id) ||
                        reason === "本队全局已使用") && (
                        <span className="hero-lock">
                          {reason === "本队全局已使用" ? "全局已用" : "已选禁"}
                        </span>
                      )}
                  </button>
                );
              })}
            </div>
            <div className="confirm-bar">
              <div>
                {chosen ? (
                  <>
                    <Portrait hero={chosen} />
                    <span>
                      <strong>{chosen.name}</strong>
                      <small>{chosen.roles.join(" / ")}</small>
                    </span>
                  </>
                ) : (
                  <span>从英雄池选择一位英雄</span>
                )}
              </div>
              <button
                className="primary lock"
                disabled={!chosen || !!unavailable(m, chosen.id) || !writer}
                onClick={() => chosen && update((p) => lockHero(p, chosen.id))}
              >
                {chosen
                  ? `确认${step?.action === "ban" ? "禁用" : "锁定"} · ${chosen.name}`
                  : "等待预选"}{" "}
                →
              </button>
            </div>
          </section>
        )}
        {tab === "teams" && (
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>队伍与赛制</h2>
                <p>队名、Logo 和比分可随时调整；赛制在系列赛开始前配置。</p>
              </div>
            </div>
            <div className="settings-grid">
              <label>
                赛事名称
                <input
                  value={m.title}
                  maxLength={32}
                  onChange={(e) =>
                    update((p) => ({ ...p, title: e.target.value }))
                  }
                />
              </label>
              <label>
                副标题
                <input
                  value={m.subtitle}
                  maxLength={60}
                  onChange={(e) =>
                    update((p) => ({ ...p, subtitle: e.target.value }))
                  }
                />
              </label>
              <label>
                系列赛
                <select
                  value={m.bestOf}
                  disabled={!!m.selections.length || !!m.games.length}
                  onChange={(e) =>
                    update((p) => ({ ...p, bestOf: Number(e.target.value) }))
                  }
                >
                  {(m.version === 1 ? [1, 3, 5, 7, 9] : [3, 5, 7]).map((n) => (
                    <option key={n} value={n}>
                      BO{n}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                每方 Ban 位
                <input
                  readOnly
                  value={
                    m.version === 1
                      ? `${m.bans} Ban（旧版存档）`
                      : "5 Ban · 第一轮 2 位，第二轮 3 位"
                  }
                />
              </label>
              <label>
                每手倒计时
                <select
                  value={m.seconds}
                  onChange={(e) =>
                    update((p) => ({
                      ...p,
                      seconds: Number(e.target.value),
                      remaining: Number(e.target.value),
                      deadline: null,
                    }))
                  }
                >
                  {[15, 30, 45, 60, 90, 120].map((n) => (
                    <option key={n} value={n}>
                      {n} 秒
                    </option>
                  ))}
                </select>
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={m.global}
                  disabled={!!m.games.length || !!m.selections.length}
                  onChange={(e) =>
                    update((p) => ({ ...p, global: e.target.checked }))
                  }
                />
                启用全局 BP
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={m.peak}
                  disabled={
                    m.version === 2 ||
                    !!m.selections.length ||
                    m.status !== "draft"
                  }
                  onChange={(e) =>
                    update((p) => ({
                      ...p,
                      peak: e.target.checked,
                      preview: null,
                      revealed: false,
                    }))
                  }
                />
                {m.version === 2
                  ? "BO7 第七局自动巅峰对决（3:3 后触发）"
                  : "本局为巅峰对决（盲选，可镜像英雄）"}
              </label>
            </div>
            <div className="team-settings">
              {m.teams.map((t) => (
                <div key={t.id}>
                  <div className="team-settings-heading">
                    <Logo team={t} />
                    <label className="button">
                      上传队标
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        hidden
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void importLogo(f, t.id);
                        }}
                      />
                    </label>
                    <button onClick={() => editTeam(t.id, { logo: "" })}>
                      清除
                    </button>
                  </div>
                  <label>
                    队名
                    <input
                      value={t.name}
                      maxLength={14}
                      onChange={(e) => editTeam(t.id, { name: e.target.value })}
                    />
                  </label>
                  <label>
                    比分
                    <input
                      type="number"
                      min={0}
                      max={99}
                      value={t.score}
                      onChange={(e) => {
                        const score = Number(e.target.value);
                        if (
                          Number.isInteger(score) &&
                          score >= 0 &&
                          score <= 99
                        )
                          editTeam(t.id, { score });
                      }}
                    />
                  </label>
                  <div className="players">
                    {t.players.map((p, i) => (
                      <label key={i}>
                        选手 {i + 1}
                        <input
                          value={p}
                          maxLength={12}
                          onChange={(e) =>
                            editTeam(t.id, {
                              players: t.players.map((v, j) =>
                                i === j ? e.target.value : v,
                              ),
                            })
                          }
                        />
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="danger-zone">
              <label className="button">
                导入比赛存档
                <input
                  type="file"
                  accept="application/json,.json"
                  hidden
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      const restored = parseMatch(
                        JSON.parse(await file.text()),
                        heroes,
                      );
                      ask(
                        "导入将替换当前比赛，请确认已导出需要保留的存档。",
                        () => update(() => restored),
                      );
                    } catch (err) {
                      setMessage(
                        err instanceof Error ? err.message : String(err),
                      );
                    }
                    e.target.value = "";
                  }}
                />
              </label>
              <button
                onClick={() => {
                  const raw = localStorage.getItem(KEY);
                  if (raw) {
                    try {
                      download("BP-原始存档.json", JSON.parse(raw));
                    } catch {
                      download("BP-损坏存档.json", { raw });
                    }
                  }
                }}
              >
                导出原始存档
              </button>
              <button
                className="danger"
                onClick={() => {
                  ask("新建系列赛将清空比分和全局用将。是否继续？", () =>
                    update((p) => ({
                      ...initialMatch(),
                      title: p.title,
                      subtitle: p.subtitle,
                      bestOf: [3, 5, 7].includes(p.bestOf) ? p.bestOf : 3,
                      bans: 5,
                      global: p.global,
                      teams: p.teams.map((t) => ({ ...t, score: 0 })) as [
                        Team,
                        Team,
                      ],
                      audio: p.audio,
                    })),
                  );
                }}
              >
                新建系列赛
              </button>
            </div>
          </section>
        )}
        {tab === "history" && (
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>全局用将</h2>
                <p>已用英雄随队伍保留，交换红蓝方不清空。Ban 不跨局累计。</p>
              </div>
            </div>
            <div className="global-teams">
              {m.teams.map((t) => (
                <div key={t.id}>
                  <h3>
                    {t.name} <small>{usedBy(m, t.id).length} 次选取</small>
                  </h3>
                  <div className="history-heroes">
                    {usedBy(m, t.id).map((id, i) => (
                      <div key={`${id}-${i}`}>
                        <Portrait hero={heroes.find((h) => h.id === id)} />
                        <span>{heroes.find((h) => h.id === id)?.name}</span>
                      </div>
                    ))}
                    {!usedBy(m, t.id).length && <p>完成第一局后显示已用英雄</p>}
                  </div>
                </div>
              ))}
            </div>
            {m.games.map((g) => (
              <div className="game-record" key={g.number}>
                <strong>GAME {g.number}</strong>
                <span>{m.teams.find((t) => t.id === g.winner)?.name} 获胜</span>
                <span>
                  {g.peak ? "巅峰对决" : "标准选禁"} · {g.selections.length} 手
                </span>
              </div>
            ))}
          </section>
        )}
        {tab === "audio" && (
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>音乐与英雄语音</h2>
                <p>指定主曲：Know My Name · 伴奏版。所有阶段可共用一首。</p>
              </div>
              <button onClick={() => setAudio({ muted: !m.audio.muted })}>
                {m.audio.muted ? "恢复声音" : "紧急静音"}
              </button>
            </div>
            <div className="audio-controls">
              <label>
                BGM 音量
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={m.audio.bgm}
                  onChange={(e) => setAudio({ bgm: Number(e.target.value) })}
                />
              </label>
              <label>
                英雄语音音量
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={m.audio.voice}
                  onChange={(e) => setAudio({ voice: Number(e.target.value) })}
                />
              </label>
              <button onClick={() => setAudio({ track: m.audio.track + 1 })}>
                随机下一首
              </button>
              <button onClick={() => setAudio({ replay: m.audio.replay + 1 })}>
                重播最近英雄语音
              </button>
            </div>
            <div className="notice subtle">
              在大屏窗口点击「启用此窗口声音」。同一时间仅允许一个窗口播放，播放英雄语音时保持
              BGM。
            </div>
            <div className="media-import">
              <select
                aria-label="音乐阶段"
                value={trackStage}
                onChange={(e) => setTrackStage(e.target.value)}
              >
                {[
                  ["all", "所有阶段"],
                  ["early", "第一轮 BP"],
                  ["late", "第二轮 BP"],
                  ["ready", "阵容确认"],
                  ["peak", "巅峰对决"],
                  ["break", "局间休息"],
                ].map(([v, n]) => (
                  <option key={v} value={v}>
                    {n}
                  </option>
                ))}
              </select>
              <label className="button primary">
                导入伴奏 / BGM
                <input
                  type="file"
                  accept="audio/*"
                  multiple
                  hidden
                  onChange={async (e) => {
                    try {
                      for (const f of Array.from(e.target.files || [])) {
                        if (!f.type.startsWith("audio/"))
                          throw Error("请选择音频文件");
                        if (f.size > 100 * 1024 * 1024)
                          throw Error("单个音频请小于 100MB");
                        await saveTrack(f, trackStage);
                      }
                      setLibrary(await tracks());
                      setAudio({ track: state.current.audio.track + 1 });
                      setAudioError("");
                    } catch (err) {
                      setAudioError(String(err));
                    }
                    e.target.value = "";
                  }}
                />
              </label>
              <button
                onClick={() =>
                  audioEnabled ? releaseAudio.current?.() : void enableAudio()
                }
              >
                {audioEnabled ? "停止此窗口声音" : "在此窗口试音"}
              </button>
              <span>{audioStatus}</span>
            </div>
            {audioError && <p role="alert">{audioError}</p>}
            {!library.length && (
              <div className="empty-state">
                <span>♫</span>
                <h3>等待接入指定伴奏</h3>
                <p>尚未导入音频，不会用其他音乐替代 Know My Name。</p>
              </div>
            )}
            {library.map((t) => (
              <div className="track-row" key={t.id}>
                <span>♫</span>
                <strong>{t.name}</strong>
                <small>{t.builtin ? "内置伴奏" : t.stage}</small>
                {t.sourceUrl && (
                  <a href={t.sourceUrl} target="_blank" rel="noreferrer">
                    查看来源 ↗
                  </a>
                )}
                {!t.builtin && (
                  <button
                    onClick={async () => {
                      await removeTrack(t.id);
                      setLibrary(await tracks());
                      setAudio({ track: state.current.audio.track + 1 });
                    }}
                  >
                    移除
                  </button>
                )}
              </div>
            ))}
          </section>
        )}
        {tab === "resources" && (
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>国服资源状态</h2>
                <p>数据来自王者荣耀官网；缺失语音不会影响选禁。</p>
              </div>
            </div>
            <div className="resource-stats">
              <div>
                <b>{heroes.length}</b>
                <span>国服英雄条目</span>
              </div>
              <div>
                <b>{heroes.filter((h) => h.voice).length}</b>
                <span>已配置英雄语音</span>
              </div>
              <div>
                <b>{heroes.filter((h) => !h.voice).length}</b>
                <span>待补充语音</span>
              </div>
            </div>
            <p>
              同步时间：
              {date
                ? new Date(date).toLocaleString("zh-CN", {
                    timeZone: "Asia/Shanghai",
                    hour12: false,
                  }) + "（北京时间）"
                : "未记录"}
            </p>
            <p>
              无语音英雄：
              {heroes
                .filter((h) => !h.voice)
                .map((h) => h.name)
                .join("、") || "无"}
            </p>
            <a
              href="https://pvp.qq.com/web201605/herolist.shtml"
              target="_blank"
              rel="noreferrer"
            >
              查看官方英雄资料 ↗
            </a>
          </section>
        )}
        <footer className="control-footer">
          荣耀赛事台 · 本地版 <span>基于 HOK_Ban_Pick · MIT</span>
        </footer>
      </div>
      {confirmation && (
        <div className="confirm-dialog-overlay">
          <section
            role="dialog"
            aria-modal="true"
            aria-label="裁判操作确认"
            className="confirm-dialog"
          >
            <h2>确认操作</h2>
            <p>{confirmation.text}</p>
            <div>
              <button autoFocus onClick={() => setConfirmation(null)}>
                取消
              </button>
              <button
                className="primary"
                onClick={() => {
                  const run = confirmation.run;
                  setConfirmation(null);
                  run();
                }}
              >
                确认继续
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
