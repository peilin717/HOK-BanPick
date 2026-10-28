import { currentStep, teamFor, usedBy, phaseLabel } from "./match";
import type { Hero, Match, Team, Side } from "./match";
export function Logo({ team }: { team: Team }) {
  return team.logo ? (
    <img className="logo" src={team.logo} alt={`${team.name}队标`} />
  ) : (
    <div className="logo monogram">{team.name.slice(0, 1)}</div>
  );
}
export function Portrait({ hero }: { hero?: Hero }) {
  return hero ? (
    <img src={hero.portrait} alt={hero.name} loading="lazy" />
  ) : (
    <span>—</span>
  );
}
export default function Board({
  m,
  heroes,
  remaining,
  compact = false,
}: {
  m: Match;
  heroes: Hero[];
  remaining: number;
  compact?: boolean;
}) {
  const step = currentStep(m),
    hidden = m.peak && !m.revealed,
    finished = m.status === "finished";
  return (
    <section
      className={`board ${compact ? "compact" : ""}`}
      aria-label="比赛展示板"
    >
      <div className="board-lines" />
      <header className="broadcast-header">
        <div className="event-mark">
          H<span>荣耀</span>
        </div>
        <div>
          <div className="eyebrow">{m.subtitle}</div>
          <h1>{m.title}</h1>
        </div>
        <div className="broadcast-badge">
          {m.peak
            ? "FINAL SHOWDOWN"
            : m.global
              ? "GLOBAL DRAFT"
              : "STANDARD DRAFT"}
          <span>
            BO{m.bestOf} · GAME{" "}
            {Math.max(1, m.games.length + (finished ? 0 : 1))}
          </span>
        </div>
      </header>
      <div className="match-header">
        <div className="team-heading blue">
          <Logo team={teamFor(m, "blue")} />
          <div>
            <span>BLUE SIDE / 蓝方</span>
            <h2>{teamFor(m, "blue").name}</h2>
          </div>
        </div>
        <div className="score">
          <b>{teamFor(m, "blue").score}</b>
          <span>:</span>
          <b>{teamFor(m, "red").score}</b>
          <small>BO{m.bestOf}</small>
        </div>
        <div className="team-heading red">
          <div>
            <span>RED SIDE / 红方</span>
            <h2>{teamFor(m, "red").name}</h2>
          </div>
          <Logo team={teamFor(m, "red")} />
        </div>
      </div>
      <div className="phase-banner">
        <span className={`live-dot ${m.deadline ? "running" : ""}`} />
        <span>{phaseLabel(m)}</span>
        <span className="phase-team">
          {m.status === "draft" && !m.peak
            ? `${teamFor(m, step.side).name} · ${step.action === "ban" ? "禁用英雄" : "选择英雄"}`
            : ""}
        </span>
        <strong className={remaining <= 10 ? "urgent" : ""}>
          {m.status === "draft" ? String(remaining).padStart(2, "0") : "VS"}
        </strong>
      </div>
      <div className="lineups">
        {(["blue", "red"] as Side[]).map((side) => {
          const team = teamFor(m, side),
            picks = m.selections.filter(
              (s) => s.side === side && s.action === "pick",
            ),
            bans = m.selections.filter(
              (s) => s.side === side && s.action === "ban",
            );
          return (
            <div className={`lineup ${side}`} key={side}>
              <div className="pick-cards">
                {Array.from({ length: 5 }, (_, i) => {
                  const hero = !hidden
                      ? heroes.find((h) => h.id === picks[i]?.hero)
                      : undefined,
                    active =
                      !hidden &&
                      m.status === "draft" &&
                      step.side === side &&
                      step.action === "pick" &&
                      picks.length === i;
                  return (
                    <div
                      className={`pick-card ${hero ? "locked" : ""} ${active ? "active" : ""}`}
                      key={i}
                    >
                      {hero && (
                        <img
                          className="splash"
                          src={hero.splash || hero.portrait}
                          alt={hero.name}
                          onError={(e) => {
                            if (!e.currentTarget.src.endsWith(hero.portrait))
                              e.currentTarget.src = hero.portrait;
                          }}
                        />
                      )}
                      <div className="card-shade" />
                      <span className="pick-index">0{i + 1}</span>
                      {!hero && (
                        <div className="empty-pick">
                          <span>{hidden ? "◆" : active ? "＋" : "◇"}</span>
                          <small>
                            {hidden
                              ? "盲选阵容"
                              : active
                                ? "正在选择"
                                : "等待选取"}
                          </small>
                        </div>
                      )}
                      <div className="pick-caption">
                        <strong>{hero?.name || "—"}</strong>
                        <span>{team.players[i]}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="ban-row">
                <span>BAN</span>
                {Array.from({ length: m.peak ? 0 : m.bans }, (_, i) => (
                  <div className="ban-slot" key={i}>
                    <Portrait
                      hero={heroes.find((h) => h.id === bans[i]?.hero)}
                    />
                    {bans[i] && <i />}
                  </div>
                ))}
                {m.peak && <small>巅峰对决 · 不设禁用</small>}
              </div>
              <div className="used-row">
                <span>全局已用</span>
                {[...new Set(usedBy(m, team.id))].map((id) => (
                  <div title={heroes.find((h) => h.id === id)?.name} key={id}>
                    <Portrait hero={heroes.find((h) => h.id === id)} />
                  </div>
                ))}
                {!usedBy(m, team.id).length && <small>暂无历史用将</small>}
              </div>
            </div>
          );
        })}
      </div>
      <footer className="board-footer">
        <span>CLASS CHAMPIONSHIP</span>
        <span>
          {m.peak
            ? "巅峰对决 · 双方阵容同步揭晓"
            : m.global
              ? "全局 BP · 本队已使用英雄不可重复选择"
              : "标准 BP · 每局独立英雄池"}
        </span>
        <span>{finished ? "MATCH RESULT" : "DRAFT STAGE"}</span>
      </footer>
    </section>
  );
}
