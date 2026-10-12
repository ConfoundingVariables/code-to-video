# Design and animation skills

Project-local skills live under `.agents/skills/`. They are vendored as markdown guidance only; no installer, runtime package, executable script, credential, or MCP configuration was run or copied.

## Installed packages

| Skill/package | Upstream repository and pinned revision | Imported source path(s) | Local path | License / attribution |
|---|---|---|---|---|
| Anthropic frontend design | [`anthropics/skills`](https://github.com/anthropics/skills) @ `dbd4588f9e1033efb41dad4bef2f7947c8993d44` | `skills/frontend-design/SKILL.md`, `skills/frontend-design/LICENSE.txt` | `.agents/skills/frontend-design/` | Apache License 2.0; exact upstream `LICENSE.txt` retained. |
| Impeccable (including animation) | [`pbakaus/impeccable`](https://github.com/pbakaus/impeccable) @ `919dbeba520df760a157fe635be62faae88d58da` | `.agents/skills/impeccable/**.md` (upstream `.agents/skills/impeccable/`, including `reference/animate.md`), root `LICENSE` | `.agents/skills/impeccable/` | Apache License 2.0; exact upstream root `LICENSE` retained. |
| Emil Kowalski animation/design skills | [`emilkowalski/skills`](https://github.com/emilkowalski/skills) @ `2d228630ba1446365f614a108cb8252f1feda202` | `skills/animate/`, `animation-performance/`, `animation-vocabulary/`, `emil-design-eng/`, `find-animation-opportunities/`, `improve-animations/`, `review-animations/` (markdown only), root `LICENSE` | `.agents/skills/emilkowalski/` | MIT; exact upstream root `LICENSE` retained. `animate/RECIPES.md`, `improve-animations/AUDIT.md`, `PLAN-TEMPLATE.md`, and `review-animations/STANDARDS.md` are retained dependencies. |
| LottieFiles motion design / animation principles | [`LottieFiles/motion-design-skill`](https://github.com/LottieFiles/motion-design-skill) @ `f9a8a041b85185ee4881b3471d3415e939aac772` | `skills/motion-design/SKILL.md`, `director/`, `patterns/`, `reference/` (markdown only), root `LICENSE` | `.agents/skills/lottiefiles-motion-design/` | MIT; exact upstream root `LICENSE` retained. |
| Motion AI Kit | [`motiondivision/ai-kit`](https://github.com/motiondivision/ai-kit) @ `d1c5c26f424adfd47c112d894e9d424b57338c7e` | `plugins/motion/skills/motion/` (SKILL plus all markdown best-practice/codex/spring/audit/preview references) | `.agents/skills/motion-ai-kit/` | The upstream `packages/motion-ai/package.json` declares MIT, but this repository revision has no `LICENSE` file. The local `UPSTREAM-LICENSE-NOTICE.txt` records that fact and the source URL; no non-markdown package files were copied. |
| GSAP agent skills | [`greensock/gsap-skills`](https://github.com/greensock/gsap-skills) @ `aed9cfd3277740755f6bfc1155c7aa645403b760` | `skills/gsap-core/`, `frameworks/`, `performance/`, `plugins/`, `react/`, `scrolltrigger/`, `timeline/`, `utils/` (`SKILL.md` only), root `LICENSE` | `.agents/skills/gsap/` | MIT; exact upstream root `LICENSE` retained. |

## Docs-only sources (not represented as local SKILL packages)

These are real first-party references, but are not claimed to be installable `SKILL.md` packages here:

- **GSAP runtime/docs:** [`greensock/GSAP`](https://github.com/greensock/GSAP) @ `13e2b790546426a1a2e0e9b409f3f8dc6d6611f2` (`master`), `package.json` license field = `Standard 'no charge' license: https://gsap.com/standard-license`; the repository tree has no `SKILL.md`. Official docs: [`gsap.com/docs/v3/`](https://gsap.com/docs/v3/).
- **Motion AI Kit web docs:** [`motion.dev/docs/ai-kit`](https://motion.dev/docs/ai-kit), [`motion.dev/docs/ai-kit-context`](https://motion.dev/docs/ai-kit-context), and [`motion.dev/docs/ai-kit-install`](https://motion.dev/docs/ai-kit-install). The official repository skill is installed above; the installer instructions are docs only and were not executed.

## Actionable art direction and animation rules

These are a synthesis of the installed `SKILL.md` files and their retained references. Use the linked local file as the normative detail when a rule needs full context.

### Art direction

- **Start from the subject, not a template.** Make palette, type, layout, and visual metaphors specific to systems design and the chat-app scaling story. Anthropic’s frontend skill asks for a short token plan first: 4–6 named colors, type roles, layout/alignment plus an ASCII wireframe, and a few unique principles (`.agents/skills/frontend-design/SKILL.md`).
- **Open with the subject’s most characteristic moment.** Do not default to a generic big-number hero, gradient, SaaS card grid, all-caps eyebrow, or repeated section chrome. Spend boldness in one memorable element and keep the surrounding composition quiet and disciplined (Anthropic frontend design; Impeccable references).
- **Give motion a job.** Motion should clarify state, relationship, hierarchy, continuity, attention, or the selected visual world. Decoration without a job is animation debt (`impeccable/reference/animate.md`, Motion AI Kit best practices).
- **Choose one motion personality for the film.** LottieFiles defines Playful, Premium, Corporate, and Energetic archetypes; select one, then define one signature easing, a three-step quick/standard/slow duration palette, and one entrance pattern (`lottiefiles-motion-design/SKILL.md`). For this systems-design narrative, keep the visual language coherent rather than mixing personalities.
- **Use narrative layers.** LottieFiles’ three layers are primary (the action viewers follow), secondary (supporting detail), and ambient (background life). Keep the primary legible; add secondary and ambient only when they reinforce the story.

### Choreography and timing

- **Write a motion thesis before implementation:** focal moment, continuity changes, feedback, and performance budget. Prefer one authored focal sequence over a pile of generic fades, rises, hover lifts, or scroll reveals (`impeccable/reference/animate.md`).
- **Use a clear micro-story:** setup → action → resolution. Stage the hero, then use restrained secondary motion. LottieFiles’ 8-step checklist asks for emotional target, personality, primary property, duration, easing, hero, secondary/ambient layers, and 1/3 rules (`lottiefiles-motion-design/SKILL.md`).
- **Direction matters:** entrances decelerate/ease out, exits accelerate/ease in, on-screen movement uses ease-in-out, and seamless ambient loops use sine-like ease-in-out. Keep entrance 30–50% longer than exit where the Lottie timing guidance applies.
- **Use bounded timing:** Impeccable’s web guidance gives 100–150 ms for immediate feedback, 150–300 ms for routine changes, 300–500 ms for layout/overlay transitions, and 500–800 ms for an authored focal entrance. LottieFiles gives 400–600 ms for a page/context transition and 600–1200 ms for a dramatic reveal. Choose from these ranges rather than inventing arbitrary values.
- **Sequence explicitly with GSAP timelines.** Put shared defaults on the timeline, use labels and the position parameter (`<`, `>`, `+=`, `-=`) instead of chains of ad-hoc delays, and keep ScrollTrigger at the top-level tween/timeline (`gsap-timeline/SKILL.md`). For the deterministic film, [synthesis] this maps naturally to one named master timeline with auditable scene labels.
- **Choose the cheapest mechanism that meets the need:** CSS for simple declarative state, WAAPI for programmatic control without a library, Motion for springs/interruptible/layout/gesture work, and GSAP for complex sequencing, synchronization, reversal, seeking, or dynamic control (`emilkowalski/animate`, Motion AI Kit, `gsap-core`).

### Performance and accessibility

- Prefer transform/opacity (and, where appropriate, clip-path/filter); avoid animating layout-driving width/height/top/left/margins/padding when a transform or layout technique communicates the same change (`impeccable/reference/animate.md`, Motion AI Kit best practices, `gsap-performance`).
- Keep content visible in its default state. Bound blur, filter, shadow, canvas, and shader work to isolated regions; use `will-change` only for known animations and remove it when finished. Batch reads before writes; avoid per-frame allocation and repeated tween creation (`impeccable`, Motion AI Kit, `gsap-performance`).
- Stagger only when the elements are meaningfully a list/sequence; cap total delay. Pause/kill off-screen or inactive loops, and avoid hundreds of simultaneous tweens (`impeccable/reference/animate.md`, `gsap-performance`).
- Respect `prefers-reduced-motion`: reduce spatial movement while retaining meaningful feedback/state changes. Any nonessential loop should stop when hidden/offscreen (`impeccable/reference/animate.md`, Motion AI Kit best practices).
- Emil’s gate is useful for editorial restraint: very frequent interactions should be instantaneous or near-imperceptible; standard motion belongs to occasional surfaces; reserve delight for rare/first-time moments (`emilkowalski/animate/SKILL.md`).
- Avoid bounce/elastic by reflex. If the chosen Lottie personality needs overshoot, keep it deliberate and consistent; serious/system moments should remain controlled (`impeccable`, Motion AI Kit best practices, LottieFiles motion personality).

### Deterministic film application

- [Synthesis] Treat the shot list as a labeled master timeline: each scene has explicit start/end times, one primary visual action, and only supporting secondary/ambient movement that earns its place.
- [Synthesis] Keep all animation values explicit and finite for frame-by-frame rendering; avoid random or time-dependent behavior, and make scene transitions seekable so a renderer can reproduce any frame.
- [Synthesis] Use the skills’ timing ranges as defaults, then make deliberate exceptions for narration-led reveals or long systems diagrams; document any exception in the shot plan.
