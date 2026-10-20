import { build } from "esbuild";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const draft = process.argv.includes("--draft");
await mkdir(path.join(root, ".cache/fonts"), { recursive: true });
let timeline;
try {
  timeline = JSON.parse(await readFile("output/timeline.json", "utf8"));
} catch (error) {
  if (!draft)
    throw new Error(
      "Generate the measured narration with pnpm audio before building the final film.",
      { cause: error },
    );
  const spec = JSON.parse(await readFile("film.json", "utf8"));
  let start = 0;
  timeline = {
    ...spec,
    duration: 0,
    scenes: spec.scenes.map((s) => {
      const narrationDuration = s.narration.split(/\s+/).length / 2.6;
      const duration = Math.ceil((narrationDuration + 3.2) * 30) / 30;
      const scene = {
        ...s,
        start,
        duration,
        narrationStart: start + 1.1,
        narrationDuration,
      };
      start += duration;
      return scene;
    }),
  };
  timeline.duration = start;
}
const fonts = [
  [
    "Sora",
    400,
    "https://fonts.gstatic.com/s/sora/v17/xMQOuFFYT72X5wkB_18qmnndmSdSnn-K.ttf",
  ],
  [
    "Sora",
    500,
    "https://fonts.gstatic.com/s/sora/v17/xMQOuFFYT72X5wkB_18qmnndmSdgnn-K.ttf",
  ],
  [
    "Sora",
    600,
    "https://fonts.gstatic.com/s/sora/v17/xMQOuFFYT72X5wkB_18qmnndmSeMmX-K.ttf",
  ],
  [
    "Sora",
    700,
    "https://fonts.gstatic.com/s/sora/v17/xMQOuFFYT72X5wkB_18qmnndmSe1mX-K.ttf",
  ],
  [
    "IBM Plex Mono",
    400,
    "https://fonts.gstatic.com/s/ibmplexmono/v20/-F63fjptAgt5VM-kVkqdyU8n5ig.ttf",
  ],
  [
    "IBM Plex Mono",
    500,
    "https://fonts.gstatic.com/s/ibmplexmono/v20/-F6qfjptAgt5VM-kVkqdyU8n3twJ8lc.ttf",
  ],
];
const embedded = await Promise.all(
  fonts.map(async ([family, weight, url]) => {
    const filename = path.join(
      ".cache/fonts",
      `${family.replaceAll(" ", "-")}-${weight}.ttf`,
    );
    let bytes;
    try {
      bytes = await readFile(filename);
    } catch {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`Font download failed: ${r.status} ${url}`);
      bytes = Buffer.from(await r.arrayBuffer());
      await writeFile(filename, bytes);
    }
    return `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:block;src:url(data:font/ttf;base64,${bytes.toString("base64")}) format('truetype')}`;
  }),
);
const bundle = await build({
  entryPoints: ["src/film.js"],
  bundle: true,
  format: "iife",
  minify: true,
  write: false,
  legalComments: "inline",
  target: ["chrome120"],
});
const css = await readFile("src/film.css", "utf8");
let audio = "";
if (!draft)
  audio = `data:audio/mpeg;base64,${(await readFile("output/master.mp3")).toString("base64")}`;
const safeJSON = (value) => JSON.stringify(value).replaceAll("<", "\\u003c");
const fontNotices = await Promise.all(
  ["sora", "ibmplexmono"].map(async (family) => {
    const cache = `.cache/fonts/${family}-OFL.txt`;
    try {
      return await readFile(cache, "utf8");
    } catch {
      const response = await fetch(
        `https://raw.githubusercontent.com/google/fonts/main/ofl/${family}/OFL.txt`,
      );
      if (!response.ok)
        throw new Error(`Font license download failed: ${response.status}`);
      const text = await response.text();
      await writeFile(cache, text);
      return text;
    }
  }),
);
const notices = [
  "GSAP 3.13.0 — Copyright GreenSock. Standard no-charge license: https://gsap.com/standard-license (not MIT).",
  "Three.js 0.180.0",
  await readFile("node_modules/three/LICENSE", "utf8"),
  "Lottie-web 5.13.0",
  await readFile("node_modules/lottie-web/LICENSE.md", "utf8"),
  "Sora / SIL Open Font License",
  fontNotices[0],
  "IBM Plex Mono / SIL Open Font License",
  fontNotices[1],
  "Installed guidance skill licenses and pinned source revisions: SKILLS.md and .agents/skills.",
].join("\n\n");
await writeFile("THIRD_PARTY_LICENSES.txt", notices);
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><meta name="description" content="A narrated motion-design film about systems design from first principles and scaling chat to one million registered users. Explicit illustrative assumptions; researched architecture trade-offs."><title>Signal — One million / Systems design</title><style>${embedded.join("\n")}\n${css}</style></head><body>
<div id="frame"><main id="stage" aria-label="Signal: systems design film"><canvas id="network" width="1000" height="740" aria-hidden="true"></canvas></main><div id="caption" role="region" aria-label="Current chapter transcript" hidden></div></div>
<nav class="transport" aria-label="Film playback"><button id="play" type="button">Play film</button><input id="scrubber" type="range" min="0" max="1" step="0.0333333333" value="0" aria-label="Playback position"><time id="time">0:00</time><select id="chapter" aria-label="Choose chapter"></select><button id="cc" type="button" aria-pressed="false">Transcript</button><button id="mute" type="button">Mute</button></nav><div id="status" role="status">${draft ? "Draft visuals — final audio is being produced" : "Loading film…"}</div><audio id="audio" preload="auto"></audio>
<script type="text/plain" id="third-party-notices">${notices.replaceAll("</script", "<\/script")}</script><script>window.__FILM_DATA__=${safeJSON(timeline)};window.__AUDIO_SRC__=${safeJSON(audio)};</script><script>${bundle.outputFiles[0].text.replaceAll("</script", "<\/script")}</script>
</body></html>`;
await writeFile("film.html", html);
console.log(
  JSON.stringify(
    {
      file: "film.html",
      bytes: (await stat("film.html")).size,
      duration: timeline.duration,
      scenes: timeline.scenes.length,
      draft,
      offline: true,
    },
    null,
    2,
  ),
);
