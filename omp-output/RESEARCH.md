# Research: chat-system design and motion/rendering stack

This note records 28 numbered primary or first-party source entries (some entries group tightly related pages from the same first-party documentation set). The first 18 IDs intentionally preserve the source-ID numbering already used by `film.json`; the film file is not modified here. Claims are limited to what the cited source owns. All workload arithmetic and modeled thresholds are explicitly labeled assumptions. Limits, browser support, model availability, and license terms are time-sensitive and should be rechecked before release.

## Systems design (source IDs 1–18)

1. **The WebSocket Protocol — RFC 6455**  
   URL: https://www.rfc-editor.org/rfc/rfc6455.html  
   **Source-owned claim:** WebSocket defines a two-way communication channel over TCP, with an opening handshake and message framing. It defines control frames (including Ping/Pong and Close), masking, fragmentation, and protocol close codes.  
   **Boundary:** WebSocket supplies transport/framing semantics; this RFC does not provide durable storage, replay, application-level delivery guarantees, offline resume, or conversation authorization.

2. **WebSockets Standard — WHATWG**  
   URL: https://websockets.spec.whatwg.org/  
   **Source-owned claim:** The browser API exposes `bufferedAmount`; the standard describes it as the number of bytes queued by `send()` that have not yet been transmitted, and notes that it can be used to avoid sending faster than the network can handle.  
   **Boundary:** A queue-depth observation is not a durable queue or an end-to-end backpressure protocol. The application still needs bounded queues, admission control, and a policy for a slow connection.

3. **Implementing SLOs — Google SRE Workbook**  
   URL: https://sre.google/workbook/implementing-slos/  
   **Source-owned claim:** Google defines an SLO as a target level of reliability for a service’s customers and discusses choosing indicators/targets rather than treating 100% reliability as a realistic objective.  
   **Boundary:** An SLO is a measurable target, not a guarantee. A film’s example such as “200 ms p95 in one region” is a design goal/assumption unless measured.

4. **PostgreSQL indexes, uniqueness, and row-level locks — PostgreSQL documentation**  
   URLs:  
   - https://www.postgresql.org/docs/current/indexes-multicolumn.html  
   - https://www.postgresql.org/docs/current/ddl-constraints.html  
   - https://www.postgresql.org/docs/current/explicit-locking.html  
   **Source-owned claims:** PostgreSQL documents that a multicolumn B-tree index is most efficient when query conditions constrain its leading (leftmost) columns. A `UNIQUE` constraint on a column or group of columns automatically creates a unique B-tree index. `SELECT ... FOR UPDATE` locks selected rows as though for update and prevents conflicting writers/lockers until the transaction ends.  
   **Boundary:** These primitives can support history indexes, deduplication keys, and a serialized per-conversation counter, but serialization is not automatic: every allocator must lock the same counter row (or use an equivalent single owner) in the same transaction. Indexes do not themselves guarantee application-level ordering.

5. **Transactional outbox pattern — AWS Prescriptive Guidance**  
   URL: https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html  
   **Source-owned claim:** AWS identifies the dual-write problem (updating a database and publishing a message as separate operations) and describes writing the event to an outbox in the same transaction as business state, then publishing it asynchronously. It calls out duplicate delivery/retries and the need for idempotent consumers.  
   **Boundary:** An outbox closes the database/event-write atomicity gap; it does not by itself promise exactly-once effects at every downstream consumer.

6. **HTTP Semantics — RFC 9110 (idempotent methods)**  
   URL: https://www.rfc-editor.org/rfc/rfc9110.html  
   **Source-owned claim:** A request method is idempotent when multiple identical requests have the same intended effect on the server as one such request; this property permits clients to retry after a communication failure.  
   **Boundary:** The RFC defines HTTP method semantics, not a chat-command idempotency-key protocol. A chat `send` operation needs an explicit client-generated command ID and a server deduplication policy if retries must not create duplicate messages.

7. **Introduction / Core Concepts — Apache Kafka**  
   URL: https://kafka.apache.org/documentation/#intro_topics  
   **Source-owned claim:** Kafka topics are partitioned, and each partition is an ordered, immutable sequence of records. A producer chooses a partition (directly or through a key/partitioner).  
   **Boundary:** Ordering is per partition, not automatically global. A conversation key can preserve per-conversation order only if every related record is routed consistently and consumers preserve that partition order.

8. **Quotas for WebSocket APIs in Amazon API Gateway — AWS**  
   URL: https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-execution-service-websocket-limits-table.html  
   **Source-owned claim:** AWS says API Gateway does not enforce a fixed concurrent-connection quota; maximum concurrent connections is determined by the new-connection rate and a maximum connection duration of two hours.  
   **Boundary:** This is a service-specific limit, not a universal WebSocket capacity rule. It demonstrates why connection churn and concurrent sockets must be modeled separately from registered accounts.

9. **Redis Streams — Redis documentation**  
   URL: https://redis.io/docs/latest/develop/data-types/streams/  
   **Source-owned claim:** Redis Streams are an append-only log-like data type. Consumer groups track delivery and pending entries, and Streams commands provide acknowledgement and pending-entry inspection/claim operations.  
   **Boundary:** A stream can support replay/resume and work distribution, but retention, trimming, consumer recovery, and memory limits are deployment decisions; it is not an unbounded history.

10. **Redis Pub/Sub and expiration — Redis documentation**  
    URLs:  
    - https://redis.io/docs/latest/develop/pubsub/  
    - https://redis.io/docs/latest/commands/expire/  
    **Source-owned claims:** Redis explicitly documents Pub/Sub as at-most-once: a message is delivered once if at all, and a disconnected subscriber does not receive a replay. `EXPIRE` associates a timeout with a key; after the timeout expires, Redis automatically deletes the key.  
    **Boundary:** Pub/Sub is suitable as an ephemeral invalidation/fanout signal, not as the source of truth for offline history. TTL/expiration is appropriate for disposable state such as typing/presence, not a substitute for durable message retention; exact expiry timing and memory behavior remain operational concerns.

11. **What is Amazon S3? — AWS**  
    URL: https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html  
    **Source-owned claim:** AWS describes S3 as an object-storage service that stores data as objects in buckets.  
    **Boundary:** “Use object storage for media” is an architecture choice, not a claim that every attachment belongs in S3 or that a message row should never reference metadata. Access policy, lifecycle, encryption, and upload limits still need design.

12. **Use signed URLs / private content — Amazon CloudFront**  
    URLs:  
    - https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-signed-urls.html  
    - https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/PrivateContent.html  
    **Source-owned claim:** CloudFront documents signed URLs and signed cookies for restricting private content to authorized users and protecting the origin; it recommends trusted key groups for signing.  
    **Boundary:** A signed URL is a bearer capability with an expiry, not conversation authorization by itself. Validate the requesting user before issuing it, keep expiry scope narrow, and do not put secrets in URLs.

13. **Firebase Cloud Messaging message types — Google/Firebase**  
    URL: https://firebase.google.com/docs/cloud-messaging/customize-messages/set-message-type  
    **Source-owned claim:** FCM distinguishes notification messages (predefined user-visible keys with optional data) from data messages (application-controlled data payload). FCM’s messaging documentation positions notifications as a re-engagement mechanism and supports messaging use cases.  
    **Boundary:** Push is a platform notification channel, not the durable chat record. A notification may be delayed, collapsed, denied, or handled differently by platform/app state; fetch authoritative message history from the service after opening.

14. **Setting up a remote notification server — Apple UserNotifications/APNs**  
    URL: https://developer.apple.com/documentation/usernotifications/setting-up-a-remote-notification-server  
    **Source-owned claim:** Apple instructs a remote notification server to transmit a notification payload and device-token information to Apple Push Notification service (APNs).  
    **Boundary:** APNs delivery is distinct from durable message acceptance/read state. Treat a push as a wake-up or hint and fetch the authoritative message from durable service state.

15. **WebSocket Security Cheat Sheet — OWASP**  
    URL: https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html  
    **Source-owned claim:** OWASP says WebSockets do not provide built-in authentication, recommends validating the `Origin` header against an explicit allowlist on every handshake, and recommends message validation plus size/rate limits.  
    **Boundary:** Origin checks are not a substitute for authentication and authorization. Authorize each conversation/action, use TLS (`wss`), and avoid logging sensitive payloads or credentials.

16. **Queueing, overload, Little’s Law, retries, and jitter — AWS Builders’ Library**  
    URLs:  
    - https://builder.aws.com/content/3EvrN40SDLlwWk2K4QeK8i2cMVc/defeating-the-cascade-avoiding-insurmountable-queue-backlogs-in-high-burst-architectures  
    - https://builder.aws.com/content/3EumjoZascWd1oZiEgL8ORlv3qE/timeouts-retries-and-backoff-with-jitter  
    **Source-owned claims:** AWS describes Little’s Law as relating steady-state concurrency/in-flight work to arrival rate and time in system, and describes exponential backoff with jitter as a way to avoid synchronized retry load while handling transient failures. The queue-backlog material also emphasizes load shedding/bulkhead-style isolation when work cannot drain.  
    **Boundary:** `L = λW` is an average steady-state relationship, not a promise under overload or bursty traffic. Retries consume capacity; set bounded attempts, deadlines, and a policy for disposable work instead of retrying indefinitely.

17. **Multi-AZ DB instance deployments — Amazon RDS**  
    URL: https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZSingleStandby.html  
    **Source-owned claim:** AWS says an RDS Multi-AZ DB instance deployment provisions and maintains a synchronous standby replica in a different Availability Zone. AWS also distinguishes that standby from read replicas and says the standby cannot serve read traffic.  
    **Boundary:** This is a specific managed-service deployment model for AZ high availability, not a universal multi-region guarantee. It does not remove the need for backups, restore drills, or application failover testing.

18. **Log-shipping standby / streaming replication — PostgreSQL**  
    URL: https://www.postgresql.org/docs/current/warm-standby.html  
    **Source-owned claim:** PostgreSQL documents that streaming replication is asynchronous by default and that it permits a smaller window of data loss; its replication documentation distinguishes synchronous and asynchronous standby behavior.  
    **Boundary:** Asynchronous cross-region replication can leave acknowledged recent writes only on the failed primary. If zero loss is required for a stated failure boundary, acknowledgment must include the required synchronous/quorum durability, which adds latency and can reduce availability during a partition.

## Motion, animation, audio, and rendering (source IDs 19–28)

19. **GSAP 3.13 release — official GSAP**  
    URL: https://gsap.com/blog/3-13/  
    **Source-owned claim:** The 3.13 announcement says GSAP is “100% FREE,” including bonus plugins, and “FREE, even for commercial use.” It says the formerly bonus plugins were added to the public repository/NPM package.  
    **Boundary:** This is a release announcement, not permission to omit license review; pin the intended version and check the current license before distribution.

20. **Standard “No Charge” GSAP License — official GSAP/Webflow**  
    URL: https://gsap.com/community/standard-license/  
    **Source-owned claim:** The standard license grants a non-exclusive, worldwide license for permitted uses, and its FAQ states commercial usage is covered at no charge. It also defines prohibited use involving a competing visual animation-builder product.  
    **Boundary:** “Commercial use is free” is not “all uses are permitted.” Preserve the license text with the deliverable and recheck terms when upgrading.

21. **Three.js license — official repository**  
    URL: https://github.com/mrdoob/three.js/blob/dev/LICENSE  
    **Source-owned claim:** Three.js is distributed under the MIT License, which permits use, copying, modification, publication, distribution, sublicensing, and sale subject to retaining the copyright and permission notice; it disclaims warranty/liability.  
    **Boundary:** Track licenses for loaders, fonts, textures, models, and other assets separately from Three.js itself.

22. **Scroll-driven Animations — W3C specification**  
    URL: https://www.w3.org/TR/scroll-animations-1/  
    **Source-owned claim:** The specification defines scroll progress timelines and view progress timelines whose animation progress is driven by scrolling rather than elapsed document time, with CSS and Web Animations API mechanisms.  
    **Boundary:** Browser support and behavior should be feature-tested for the target renderer; deterministic video capture should not depend on an interactive user scroll gesture.

23. **CSS View Transitions Module Level 1 — W3C specification**  
    URL: https://www.w3.org/TR/css-view-transitions-1/  
    **Source-owned claim:** The module defines transitions between old and new rendered states, including snapshots/pseudo-elements and same-document transition machinery.  
    **Boundary:** A transition API is a compositing mechanism, not a guarantee of identical pixels across browsers or capture environments. Freeze fonts, viewport, timing, and reduced-motion behavior for deterministic frames.

24. **Lottie Web — official Airbnb repository README**  
    URL: https://raw.githubusercontent.com/airbnb/lottie-web/master/README.md  
    **Source-owned claim:** Lottie parses After Effects animations exported as Bodymovin JSON and renders them on Web; the Web player supports SVG, Canvas, and HTML renderers, and exposes playback controls such as play, pause, and speed. The README warns that too many nodes can hurt real-time performance.  
    **Boundary:** “JSON instead of a GIF” does not make every animation cheap. Test node count, renderer choice, fonts/assets, and seekability in the actual capture browser.

25. **HyperFrames repository — official HeyGen source**  
    URL: https://github.com/heygen-com/hyperframes  
    **Source-owned claim:** HyperFrames describes itself as an open-source framework for turning HTML, CSS, media, and seekable animations into deterministic MP4 videos; the repository identifies Apache License 2.0 and lists Node.js/FFmpeg requirements.  
    **Boundary:** Deterministic output still requires deterministic inputs: pin assets/dependencies, control clocks/timelines, wait for fonts/media, and avoid random/network-dependent animation state.

26. **Remotion license and terms — official Remotion**  
    URL: https://www.remotion.dev/docs/license  
    **Source-owned claim:** Remotion’s license pages distinguish free-license eligibility (including some individual/small-company commercial use) from cases requiring a company license and describe commercial-use terms/pricing.  
    **Boundary:** Eligibility depends on the current terms and organization/use case. Do not assume that using an open-source package means every company render is license-free; record the decision and recheck before shipping.

27. **Text-to-speech generation (TTS) — Gemini API**  
    URL: https://ai.google.dev/gemini-api/docs/speech-generation  
    **Source-owned claim:** Google documents Gemini TTS generation for single-speaker and multi-speaker audio, with prompt control for speech style; the API documentation describes PCM/mono/24 kHz defaults and response-format configuration.  
    **Boundary:** Model names, preview status, quotas, voice availability, output encoding, and terms can change. Cache approved audio and keep the narration script/time map as the reproducible source, rather than requiring a live API call during rendering.

28. **Screenshots — Playwright documentation**  
    URL: https://playwright.dev/docs/screenshots  
    **Source-owned claim:** Playwright documents capturing page screenshots to files and options for image format, quality, clipping, and full-page capture; its visual-comparison guidance waits for consecutive screenshots to stabilize before comparison.  
    **Boundary:** Screenshot capture is not automatically frame-accurate video rendering. Set viewport/device scale, freeze or seek animation time, wait for fonts/assets, and use a fixed frame clock before encoding the PNG sequence.

## Explicitly illustrative workload arithmetic (not sourced facts)

These numbers are film-friendly examples only; they are assumptions to show why “1,000,000 registered users” is not a capacity plan. Replace every assumption with measured product traffic and chosen SLOs before sizing.

- Registered accounts: **1,000,000** (the scenario’s fixed headline number).
- Daily active users: **200,000** (assumed).
- Concurrent connections: **50,000** (assumed; 5% of registered accounts).
- Messages: **20 messages per active user per day** (assumed) → `200,000 × 20 = 4,000,000 messages/day` → `4,000,000 ÷ 86,400 ≈ 46.3 writes/s` average.
- Ten-times peak: `46.3 × 10 ≈ 463 writes/s` (the film rounds this to roughly 460).
- Eight recipient deliveries per message (assumed) → `463 × 8 ≈ 3,704 deliveries/s` at that modeled peak.
- This arithmetic intentionally does **not** claim that 200,000 DAU, 50,000 sockets, 20 messages/day, 10× peak, or eight recipients are realistic. They are visible knobs: concurrent sockets, active senders, fanout, payload bytes, reconnect bursts, retention, and regional-failure behavior.
- Other film arithmetic is also labeled assumption: 50,000 × 32 KiB ≈ 1.53 GiB of socket state before runtime/TLS overhead; 4,000,000 × 1 KiB ≈ 4 GB/day and ≈360 GB over 90 days before indexes/replicas/backups/attachments; and `460 × 0.2 ≈ 92` in-flight requests under Little’s Law. The last equation is illustrative steady-state arithmetic, not a benchmark.

## Exact `film.json` scene → source-ID map

The existing `film.json` `sources` arrays remain unchanged. This map adds IDs where the narration needs more precise direct support and marks modeled arithmetic/synthesis explicitly. A source ID is included only where the cited source directly supports the adjacent factual claim; architectural choices remain labeled as choices.

| Scene ID | Exact source IDs for narrated claims | Assumptions / uncovered synthesis |
|---|---|---|
| `opening` | `[1]` — WebSocket is a two-way communication channel; system-design promise framing is narration. | “A million people” is the scenario, not a measured traffic claim. |
| `promises` | `[1, 3, 5, 9]` — live transport; measurable SLO target; durable outbox acceptance; replayable stream/catch-up primitive. | The example “200 ms p95 in one region” is an explicit design goal, not a source fact; delivery/read/acceptance as separate domain events are design language. |
| `workload` | `[]` | Every number is explicitly illustrative assumptions: 200k DAU, 50k concurrent, 20 messages/user/day, 10× peak, eight recipients. |
| `baseline` | `[1, 4, 11]` — WebSocket live path; PostgreSQL conversation/sequence index primitive; S3 object storage for uploads. | “One database may be enough” is a modeled hypothesis requiring measurement; service shape and ordinary history/upload requests are architecture choices. |
| `durability` | `[5, 6]` — transactional outbox and retry-safe idempotent semantics. | Authentication/membership checks, acknowledgment timing, relay topology, and duplicate-tolerant consumers are design requirements; source 5 explicitly warns about duplicate delivery. |
| `ordering` | `[4, 6, 7]` — uniqueness and row locking; idempotent retry semantics; per-partition order. | A specific per-conversation counter schema and client-message-ID scope are proposed design choices; receipts being separate state is domain modeling. |
| `gateways` | `[1, 2, 8]` — WebSocket transport; browser send-buffer observation; service-specific connection/churn limits. | 50,000 × 32 KiB ≈ 1.5 GiB, load-balancer layout, gateway mapping, heartbeats/file descriptors, and headroom are assumptions/engineering work, not source guarantees. |
| `fanout` | `[7, 9]` — keyed partition order and durable stream/consumer-group primitive. | Recipient expansion, small-vs-giant-room strategy, shared-log cursor reads, and “hot room” behavior are recommended architecture choices; fanout arithmetic is modeled. |
| `offline` | `[4, 9, 10]` — indexed durable history; Streams replay/pending model; Pub/Sub at-most-once limitation. | The contiguous cursor/merge algorithm and gap-free-prefix rule are proposed protocol design, not directly prescribed by Redis. |
| `storage` | `[4, 11, 12]` — PostgreSQL multicolumn/unique-index primitives; S3 objects; CloudFront signed private-content URLs. | 1 KiB/message, 4 GB/day, 360 GB/90 days, sharding/time buckets/hot-conversation policy, and “never put video bytes in row” are assumptions/choices. |
| `ephemeral` | `[10, 13, 14, 15]` — Redis at-most-once plus key expiration; FCM message types; APNs server/device-token flow; WebSocket security controls. | Debouncing/aggregation, platform behavior, retention, E2E encryption/key management, and “fetch authoritative message” are product/architecture guidance; pushes are deliberately not treated as durable records. |
| `overload` | `[2, 8, 16]` — buffered bytes; connection/churn quotas; AWS Little’s Law/queue-backlog/retry-jitter guidance. | 460 req/s, 0.2 s, 92 in flight, queue bounds, retry limits, and which typing signals to drop are modeled policy choices. |
| `regions` | `[17, 18]` — RDS Multi-AZ synchronous standby model; PostgreSQL asynchronous streaming replication and loss window. | Home-region routing, quorum acknowledgment, exact RPO/RTO, and availability/latency tradeoff are architecture policy. “Can lose recently accepted writes” applies to the stated asynchronous failure boundary, not every replication system. |
| `operate` | `[3, 8, 16]` — SLO target framing; connection-limit/capacity dimension; queue isolation/backoff/load-shedding guidance. | The metric set, load tests, failure drills, and “capacity is evidence” conclusion are recommended operations practice. |
| `closing` | `[]` — synthesis of the earlier cited claims. | No new externally sourced fact is introduced; “smallest system” and growth sequence are the film’s design thesis. |

## Recommended narrative cautions

- Present WebSocket as the live pipe, not the message database. The durable path should be explicit: transactional state + outbox, partitioned stream, idempotent consumers, then ephemeral gateway fanout.
- Never narrate “exactly once” without naming the boundary. Database uniqueness, producer idempotence, queue deduplication, and client-visible effects are different guarantees.
- Say **per-conversation ordering** only when the same conversation key maps to one ordered partition/sequence and clients reconcile a cursor or sequence number. Do not imply global ordering.
- Show Redis Pub/Sub as a low-latency signal/fanout layer and Streams/durable storage as the replayable path. Offline resume needs durable history plus a cursor; a disconnected Pub/Sub subscriber cannot replay what it missed.
- Keep “1,000,000 registered” visually separate from measured workload. Animate concurrent sockets, message rate, fanout, payload bytes, reconnect storms, retention, and failure-region assumptions as independent knobs.
- Keep PostgreSQL index/lock claims precise: a multicolumn B-tree helps when leading columns are constrained; a unique constraint creates a unique index; row locking serializes only transactions that lock the same row/resource.
- Keep object storage/CDN claims precise: S3 stores objects, and CloudFront signed URLs restrict private content; neither one replaces authorization, expiry, encryption, or retention policy.
- Treat typing/presence TTL and mobile push as disposable hints. The accepted message remains in the durable service, and the client fetches history after a push/open/reconnect.
- Frame multi-region as a policy choice (latency, consistency, failover, conflict handling), not an automatic upgrade. Distinguish RDS Multi-AZ synchronous standby from PostgreSQL asynchronous streaming and state the possible loss window.
- Make the SLO concrete and observable, and show its error budget. Avoid promising 100% availability or hiding overload behavior; show bounded queues, rate limits, shedding/backoff, and recovery.
- Treat Origin validation, authentication, authorization, message validation, TLS, and rate/size limits as first-class security beats, not postscript labels.
- For the film pipeline, use pinned versions/licenses, fixed viewport/fonts/assets, an explicit frame clock, and cached TTS. Feature-test browser APIs and keep deterministic frame capture separate from scroll-driven interaction demos.
