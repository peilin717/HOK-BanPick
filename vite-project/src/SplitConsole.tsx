import { useState } from "react";

// The two panes are separate browsing contexts. Controller scroll, dialogs and
// navigation never resize or navigate the on-air document.
export default function SplitConsole() {
  const [ratio, setRatio] = useState(58);
  return (
    <main
      className="split-console"
      style={{
        gridTemplateRows: `44px minmax(0, ${ratio}fr) 30px minmax(0, ${100 - ratio}fr)`,
      }}
    >
      <header className="split-toolbar">
        <strong>
          荣耀赛事台 <span>主屏 / 裁判分离</span>
        </strong>
        <label>
          主屏占比{" "}
          <input
            aria-label="主屏占比"
            type="range"
            min="35"
            max="70"
            value={ratio}
            onChange={(e) => setRatio(Number(e.target.value))}
          />
        </label>
        <a className="button primary" href="/display" target="hok-display">
          独立投屏 ↗
        </a>
        <a className="button" href="/control" target="hok-control">
          独立裁判台 ↗
        </a>
      </header>
      <iframe
        title="投屏主屏"
        className="main-screen-frame"
        src="/display?embedded=1"
        allow="autoplay; fullscreen"
        allowFullScreen
      />
      <div className="split-divider">
        <span>↑ 主屏画面保持独立</span>
        <span>↓ 下方裁判操作 · 仅比赛状态同步</span>
      </div>
      <iframe
        title="裁判控制界面"
        className="referee-frame"
        src="/control?embedded=1"
      />
    </main>
  );
}
