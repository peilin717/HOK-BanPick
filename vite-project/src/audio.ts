import type { Hero, Match } from "./match";

export interface Track {
  id: string;
  name: string;
  stage: string;
  blob?: Blob;
  url?: string;
  builtin?: boolean;
  sourceUrl?: string;
}
const db = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open("hok-bp-media", 1);
    r.onupgradeneeded = () =>
      r.result.createObjectStore("tracks", { keyPath: "id" });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
export async function tracks(): Promise<Track[]> {
  const d = await db();
  const local = await new Promise<Track[]>((resolve, reject) => {
    const r = d.transaction("tracks").objectStore("tracks").getAll();
    r.onsuccess = () => {
      resolve(r.result);
      d.close();
    };
    r.onerror = () => {
      reject(r.error);
      d.close();
    };
  });
  let bundled: Track[] = [];
  try {
    const r = await fetch("/data/bgm.json");
    if (r.ok) {
      const manifest = await r.json();
      bundled = (manifest.tracks || []).map((t: Track) => ({
        ...t,
        builtin: true,
      }));
    }
  } catch {
    /* Local imports remain usable without bundled media. */
  }
  return [...bundled, ...local];
}
export async function saveTrack(file: File, stage: string) {
  const d = await db();
  return new Promise<void>((resolve, reject) => {
    const tx = d.transaction("tracks", "readwrite");
    tx.objectStore("tracks").put({
      id: crypto.randomUUID(),
      name: file.name,
      stage,
      blob: file,
    });
    tx.oncomplete = () => {
      d.close();
      resolve();
    };
    tx.onerror = () => {
      d.close();
      reject(tx.error);
    };
  });
}
export async function removeTrack(id: string) {
  const d = await db();
  return new Promise<void>((resolve, reject) => {
    const tx = d.transaction("tracks", "readwrite");
    tx.objectStore("tracks").delete(id);
    tx.oncomplete = () => {
      d.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}
export function audioStage(m: Match) {
  if (m.status === "finished") return "break";
  if (m.status === "ready") return "ready";
  if (m.peak) return "peak";
  return m.selections.length < (m.version === 1 && m.bans === 5 ? 12 : 10)
    ? "early"
    : "late";
}
export class AudioDesk {
  bgm = new Audio();
  voice = new Audio();
  enabled = false;
  disposed = false;
  state: Match | null = null;
  queue: Hero[] = [];
  speaking = false;
  stage = "";
  current = "";
  pool: Track[] = [];
  url = "";
  generation = 0;
  replay = -1;
  switchCount = -1;
  lastSelectionCount = 0;
  bag: string[] = [];
  report: (s: string) => void;
  constructor(report: (s: string) => void) {
    this.report = report;
    this.bgm.loop = false;
    this.bgm.onended = () => void this.choose();
    this.voice.onended = () => this.nextVoice();
    this.voice.onerror = () => {
      this.report("该英雄语音无法播放，继续 BP");
      this.nextVoice();
    };
  }
  async enable(m: Match) {
    this.enabled = true;
    this.state = m;
    // A play attempt directly inside the user's gesture unlocks media playback.
    this.bgm.muted = m.audio.muted;
    await this.refresh();
    await this.choose();
  }
  async refresh() {
    this.pool = await tracks();
    this.bag = [];
  }
  volume() {
    if (!this.state) return;
    this.bgm.muted = this.state.audio.muted;
    this.voice.muted = this.state.audio.muted;
    this.bgm.volume = this.state.audio.bgm;
    this.voice.volume = this.state.audio.voice;
  }
  async choose() {
    if (!this.enabled || this.disposed || !this.state) return;
    const desired = audioStage(this.state);
    this.stage = desired;
    let pool = this.pool.filter((t) => t.stage === desired);
    if (!pool.length) pool = this.pool.filter((t) => t.stage === "all");
    if (!pool.length) {
      this.bgm.pause();
      this.current = "";
      this.report("此阶段未配置 BGM · 请在控制台导入指定伴奏");
      return;
    }
    if (
      !this.bag.length ||
      this.bag.some((id) => !pool.some((t) => t.id === id))
    ) {
      this.bag = pool.map((t) => t.id);
      for (let i = this.bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
      }
      if (this.bag.length > 1 && this.bag[0] === this.current)
        this.bag.reverse();
    }
    const track = pool.find((t) => t.id === this.bag.shift())!;
    this.current = track.id;
    const generation = ++this.generation;
    // Short fade-out avoids clicks when advancing phases.
    for (let i = 0; i < 8; i++) {
      if (this.disposed || generation !== this.generation) return;
      this.bgm.volume *= 0.6;
      await new Promise((r) => setTimeout(r, 40));
    }
    this.bgm.pause();
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = track.blob ? URL.createObjectURL(track.blob) : "";
    this.bgm.src = this.url || track.url || "";
    this.volume();
    try {
      await this.bgm.play();
      this.report(`正在播放：${track.name}`);
    } catch {
      this.report("音乐播放被阻止或格式不受支持，请点击启用声音重试");
    }
  }
  sync(m: Match, heroes: Hero[]) {
    const previous = this.state;
    this.state = m;
    this.volume();
    if (!this.enabled) return;
    if (m.selections.length < this.lastSelectionCount) {
      this.queue = [];
      this.voice.pause();
      this.speaking = false;
      this.volume();
    }
    const from = this.lastSelectionCount;
    this.lastSelectionCount = m.selections.length;
    if (this.switchCount !== m.audio.track) {
      this.switchCount = m.audio.track;
      void this.refresh().then(() => this.choose());
    } else if (this.stage !== audioStage(m)) {
      void this.choose();
    }
    // No voice leaks from blind peak selection, even when controller previews heroes.
    if (m.peak && !m.revealed) return;
    const newSelections =
      m.peak && m.revealed && !previous?.revealed
        ? m.selections
        : m.selections.slice(from);
    for (const s of newSelections)
      if (s.action === "pick") {
        const h = heroes.find((h) => h.id === s.hero);
        if (h) this.queue.push(h);
      }
    if (this.replay !== m.audio.replay) {
      if (this.replay >= 0) {
        const s = [...m.selections].reverse().find((s) => s.action === "pick");
        const h = heroes.find((h) => h.id === s?.hero);
        if (h) this.queue.push(h);
      }
      this.replay = m.audio.replay;
    }
    if (!this.speaking) this.nextVoice();
  }
  prime(m: Match) {
    this.lastSelectionCount = m.selections.length;
    this.replay = m.audio.replay;
    this.switchCount = m.audio.track;
  }
  nextVoice() {
    this.speaking = false;
    const h = this.queue.shift();
    if (!h) {
      this.volume();
      return;
    }
    if (!h.voice) {
      this.report(`${h.name} 暂无已核验语音`);
      this.nextVoice();
      return;
    }
    this.speaking = true;
    this.voice.src = h.voice;
    this.volume();
    void this.voice.play().catch(() => {
      this.report("语音播放失败，请重新启用声音");
      this.nextVoice();
    });
  }
  dispose() {
    this.disposed = true;
    this.generation++;
    this.bgm.pause();
    this.voice.pause();
    this.queue = [];
    this.bgm.onended = null;
    this.voice.onended = null;
    this.voice.onerror = null;
    if (this.url) URL.revokeObjectURL(this.url);
  }
}
