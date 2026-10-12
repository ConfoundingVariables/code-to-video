import { gsap } from "gsap";
import * as THREE from "three";
import lottie from "lottie-web";

const film = window.__FILM_DATA__;
const rendering = new URLSearchParams(location.search).has("render");
const reduced =
  !rendering && matchMedia("(prefers-reduced-motion: reduce)").matches;
const C = {
  ink: "#122641",
  deep: "#0a1729",
  mist: "#edf5f1",
  copper: "#ffb18b",
  tide: "#52c8b5",
  sun: "#f7d368",
  muted: "#9cabbc",
};
const stage = document.querySelector("#stage");
const audio = document.querySelector("#audio");
audio.src = window.__AUDIO_SRC__ || "";
const $ = (root, selector) => root.querySelector(selector);
const $$ = (root, selector) => [...root.querySelectorAll(selector)];
const clamp = (n, a = 0, b = 1) => Math.max(a, Math.min(b, n));
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const tag = (
  text,
  x,
  y,
  color = C.muted,
  size = 24,
  anchor = "start",
  cls = "",
) =>
  `<text class="${cls}" x="${x}" y="${y}" fill="${color}" font-size="${size}" text-anchor="${anchor}">${esc(text)}</text>`;
function node(id, x, y, w, h, title, sub = "", color = C.mist, cls = "") {
  const titleSize = w < 330 && title.length > 12 ? 26 : 30;
  return `<g transform="translate(${x} ${y})"><g id="${id}" class="node ${cls}"><rect width="${w}" height="${h}" rx="18" fill="${C.deep}" stroke="${color}" stroke-opacity=".65" stroke-width="2"/><rect x="20" y="25" width="7" height="${h - 50}" rx="3" fill="${color}"/>${tag(title, 46, sub ? 50 : h / 2 + 10, color, titleSize)}${sub ? tag(sub, 46, 88, C.muted, 22) : ""}</g></g>`;
}
const line = (id, d, color = C.muted, cls = "") =>
  `<path id="${id}" class="route ${cls}" d="${d}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round"/>`;
const packet = (id, x, y, color = C.copper) =>
  `<g transform="translate(${x} ${y})"><g id="${id}" class="packet"><rect x="-23" y="-16" width="46" height="32" rx="9" fill="${color}"/><path d="M-13 -5 L0 3 L13 -5" stroke="${C.ink}" fill="none" stroke-width="2"/></g></g>`;
const svg = (body, height = 560) =>
  `<svg class="diagram" viewBox="0 0 1640 ${height}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;
const footer = (text) => `<div class="takeaway">${text}</div>`;

const visuals = {
  opening: () =>
    `<div class="hero-copy"><div class="hero-pre">Designing chat from first principles</div><h1 class="hero-title">One<br>million.</h1><div class="hero-sub">A million people.<br>The same simple promise.</div></div><div class="network-label">One message → many possible paths</div><div class="opening-chat"><div class="bubble sender">You there?<span>message: a7f2</span></div><div class="chat-wire"><i></i></div><div class="bubble receiver">I'm here.<span class="delivery">Durably accepted ≠ read</span></div></div>`,
  promises: () =>
    `<div class="promises-list"><div class="promise"><span class="ordinal">01</span><h2>Survive a crash.</h2><p>Durable acceptance</p></div><div class="promise"><span class="ordinal">02</span><h2>Keep the sequence.</h2><p>Order within a conversation</p></div><div class="promise"><span class="ordinal">03</span><h2>Close the gaps.</h2><p>Replay after reconnect</p></div></div><div class="latency-goal"><strong>p95 &lt; 200 ms</strong><span>Illustrative single-region goal • measure durable-ack latency</span></div>${footer("Accepted → delivered → read. Three different promises.")}`,
  workload: () =>
    `<div class="load-top"><div><span>Registered</span><strong>1,000,000</strong></div><div><span>Daily active</span><strong>200,000</strong></div><div><span>Concurrent sockets</span><strong>50,000</strong></div></div><div class="equation"><span class="term">200k × 20</span><span class="equals">=</span><span class="answer">4m <small>messages / day</small></span></div><div class="load-bottom"><div><b>≈46/s</b><span>Average writes<br>4m ÷ 86,400</span></div><div><b>≈460/s</b><span>10× assumed peak<br>Not a measured limit</span></div><div><b>≈3,700/s</b><span>Recipient deliveries<br>8× assumed fan-out</span></div></div>${footer("Every number here is a modeling assumption, not a production benchmark.")}`,
  baseline: () =>
    svg(
      `${node("client", 80, 160, 300, 140, "Client", "Live + history", C.copper)}${node("app", 660, 160, 330, 140, "Application", "Auth · send · read", C.mist)}${node("db", 1230, 160, 330, 140, "PostgreSQL", "Messages + members", C.tide)}${line("baseline-live", "M380 205 H660", C.copper)}${line("baseline-db", "M990 230 H1230", C.tide)}${tag("WebSocket", 520, 175, C.copper, 26, "middle")}${tag("HTTP history", 520, 284, C.muted, 24, "middle")}${tag("Transaction", 1110, 190, C.tide, 24, "middle")}${packet("baseline-packet", 385, 205)}${tag("History index: (conversation_id, sequence)", 820, 410, C.mist, 30, "middle")}${tag("Measure CPU, storage latency and query plans before splitting services.", 820, 474, C.muted, 25, "middle")}`,
    ) +
    footer(
      "Start simple. The modeled write rate is not evidence that you need shards.",
    ),
  durability: () =>
    svg(
      `${node("send", 20, 190, 260, 130, "Sender", "id: a7f2", C.copper)}${node("validate", 390, 190, 280, 130, "Authorize", "Member check", C.mist)}<g id="transaction"><rect x="790" y="100" width="425" height="330" rx="22" fill="${C.deep}" stroke="${C.tide}" stroke-width="3"/>${tag("ONE TRANSACTION", 1003, 146, C.tide, 24, "middle")}${node("message-row", 825, 170, 355, 100, "Message row", "a7f2 · seq 1042", C.copper)}${node("outbox-row", 825, 292, 355, 100, "Outbox event", "message.accepted", C.tide)}</g>${node("relay", 1335, 190, 285, 130, "Relay", "Retry-safe publish", C.mist)}${line("send-wire", "M280 250 H390", C.copper)}${line("validate-wire", "M670 250 H790", C.copper)}${line("relay-wire", "M1215 250 H1335", C.tide)}${line("ack-wire", "M1000 430 V488 H150 V320", C.tide)}${tag("ACK ONLY AFTER COMMIT", 595, 528, C.tide, 28, "middle", "commit-label")}${packet("durable-packet", 285, 250)}${packet("outbox-packet", 1220, 250, C.tide)}`,
    ) +
    `<div id="commit-check" class="commit-check"></div>` +
    footer(
      "Message + event are atomic. Relay delivery is still at least once.",
    ),
  ordering: () =>
    `<div class="retry-flow"><div class="command original"><span>First send</span><code>sender 29 / room 8<br>client_id: a7f2</code><strong>seq 1042</strong></div><div class="retry-arrow">timeout<br><b>↻</b></div><div class="command duplicate"><span>Retry: same identity</span><code>sender 29 / room 8<br>client_id: a7f2</code><strong class="dedupe-result">Return seq 1042</strong></div></div><div class="constraint"><span>Unique constraint</span><code>(sender_id, conversation_id, client_message_id)</code></div><div class="sequence-line"><span>Room 8</span><i>1040</i><i>1041</i><i class="current">1042</i><i>1043</i><span class="sequence-caption">One serialized sequence per conversation</span></div>${footer("At-least-once delivery + idempotent effects. Not global exactly-once magic.")}`,
  gateways: () =>
    `<div class="gateway-metric"><strong>50,000</strong><span>simultaneous sockets<br>≠ registered accounts</span><div class="memory">50k × 32 KiB ≈ 1.53 GiB<small>Illustrative state alone; excludes TLS + runtime</small></div></div><div class="gateway-strip"><div>Load balancer</div><span>↙</span><div>Gateway A<br><small>connections</small></div><div>Gateway B<br><small>connections</small></div><div>Gateway C<br><small>connections</small></div></div>${footer("Keep sockets at the edge. Benchmark heartbeats, descriptors, memory and churn.")}`,
  fanout: () =>
    svg(
      `${node("event", 20, 160, 285, 140, "Message event", "room 8 · seq 1042", C.copper)}${node("log", 460, 160, 285, 140, "Partitioned log", "key: room 8", C.tide)}${node("worker", 910, 160, 285, 140, "Delivery worker", "Route to gateways", C.mist)}${line("event-log", "M305 230 H460", C.copper)}${line("log-worker", "M745 230 H910", C.tide)}${line("fan-a", "M1195 230 H1270 V85 H1360", C.copper)}${line("fan-b", "M1195 230 H1360", C.copper)}${line("fan-c", "M1195 230 H1270 V375 H1360", C.copper)}${node("recipient-a", 1360, 40, 250, 90, "Device A", "", C.copper)}${node("recipient-b", 1360, 185, 250, 90, "Device B", "", C.copper)}${node("recipient-c", 1360, 330, 250, 90, "Device C", "", C.copper)}${packet("fan-packet", 310, 230)}${tag("Small groups: push", 445, 435, C.mist, 29, "middle")}${tag("Huge rooms: shared log + cursor", 1135, 485, C.sun, 29, "middle")}`,
    ) +
    footer(
      "Ordering is local to a partition. A hot conversation needs its own strategy.",
    ),
  offline: () =>
    `<div class="history-layout"><div class="device"><div class="device-label">Device reconnects</div><div class="cursor">last contiguous<br><strong id="cursor-number">1041</strong></div><div class="resume-arrow">Fetch sequence &gt; cursor</div></div><div class="history-window"><div class="history-head">Durable conversation history</div><div class="history-scroll" id="history-scroll"><div class="history-track">${[1040, 1041, 1042, 1043, 1044, 1045, 1046, 1047].map((n, i) => `<div class="history-row ${i > 1 ? "new-message" : ""}"><code>${n}</code><span>${["Before disconnect", "Cursor checkpoint", "Saved while offline", "Live event (may overlap)", "Catch-up page", "Deduplicated merge", "Contiguous prefix", "Resume live delivery"][i]}</span><i>${i > 1 ? "replay" : "stored"}</i></div>`).join("")}</div></div><div class="native-progress"><div></div></div></div></div><div class="replay-rule">Merge → deduplicate → fill gaps → advance cursor</div>${footer("Redis Pub/Sub is at-most-once. The socket is not your durable history.")}`,
  storage: () =>
    `<div class="storage-math"><strong>4 GB/day</strong><span>4m messages × assumed 1 kB<br>≈360 GB / 90 days, before overhead</span></div>${svg(`${node("conversation", 20, 30, 365, 120, "conversation_id", "Hash + routing map", C.copper)}${line("shard-a", "M385 90 H460 V55 H600", C.copper)}${line("shard-b", "M385 90 H510 V180 H600", C.copper)}${line("shard-c", "M385 90 H460 V305 H600", C.copper)}${node("shard-a-node", 600, 10, 270, 90, "Shard A", "", C.tide)}${node("shard-b-node", 600, 135, 270, 90, "Shard B", "", C.tide)}${node("shard-c-node", 600, 260, 270, 90, "Shard C", "", C.tide)}${tag("One conversation → one owner", 970, 80, C.mist, 29)}${tag("Large history → time buckets", 970, 140, C.muted, 26)}${tag("Hot room → explicit owner strategy", 970, 200, C.sun, 26)}${node("media", 970, 260, 640, 120, "Object storage → CDN", "Controlled media access; not database blobs", C.copper)}`, 440)}${footer("Shard when measured limits demand it. Capacity includes indexes, replicas and backups.")}`,
  ephemeral: () =>
    `<div class="data-split"><div class="ephemeral-side"><h2>Disposable signals</h2><div class="typing"><i></i><i></i><i></i><span>typing…</span></div><p>Presence · typing<br>TTL · debounce · coalesce</p><div class="expiry">Expires without a durable promise</div></div><div class="durable-side"><h2>Durable messages</h2><div class="saved-message">a7f2 <span>seq 1042 ✓</span></div><p>Accepted messages<br>Persist · replay · deduplicate</p><div class="security">TLS + per-conversation authorization<br>Retention + rate limits + protected media</div></div></div>${footer("Push is a wake-up signal. Fetch the message from durable storage. E2EE needs key design.")}`,
  overload: () =>
    `<div class="little-law"><span>Little's law</span><strong>L = λ × W</strong><div class="law-values"><span>≈460/s × 0.2s</span><b>≈92 in flight</b></div></div><div class="queue-viz"><div class="queue-input">Arrival<br><b>λ</b></div><div class="queue-pipe">${Array.from({ length: 12 }, (_, i) => `<i class="queue-item" style="--n:${i}"></i>`).join("")}</div><div class="queue-output">Service<br><b>μ</b></div></div><div class="pressure-consequence"><span>4× latency</span><b>≈368 in flight</b><span>Drain requires μ &gt; λ</span></div>${footer("Bound queues and slow-client buffers. Shed typing first; retry with backoff + jitter.")}`,
  regions: () =>
    svg(
      `<g id="home-region"><rect x="30" y="50" width="650" height="390" rx="28" fill="${C.deep}" stroke="${C.tide}" stroke-width="2"/>${tag("Home region", 65, 100, C.tide, 34)}${node("az1", 80, 190, 235, 140, "Zone A", "Write owner", C.copper)}${node("az2", 395, 190, 235, 140, "Zone B", "Replica", C.tide)}${line("az-replication", "M315 260 H395", C.tide)}</g><g id="remote-region"><rect x="970" y="50" width="640" height="390" rx="28" fill="${C.deep}" stroke="${C.muted}" stroke-width="2"/>${tag("Recovery region", 1010, 100, C.mist, 34)}${node("remote-copy", 1060, 190, 455, 140, "Cross-region replica", "Async may lag the primary", C.mist)}</g>${line("cross-region", "M680 255 H970", C.copper)}${packet("replica-packet", 690, 255)}${tag("WAN", 825, 220, C.copper, 26, "middle")}${tag("Async: lower write latency, possible recent-write loss", 820, 500, C.mist, 28, "middle")}${tag("Zero regional-loss requirement: acknowledge the required cross-region quorum", 820, 549, C.sun, 24, "middle")}`,
    ) +
    footer(
      "Test failover and restore. A different failure boundary demands a different acknowledgement.",
    ),
  operate: () =>
    `<div class="metrics-grid"><div><span>Durable-ack latency</span><strong>p50 / p95 / p99</strong></div><div><span>Delivery + outbox lag</span><strong>Age, not just depth</strong></div><div><span>Connections + gaps</span><strong>Churn / slow clients</strong></div></div><div class="experiment-track"><div>Realistic load</div><span>→</span><div class="fault-node">Kill a gateway</div><span>→</span><div>Reconnect storm</div><span>→</span><div class="proof-node">Check invariants</div></div><div class="experiment-details">Giant room • paused relay • database failover • restored backup</div>${footer("The question is not “did the process recover?” It is “did the promise survive?”")}`,
  closing: () =>
    `<div class="closing-copy"><div class="hero-pre">From first principles</div><h1>Scale the<br>promises.</h1><p>Not the diagram.</p></div><div class="closing-principles"><span>Quantify the load.</span><span>Commit before ACK.</span><span>Make retries safe.</span><span>Keep ordering local.</span><span>Measure. Then grow.</span></div><div class="closing-message">You there?<span>seq 1042 · accepted · replayable</span></div><div class="credit-line">Research-backed design study / illustrative workload<br>GSAP · Three.js · Lottie · native web / original synthesized score</div>`,
};

const scenes = film.scenes.map((s, i) => {
  const el = document.createElement("article");
  el.className = `scene scene-${s.id} ${["offline", "ephemeral"].includes(s.id) ? "light" : ""}`;
  el.id = `scene-${s.id}`;
  const chapter = s.chapter
    .toLowerCase()
    .replace(/(^|\/\s)([a-z])/g, (_, a, b) => a + b.toUpperCase());
  const hero = ["opening", "closing"].includes(s.id);
  el.innerHTML = `<header><span>${esc(chapter)}</span><b>Signal / ${String(i + 1).padStart(2, "0")}</b></header>${hero ? "" : `<div class="heading"><h1>${esc(s.title)}</h1><p>${esc(s.subtitle)}</p></div>`}<div class="visual">${visuals[s.id]()}</div><div class="chapter-progress"><i></i><span>${String(i + 1).padStart(2, "0")} / ${String(film.scenes.length).padStart(2, "0")}</span></div>`;
  stage.appendChild(el);
  return { ...s, el, index: i };
});

// A single absolute-time master, with authored scene labels and no clock-based loops.
const master = gsap.timeline({
  paused: true,
  defaults: { duration: 0.8, ease: "power3.out" },
});
master.to({}, { duration: film.duration }, 0);
function reveal(tl, els, at = 0.3, stagger = 0.1) {
  tl.fromTo(
    els,
    { opacity: 0, y: reduced ? 0 : 20 },
    { opacity: 1, y: 0, duration: 0.8, stagger },
    at,
  );
}
function draw(tl, el, at, duration = 1) {
  const length = el.getTotalLength();
  tl.fromTo(
    el,
    { strokeDasharray: length, strokeDashoffset: length },
    { strokeDashoffset: 0, duration, ease: "power2.inOut" },
    at,
  );
}
function travel(tl, el, points, at, duration = 1.2) {
  const span = duration / (points.length - 1);
  tl.set(el, { opacity: 1 }, at);
  points.slice(1).forEach((p, i) =>
    tl.to(
      el,
      {
        x: p[0] - points[0][0],
        y: p[1] - points[0][1],
        duration: span,
        ease: "power2.inOut",
      },
      at + i * span,
    ),
  );
  tl.to(el, { opacity: 0, duration: 0.2 }, at + duration + 0.15);
}
function beat(s, fraction) {
  return 1.1 + s.narrationDuration * fraction;
}
for (const s of scenes) {
  const tl = gsap.timeline({ defaults: { duration: 0.8, ease: "power3.out" } });
  const el = s.el;
  reveal(tl, $$(el, "header,.heading"), 0.15, 0.15);
  const takes = $(el, ".takeaway");
  if (takes) reveal(tl, takes, beat(s, 0.72));
  switch (s.id) {
    case "opening":
      reveal(tl, $(el, ".opening-chat"), 0.2);
      reveal(tl, $(el, ".hero-copy"), 2.8);
      tl.fromTo(
        $(el, ".chat-wire i"),
        { scaleX: 0 },
        { scaleX: 1, transformOrigin: "left", duration: 1.4 },
        1,
      );
      reveal(tl, $(el, ".network-label"), 6);
      break;
    case "promises":
      $$(el, ".promise").forEach((n, i) =>
        reveal(tl, n, beat(s, 0.12 + i * 0.15)),
      );
      reveal(tl, $(el, ".latency-goal"), beat(s, 0.56));
      break;
    case "workload":
      reveal(tl, $$(el, ".load-top > div"), beat(s, 0.1), 0.2);
      reveal(tl, $(el, ".equation"), beat(s, 0.38));
      $$(el, ".load-bottom > div").forEach((n, i) =>
        reveal(tl, n, beat(s, 0.5 + i * 0.12)),
      );
      break;
    case "baseline":
      reveal(tl, $$(el, ".node"), beat(s, 0.04), 0.22);
      $$(el, ".route").forEach((n, i) => draw(tl, n, beat(s, 0.12 + i * 0.1)));
      travel(
        tl,
        $(el, "#baseline-packet"),
        [
          [385, 205],
          [655, 205],
        ],
        beat(s, 0.17),
        1.2,
      );
      reveal(tl, $$(el, ".diagram > text"), beat(s, 0.3), 0.05);
      break;
    case "durability":
      reveal(tl, $$(el, "#send,#validate"), beat(s, 0.04), 0.15);
      reveal(tl, $(el, "#transaction"), beat(s, 0.22));
      draw(tl, $(el, "#send-wire"), beat(s, 0.1), 0.55);
      draw(tl, $(el, "#validate-wire"), beat(s, 0.22), 0.6);
      travel(
        tl,
        $(el, "#durable-packet"),
        [
          [285, 250],
          [385, 250],
          [765, 250],
        ],
        beat(s, 0.12),
        2,
      );
      reveal(tl, $$(el, "#relay"), beat(s, 0.52));
      draw(tl, $(el, "#relay-wire"), beat(s, 0.55), 0.7);
      draw(tl, $(el, "#ack-wire"), beat(s, 0.4), 1.3);
      reveal(tl, $(el, ".commit-label"), beat(s, 0.4));
      travel(
        tl,
        $(el, "#outbox-packet"),
        [
          [1220, 250],
          [1320, 250],
        ],
        beat(s, 0.58),
        1.3,
      );
      reveal(tl, $(el, "#commit-check"), beat(s, 0.4));
      break;
    case "ordering":
      reveal(tl, $(el, ".original"), beat(s, 0.03));
      reveal(tl, $(el, ".retry-arrow"), beat(s, 0.12));
      reveal(tl, $(el, ".duplicate"), beat(s, 0.3));
      reveal(tl, $(el, ".dedupe-result"), beat(s, 0.48));
      reveal(tl, $(el, ".constraint"), beat(s, 0.33));
      reveal(tl, $(el, ".sequence-line"), beat(s, 0.62));
      break;
    case "gateways":
      reveal(tl, $(el, ".gateway-metric"), beat(s, 0.07));
      reveal(tl, $(el, ".gateway-strip"), beat(s, 0.16));
      reveal(tl, $(el, ".memory"), beat(s, 0.46));
      break;
    case "fanout":
      reveal(tl, $$(el, "#event,#log,#worker"), beat(s, 0.03), 0.2);
      $$(el, "#event-log,#log-worker").forEach((n, i) =>
        draw(tl, n, beat(s, 0.12 + i * 0.08)),
      );
      travel(
        tl,
        $(el, "#fan-packet"),
        [
          [310, 230],
          [450, 230],
          [900, 230],
        ],
        beat(s, 0.16),
        2,
      );
      reveal(
        tl,
        $$(el, "#recipient-a,#recipient-b,#recipient-c"),
        beat(s, 0.35),
        0.1,
      );
      $$(el, "#fan-a,#fan-b,#fan-c").forEach((n, i) =>
        draw(tl, n, beat(s, 0.37 + i * 0.03), 1),
      );
      reveal(tl, $$(el, ".diagram > text"), beat(s, 0.65), 0.2);
      break;
    case "offline":
      reveal(tl, $(el, ".history-layout"), beat(s, 0.04));
      reveal(tl, $(el, ".replay-rule"), beat(s, 0.56));
      break;
    case "storage":
      reveal(tl, $(el, ".storage-math"), beat(s, 0.05));
      reveal(tl, $$(el, ".node"), beat(s, 0.38), 0.13);
      $$(el, ".route").forEach((n, i) =>
        draw(tl, n, beat(s, 0.4 + i * 0.04), 1),
      );
      reveal(tl, $$(el, ".diagram > text"), beat(s, 0.56), 0.13);
      break;
    case "ephemeral":
      reveal(tl, $(el, ".ephemeral-side"), beat(s, 0.02));
      reveal(tl, $(el, ".durable-side"), beat(s, 0.16));
      reveal(tl, $(el, ".security"), beat(s, 0.59));
      break;
    case "overload":
      reveal(tl, $(el, ".little-law"), beat(s, 0.1));
      reveal(tl, $(el, ".law-values"), beat(s, 0.36));
      reveal(tl, $(el, ".queue-viz"), beat(s, 0.04));
      reveal(tl, $(el, ".pressure-consequence"), beat(s, 0.62));
      break;
    case "regions":
      reveal(tl, $(el, "#home-region"), beat(s, 0.04));
      draw(tl, $(el, "#az-replication"), beat(s, 0.07));
      reveal(tl, $(el, "#remote-region"), beat(s, 0.24));
      draw(tl, $(el, "#cross-region"), beat(s, 0.32), 1.5);
      travel(
        tl,
        $(el, "#replica-packet"),
        [
          [690, 255],
          [950, 255],
        ],
        beat(s, 0.37),
        2,
      );
      reveal(tl, $$(el, ".diagram > text"), beat(s, 0.52), 0.3);
      break;
    case "operate":
      reveal(tl, $$(el, ".metrics-grid > div"), beat(s, 0.08), 0.15);
      reveal(tl, $(el, ".experiment-track"), beat(s, 0.36));
      reveal(tl, $(el, ".experiment-details"), beat(s, 0.58));
      tl.to(
        $(el, ".fault-node"),
        { borderColor: C.copper, color: C.copper, duration: 0.45 },
        beat(s, 0.52),
      );
      tl.to(
        $(el, ".proof-node"),
        { borderColor: C.tide, color: C.tide, duration: 0.45 },
        beat(s, 0.75),
      );
      break;
    case "closing":
      reveal(tl, $(el, ".closing-copy"), 0.3);
      reveal(tl, $$(el, ".closing-principles span"), beat(s, 0.2), 0.55);
      reveal(tl, $(el, ".closing-message"), beat(s, 0.72));
      reveal(tl, $(el, ".credit-line"), beat(s, 0.87));
      break;
  }
  master.addLabel(s.id, s.start).add(tl, s.start);
}
gsap.ticker.sleep();

// Seeded Three.js network: the very same geometry survives every seek and every worker.
const canvas = document.querySelector("#network");
const renderer = new THREE.WebGLRenderer({
  canvas,
  alpha: true,
  antialias: true,
  preserveDrawingBuffer: true,
});
renderer.setPixelRatio(1);
renderer.setSize(1000, 740, false);
const world = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, 1000 / 740, 0.1, 100);
camera.position.set(0, 0, 8.2);
const group = new THREE.Group();
world.add(group);
let seed = 1042;
const rand = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};
const coords = [];
for (let i = 0; i < 300; i++) {
  const z = rand() * 2 - 1,
    theta = rand() * Math.PI * 2,
    r = Math.sqrt(1 - z * z),
    radius = 2.55;
  coords.push(
    Math.cos(theta) * r * radius,
    z * radius,
    Math.sin(theta) * r * radius,
  );
}
const pg = new THREE.BufferGeometry();
pg.setAttribute("position", new THREE.Float32BufferAttribute(coords, 3));
const points = new THREE.Points(
  pg,
  new THREE.PointsMaterial({
    color: C.tide,
    size: 0.045,
    transparent: true,
    opacity: 0.78,
  }),
);
group.add(points);
const links = [];
for (let i = 0; i < 300; i++)
  for (let j = i + 1; j < 300; j++) {
    const dx = coords[i * 3] - coords[j * 3],
      dy = coords[i * 3 + 1] - coords[j * 3 + 1],
      dz = coords[i * 3 + 2] - coords[j * 3 + 2];
    if (dx * dx + dy * dy + dz * dz < 0.64)
      links.push(
        ...coords.slice(i * 3, i * 3 + 3),
        ...coords.slice(j * 3, j * 3 + 3),
      );
  }
const lg = new THREE.BufferGeometry();
lg.setAttribute("position", new THREE.Float32BufferAttribute(links, 3));
group.add(
  new THREE.LineSegments(
    lg,
    new THREE.LineBasicMaterial({
      color: C.tide,
      transparent: true,
      opacity: 0.19,
    }),
  ),
);
const ring = new THREE.Mesh(
  new THREE.TorusGeometry(2.82, 0.008, 6, 160),
  new THREE.MeshBasicMaterial({
    color: C.copper,
    transparent: true,
    opacity: 0.6,
  }),
);
ring.rotation.x = 1.15;
group.add(ring);
const signal = new THREE.Mesh(
  new THREE.SphereGeometry(0.08, 12, 8),
  new THREE.MeshBasicMaterial({ color: C.copper }),
);
group.add(signal);

// A real seekable Lottie shape animation: the durable-acceptance check.
const ease = { i: { x: [0.16], y: [1] }, o: { x: [0.3], y: [0] } };
const checkData = {
  v: "5.13.0",
  fr: 30,
  ip: 0,
  op: 45,
  w: 100,
  h: 100,
  nm: "Durable commit",
  ddd: 0,
  assets: [],
  layers: [
    {
      ddd: 0,
      ind: 1,
      ty: 4,
      nm: "Check",
      sr: 1,
      ks: {
        o: { a: 0, k: 100 },
        r: { a: 0, k: 0 },
        p: { a: 0, k: [50, 50, 0] },
        a: { a: 0, k: [0, 0, 0] },
        s: { a: 0, k: [100, 100, 100] },
      },
      ao: 0,
      shapes: [
        {
          ty: "gr",
          it: [
            {
              ty: "sh",
              ks: {
                a: 0,
                k: {
                  i: [
                    [0, 0],
                    [0, 0],
                    [0, 0],
                  ],
                  o: [
                    [0, 0],
                    [0, 0],
                    [0, 0],
                  ],
                  v: [
                    [-25, 0],
                    [-7, 19],
                    [29, -22],
                  ],
                  c: false,
                },
              },
              nm: "Path",
            },
            {
              ty: "st",
              c: { a: 0, k: [0.32, 0.78, 0.71, 1] },
              o: { a: 0, k: 100 },
              w: { a: 0, k: 8 },
              lc: 2,
              lj: 2,
              nm: "Stroke",
            },
            {
              ty: "tm",
              s: { a: 0, k: 0 },
              e: {
                a: 1,
                k: [
                  { t: 0, s: [0], e: [100], ...ease },
                  { t: 25, s: [100] },
                ],
              },
              o: { a: 0, k: 0 },
              m: 1,
              nm: "Draw",
            },
            {
              ty: "tr",
              p: { a: 0, k: [0, 0] },
              a: { a: 0, k: [0, 0] },
              s: { a: 0, k: [100, 100] },
              r: { a: 0, k: 0 },
              o: { a: 0, k: 100 },
              sk: { a: 0, k: 0 },
              sa: { a: 0, k: 0 },
            },
          ],
          nm: "Acceptance",
        },
      ],
      ip: 0,
      op: 45,
      st: 0,
      bm: 0,
    },
  ],
};
const check = lottie.loadAnimation({
  container: document.querySelector("#commit-check"),
  renderer: "svg",
  loop: false,
  autoplay: false,
  animationData: checkData,
});
const lottieReady = new Promise((resolve) =>
  check.addEventListener("DOMLoaded", resolve),
);
let activeIndex = -1,
  currentTime = 0,
  busy = false;
const nextPaint = () =>
  new Promise((resolve) => requestAnimationFrame(resolve));
function sceneAt(t) {
  const time = clamp(t, 0, film.duration - 1 / film.fps);
  return scenes.findLast((s) => s.start <= time) || scenes[0];
}
function paint(t) {
  currentTime = clamp(t, 0, film.duration - 1 / film.fps);
  const s = sceneAt(currentTime),
    local = currentTime - s.start;
  master.time(currentTime, false);
  gsap.ticker.sleep();
  if (activeIndex !== s.index) {
    for (const other of scenes) {
      other.el.style.visibility = other === s ? "visible" : "hidden";
      other.el.setAttribute("aria-hidden", String(other !== s));
    }
    activeIndex = s.index;
    document.querySelector("#chapter").value = s.id;
  }
  const progress = local / s.duration;
  $(s.el, ".chapter-progress i").style.transform = `scaleX(${progress})`;
  const canvasActive = ["opening", "gateways", "closing"].includes(s.id);
  canvas.style.display = canvasActive ? "block" : "none";
  canvas.style.opacity =
    s.id === "closing" ? ".22" : s.id === "gateways" ? ".52" : ".8";
  if (canvasActive) {
    group.rotation.y = reduced ? 0.35 : local * 0.048 + 0.35;
    group.rotation.z = 0.07;
    group.rotation.x = 0.14;
    const orbit = reduced ? 0.6 : local * 0.45;
    signal.position.set(
      Math.cos(orbit) * 2.55,
      Math.sin(orbit * 0.7) * 1.2,
      Math.sin(orbit) * 2.2,
    );
    renderer.render(world, camera);
  }
  if (s.id === "durability")
    check.goToAndStop(clamp((local - beat(s, 0.4)) * 30, 0, 44), true);
  if (s.id === "offline") {
    const scroller = $(s.el, "#history-scroll");
    const replay = clamp(
      (local - beat(s, 0.22)) / (s.narrationDuration * 0.42),
    );
    scroller.scrollTop =
      replay * (scroller.scrollHeight - scroller.clientHeight);
    $(s.el, "#cursor-number").textContent = String(
      1041 + Math.floor(replay * 6),
    );
    if (!CSS.supports("animation-timeline", "scroll()"))
      $(s.el, ".native-progress div").style.transform = `scaleX(${replay})`;
  }
  if (s.id === "ephemeral")
    $$(s.el, ".typing i").forEach((dot, i) => {
      dot.style.opacity = String(
        0.35 + 0.65 * (Math.sin(local * 3 - i * 0.8) * 0.5 + 0.5),
      );
      dot.style.transform = `translateY(${reduced ? 0 : Math.sin(local * 3 - i * 0.8) * -5}px)`;
    });
  if (s.id === "overload")
    $$(s.el, ".queue-item").forEach((item, i) => {
      const grow = clamp((local - beat(s, 0.4)) / (s.narrationDuration * 0.3));
      item.style.opacity = i < 3 + Math.floor(grow * 9) ? "1" : ".14";
      item.style.background = i > 6 ? C.copper : C.tide;
    });
  document.querySelector("#scrubber").value = currentTime;
  document.querySelector("#time").textContent =
    `${format(currentTime)} / ${format(film.duration)}`;
  document.querySelector("#caption").textContent = s.narration;
}
async function seek(t) {
  paint(t);
  // ScrollTimeline sampling is done by the browser, after its layout and animation tick.
  if (sceneAt(t).id === "offline") {
    await nextPaint();
    await nextPaint();
  }
}
function format(t) {
  return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
}
function resize() {
  const scale = Math.min(
    innerWidth / 1920,
    (innerHeight - (rendering ? 0 : 86)) / 1080,
  );
  stage.style.transform = `scale(${scale})`;
  document.querySelector("#frame").style.width = `${1920 * scale}px`;
  document.querySelector("#frame").style.height = `${1080 * scale}px`;
}
window.addEventListener("resize", resize);
resize();
const chapter = document.querySelector("#chapter");
chapter.innerHTML = scenes
  .map(
    (s) =>
      `<option value="${s.id}">${s.chapter.split("/")[0].trim()} — ${esc(s.title)}</option>`,
  )
  .join("");
const scrubber = document.querySelector("#scrubber");
scrubber.max = film.duration;
const button = document.querySelector("#play");
let playing = false;
function setPlaying(on) {
  playing = on;
  button.textContent = on ? "Pause" : "Play film";
  button.setAttribute("aria-label", on ? "Pause film" : "Play film");
}
async function toggle() {
  if (playing) {
    audio.pause();
    setPlaying(false);
    return;
  }
  if (currentTime >= film.duration - 0.1) {
    await seek(0);
    audio.currentTime = 0;
  }
  if (!audio.src || !window.__AUDIO_SRC__)
    throw new Error("Build the final audio before playback.");
  audio.currentTime = currentTime;
  await audio.play();
  setPlaying(true);
  requestAnimationFrame(playTick);
}
function playTick() {
  if (!playing) return;
  paint(audio.currentTime);
  requestAnimationFrame(playTick);
}
button.addEventListener("click", () =>
  toggle().catch((e) => {
    document.querySelector("#status").textContent = e.message;
  }),
);
audio.addEventListener("ended", () => {
  setPlaying(false);
  paint(film.duration - 1 / film.fps);
});
scrubber.addEventListener("input", () => {
  paint(Number(scrubber.value));
  audio.currentTime = currentTime;
});
chapter.addEventListener("change", async () => {
  const target = scenes.find((s) => s.id === chapter.value);
  const change = () => {
    paint(target.start + 1);
    audio.currentTime = currentTime;
  };
  if (document.startViewTransition && !reduced) {
    const transition = document.startViewTransition(change);
    await transition.finished;
  } else change();
});
document.querySelector("#cc").addEventListener("click", () => {
  const c = document.querySelector("#caption");
  c.hidden = !c.hidden;
  document.querySelector("#cc").setAttribute("aria-pressed", String(!c.hidden));
});
document.querySelector("#mute").addEventListener("click", () => {
  audio.muted = !audio.muted;
  document.querySelector("#mute").textContent = audio.muted ? "Unmute" : "Mute";
});
addEventListener("keydown", (e) => {
  if (e.target.matches("select,input,button")) return;
  if (e.code === "Space") {
    e.preventDefault();
    button.click();
  }
  if (e.code === "ArrowRight" || e.code === "ArrowLeft") {
    e.preventDefault();
    paint(
      clamp(currentTime + (e.code === "ArrowRight" ? 5 : -5), 0, film.duration),
    );
    audio.currentTime = currentTime;
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && playing) {
    audio.pause();
    setPlaying(false);
  }
});
if (rendering) document.body.classList.add("rendering");
const ready = Promise.all([document.fonts.ready, lottieReady]).then(
  async () => {
    await seek(0);
    document.querySelector("#status").textContent = reduced
      ? "Reduced-motion viewing enabled"
      : "Original narration + synchronized synthesized score";
  },
);
window.__FILM__ = {
  duration: film.duration,
  fps: film.fps,
  ready,
  seek,
  sceneAt: (t) => {
    const s = sceneAt(t);
    return { id: s.id, index: s.index, start: s.start, duration: s.duration };
  },
  techniques: {
    gsap: true,
    three: true,
    lottie: true,
    scrollTimeline: CSS.supports("animation-timeline", "scroll()"),
    viewTransitions: typeof document.startViewTransition === "function",
  },
  rendering,
};
