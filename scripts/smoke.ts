// Runs the page script against stubbed DOM and Web Audio objects, clicks every play and mode control, and reports runtime errors.
import { readFileSync } from "node:fs";

const html = readFileSync(process.argv[2], "utf8");
const dataJson = html.split('<script id="diffony-data" type="application/json">')[1].split("</script>")[0];
const js = html.split("<script>")[1].split("</script>")[0];

const any = (): any =>
  new Proxy(function () {}, {
    get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : k === "width" || k === "height" ? 100 : any()),
    apply: () => any(),
  });

const listeners: Record<string, Function[]> = {};
const elements = new Map<string, any>();
function el(id: string): any {
  if (elements.has(id)) return elements.get(id);
  const e: any = {
    id, dataset: {}, hidden: false, value: "6", textContent: "", innerHTML: "", width: 0, height: 0,
    addEventListener(type: string, fn: Function) { (listeners[id + ":" + type] ??= []).push(fn); },
    querySelector: (sel: string) => el(id + " " + sel),
    querySelectorAll: () => [],
    setAttribute() {}, setPointerCapture() {},
    getBoundingClientRect: () => ({ width: 900, height: 300, left: 0, top: 0 }),
    getContext: () => any(),
  };
  if (id.endsWith("diffony-data")) e.textContent = dataJson;
  elements.set(id, e);
  return e;
}

let now = 0;
const param = () => ({ value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime(v: number) { if (!(v > 0)) throw new Error("exp ramp to " + v); }, setTargetAtTime() {}, cancelScheduledValues() {} });
const node = () => ({ connect() {}, disconnect() {}, start() {}, stop() {}, gain: param(), frequency: param(), detune: param(), Q: param(), pan: param(), playbackRate: param(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(), type: "", buffer: null, loop: false });
let nodes = 0;
class FakeAudioContext {
  sampleRate = 48000; state = "running";
  get currentTime() { return now; }
  resume() {}
  createBuffer(ch: number, n: number) { const data = Array.from({ length: ch }, () => new Float32Array(n)); return { getChannelData: (i: number) => data[i] }; }
  constructor() { for (const m of ["createGain", "createOscillator", "createBiquadFilter", "createStereoPanner", "createConvolver", "createBufferSource", "createDynamicsCompressor"]) (this as any)[m] = () => { nodes++; return node(); }; }
  destination = node();
}

const intervals: Function[] = [];
const g: any = globalThis;
g.window = { AudioContext: FakeAudioContext, matchMedia: () => ({ matches: false }), devicePixelRatio: 1 };
g.document = {
  getElementById: (id: string) => el(id),
  createElement: () => el("offscreen-" + Math.random()),
  fonts: { ready: Promise.resolve() },
};
g.ResizeObserver = class { observe() {} };
g.requestAnimationFrame = () => 0;
g.cancelAnimationFrame = () => {};
g.setInterval = (fn: Function) => { intervals.push(fn); return intervals.length; };
g.clearInterval = (i: number) => { intervals[i - 1] = () => {}; };
g.setTimeout = () => 0;

new Function(js)();

function fire(id: string, type: string, target?: any) {
  for (const fn of listeners[id + ":" + type] ?? []) fn({ target: { closest: () => target }, clientX: 450, pointerId: 1 });
}
function run(seconds: number) { for (let t = 0; t < seconds; t += 0.025) { now += 0.025; for (const f of [...intervals]) f(); } }
const btn = (data: any) => ({ dataset: data, setAttribute() {} });

// Tests plate: arranged, then raw, each dataset.
for (const mode of ["arranged", "raw"]) {
  fire("tests .mode", "click", btn({ mode }));
  for (const runKey of ["full", "red", "rerun"]) {
    fire("test-run", "click", btn({ run: runKey }));
    fire("tests .play", "click"); run(40); fire("tests .play", "click");
  }
}
console.log("tests ok, readout:", el("tests .readout").innerHTML.slice(0, 160));
fire("tests canvas", "pointerdown"); fire("tests canvas", "pointermove");

// History plate: arranged with every layer toggled, then raw.
el("history .speed").value = String(86400 * 96 / 60);
fire("history .play", "click"); run(30);
for (const layer of ["harmony", "bass", "rhythm", "melody", "reverb"]) fire("history .layers", "click", btn({ layer }));
run(10); fire("history .play", "click");
fire("history canvas", "pointerdown"); fire("history canvas", "pointermove");
console.log("history arranged ok, readout:", el("history .readout").innerHTML.slice(0, 160));
fire("history .mode", "click", btn({ mode: "raw" }));
el("history .speed").value = "259200";
fire("history .play", "click"); run(20); fire("history .play", "click");

// Command plate: instrument and clicks at every size and speed.
for (const mode of ["instrument", "clicks"]) {
  fire("cmd-mode", "click", btn({ mode }));
  for (const size of ["100", "1000", "10000"]) {
    fire("cmd-size", "click", btn({ size }));
    fire("cmd-play", "click"); run(2);
    for (const v of ["0", "3", "6"]) { el("cmd-speed").value = v; fire("cmd-speed", "input"); run(1); }
    fire("cmd-play", "click");
  }
}
console.log("commands ok, intervals:", el("cmd-intervals").innerHTML.replace(/<[^>]+>/g, "").slice(0, 200));
console.log("audio nodes created:", nodes);
