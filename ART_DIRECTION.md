# Signal / A million people, one message

## Editorial concept

The protagonist is a message, not a technology logo. It travels from a chat bubble into a durable row, becomes a delivery event, survives a retry, and returns to a reconnected device. Each chapter introduces exactly the new constraint that earns the next component. The ending returns to the original message.

## Visual tokens

| Token | Value | Role |
|---|---|---|
| Blueprint | `#122641` | Main stage, network and architecture |
| Deep ink | `#0a1729` | Diagram recesses, shadows |
| Mist | `#edf5f1` | Type and occasional light interludes |
| Copper | `#ffb18b` | The message and its durable identity |
| Tide | `#52c8b5` | Successful commit, replay, healthy delivery |
| Sun | `#f7d368` | Load, headroom and attention |

Sora variable: large, compact display headlines and diagram labels. IBM Plex Mono: IDs, equations, sequences and carefully scoped data. Left-aligned explanations; central spatial diagrams. Body is short enough to read while listening. At 1080p, essential diagram labels are at least 26px. No stock footage, product-logo collage, decorative glass cards or generic dashboard.

```text
┌──────────────────────────────────────────────────────────┐
│ chapter                                         SIGNAL   │
│ Headline                                                 │
│ One short proposition                                    │
│                                                          │
│     the message → a physical diagram of its promise       │
│                                                          │
│ the consequence of this decision                         │
│ ────────────── authored timeline / chapter index ──────── │
└──────────────────────────────────────────────────────────┘
```

## Review against the brief

The initial dark/acid-green big-number idea was rejected: it was a generic technology hero. The opening instead stages a real chat exchange against a cobalt network. Copper consistently means the message, tide means durable progress, and sun marks assumptions or pressure. Large scale is revealed only after the first message is understood. Alternating mist interludes distinguish durable history and ephemeral state rather than arbitrarily changing the palette.

## Motion thesis

- **Focal moment:** an ordinary message becomes one committed database row; an outbox event leaves that same transaction. The durable-ack arrow is deliberately delayed until the commit.
- **Continuity:** the same copper message shape follows the transport, transaction, retry, partition and reconnect sequences. Connection count and fanout are shown as different physical arrangements.
- **Feedback:** a real Lottie vector check draws on durable acceptance; cursor sequence numbers advance only when gaps are filled.
- **Personality:** premium documentary; no springy dashboards or bouncing text. Quick / standard / slow transitions are 0.2 / 0.45 / 0.8 seconds. GSAP `power3.out` for entrances, `power2.inOut` for travel, linear for constant packet flow. Narrated explanations use longer holds, not slower UI feedback.
- **Staging:** labels first, one primary path second, supporting consequences last. At most a third of diagram nodes receive emphasis together. Anticipation, arcs, follow-through, timing, staging and secondary action are used where their meaning is visible, not indiscriminately applied.
- **Budget:** static SVG for diagrams; GSAP transform/opacity and line reveals; one bounded Three.js canvas for connection scale; seeded geometry and absolute-time animation, never unseeded randomness. Lottie seeks its actual frames. No network fetches during rendering.
- **Native web:** history replay is represented with a real CSS scroll timeline. Chapter navigation in the HTML uses the browser View Transitions API. Exported chapter continuity is timeline-seekable and deterministic rather than dependent on wall-clock transitions.
- **Accessibility:** explicit play for sound, keyboard playback/seeking, readable captions, visible focus, responsive letterboxing and a reduced-motion viewing mode. Render mode preserves authored film motion for the MP4.

## Production contract

The measured narration determines frame-aligned scene boundaries in `output/timeline.json`. All GSAP, SVG, Three.js, Lottie, CSS-scroll and sound events use that one timeline. The final `film.html` embeds JavaScript, fonts and the mixed audio. It needs no CDN, API credential or build server for playback. `window.__FILM__.seek(t)` is the deterministic renderer API. The MP4 is produced from exact frames at 30fps, not a screen recording. The synthetic score is original Python audio, not licensed stock music.
