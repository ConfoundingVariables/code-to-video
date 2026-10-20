# Scaling a chat app from 1 to 1,000,000 users: primary sources

Research date: 2026-10-12. Every bullet under "Facts" was read on the fetched page (PDFs were text-extracted and grepped). Anything not confirmed on the page is tagged **[UNVERIFIED]**. Arithmetic I derived myself is tagged **[derived]**.

Topic key: T1 capacity math, T2 transport, T3 app tier / LB / gateway, T4 pub/sub fan-out, T5 storage / IDs, T6 caching / sharding, T7 delivery semantics / sync, T8 presence / backpressure / rate limiting / herds, T9 push, T10 observability / multi-region.

---

## Sources

### 1. Little's Law as Viewed on Its 50th Anniversary (T1)
- John D. C. Little, *Operations Research* 59(3), May-June 2011, pp. 536-549. doi:10.1287/opre.1110.0940
- URL: https://people.cs.umass.edu/~emery/classes/cmpsci691st/readings/OS/Littles-Law-50-Years-Later.pdf
- Facts:
  - "the average number of items in a queuing system, denoted L, equals the average arrival rate of items to the system, λ, multiplied by the average waiting time of an item in the system, W. Thus, L = λW."
  - The original proof: Little, J. D. C. 1961, "A proof for the queuing formula: L = λW", *Oper. Res.* 9(3) 383-387.
  - Worked example for the video **[derived]**: 10,000 requests/s × 0.1 s average latency = 1,000 requests in flight. For chat, 1,000,000 online users each holding a connection the whole session means L = 1,000,000 open sockets, whatever the message rate.

### 2. The C10K problem (T1, T2)
- Dan Kegel, kegel.com. Original content about 1999-2001; page last updated 5 Feb 2014 (minor fix 28 May 2019).
- URL: http://www.kegel.com/c10k.html
- Facts:
  - "It's time for web servers to handle ten thousand clients simultaneously, don't you think?"
  - "You can buy a 1000MHz machine with 2 gigabytes of RAM and an 1000Mbit/sec Ethernet card for $1200 or so", and "at 20000 clients, that's 50KHz, 100Kbytes, and 50Kbits/sec per client."
  - Lists I/O strategies: one thread per client (memory per stack; struggles beyond a few hundred to a few thousand threads) vs one thread serving many clients with select/poll/epoll/kqueue readiness notification, or async I/O (IOCP).

### 3. RFC 6202: Known Issues and Best Practices for the Use of Long Polling and Streaming in Bidirectional HTTP (T2)
- IETF, Informational, April 2011.
- URL: https://www.rfc-editor.org/rfc/rfc6202
- Facts:
  - Long polling: the server "attempts to 'hold open' (not immediately reply to) each HTTP request" until events are ready.
  - Overhead: "every long poll request and long poll response is a complete HTTP message", so headers can dominate small messages. Worst-case latency is "over three network transits".
  - Timeouts: browser default is 300 seconds; experiments succeeded with "timeouts as high as 120 seconds"; "generally 30 seconds is a safer value".
  - Connection limits: HTTP originally recommended no more than 2 connections per server; browsers have raised this to about 6 or 8.

### 4. RFC 6455: The WebSocket Protocol (T2)
- IETF Standards Track, December 2011. I. Fette (Google), A. Melnikov (Isode).
- URL: https://www.rfc-editor.org/rfc/rfc6455
- Facts:
  - Motivation: historically, bidirectional web apps required "an abuse of HTTP to poll the server for updates", and "each client-to-server message having an HTTP header". The fix: "a single TCP connection for traffic in both directions."
  - Handshake: the client sends an HTTP Upgrade request; the server answers "HTTP/1.1 101 Switching Protocols". Sec-WebSocket-Accept = base64(SHA-1(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")).
  - Ping is opcode 0x9 and Pong is 0xA; an endpoint "MUST send a Pong frame in response" to a Ping (used for heartbeats).
  - Payload length is "7 bits, 7+16 bits, or 7+64 bits". A 2-byte minimum frame header follows from the diagram but the RFC does not state it in words **[derived]**.

### 5. HTML Living Standard: Server-sent events (T2)
- WHATWG, living standard.
- URL: https://html.spec.whatwg.org/multipage/server-sent-events.html
- Facts:
  - `EventSource` lets servers "push data to web pages over HTTP"; MIME type `text/event-stream`, always UTF-8.
  - On reconnect, the browser sends `Last-Event-ID` so the server can resume. The `retry` field sets the reconnection time (default "probably in the region of a few seconds").
  - Legacy proxies drop idle connections, so "authors can include a comment line (one starting with a ':' character) every 15 seconds or so."
  - Server to client only, and it warns about HTTP's per-server connection limit when several tabs each open an EventSource.

### 6. 1 million is so 2011 (T1, T2)
- WhatsApp Blog, January 6, 2012.
- URL: https://blog.whatsapp.com/1-million-is-so-2011
- Facts:
  - The servers can "easily push our systems to over 2 million tcp connections"; sysctl shows `kern.ipc.numopensockets: 2277845`.
  - One box: Intel Xeon X5675 @ 3.07GHz, `hw.ncpu: 24`, `hw.physmem: 103062118400` (about 96 GiB **[derived]**).
  - Stack: FreeBSD 8.2-STABLE amd64, Erlang R14B03 (smp:24:24).

### 7. The Road to 2 Million Websocket Connections in Phoenix (T2, T4)
- Gary Rennie, Phoenix Framework blog, November 3, 2015.
- URL: https://www.phoenixframework.org/blog/the-road-to-2-million-websocket-connections
- Facts:
  - 2 million concurrent WebSocket connections on one 40-core, 128 GB server, "limited by ulimit".
  - Earlier runs: about 450k on a 4-core, 15 GB box (ran out of memory), then 1 million on the 128 GB box.
  - Broadcasting to 1.3M subscribers took over 5 seconds; sharding the pub/sub cut it to 1-2 s, and a pubsub pool held 1-second broadcasts at 2M subscribers.
  - Each Tsung load-generator machine produced about 40k-60k connections, so dozens of client machines were needed.

### 8. Real-time Messaging (T3, T4, T8, T10)
- Sameera Thangudu, Slack Engineering, April 11, 2023.
- URL: https://slack.engineering/real-time-messaging/
- Facts:
  - Slack "delivers messages across the world in 500ms" to "tens of millions of connected clients".
  - Channel Servers are stateful and in-memory; channels map to hosts via consistent hashing. "At peak times, about 16 million channels are served per host." A replacement CS "is ready to serve traffic in under 20 seconds."
  - Gateway Servers hold user info and WebSocket subscriptions and are the only tier "deployed across multiple geographical regions". Presence Servers: users are hashed to individual PSs. Admin Servers are stateless.
  - Clients connect to the nearest edge region, where Envoy forwards to a GS. GS regional draining moves users from a failed region to the nearest healthy one. Traffic peaks around 11am and 2pm local time.

### 9. Migrating Millions of Concurrent Websockets to Envoy (T3)
- Ariane van der Steldt and Radha Kumari, Slack Engineering, March 15, 2021 (updated June 21, 2021).
- URL: https://slack.engineering/migrating-millions-of-concurrent-websockets-to-envoy/
- Facts:
  - "millions of simultaneously connected users at peak times" behind HAProxy in multiple AWS regions.
  - Long-lived WebSockets meant old HAProxy processes ran "for many hours" after reloads to let connections drain. Envoy applies endpoint changes without reloads and hot-restarts "without dropping any connections".
  - Traffic moved per region in steps of 10%, 25%, 50%, 75%, 100%. The migration started in 2019, took about 6 months, and roughly doubled resource use while it ran.

### 10. Flannel: An Application-Level Edge Cache to Make Slack Scale (T3, T6, T8)
- Bing Wei, Slack Engineering, May 31, 2017 (updated June 26, 2020).
- URL: https://slack.engineering/flannel-an-application-level-edge-cache-to-make-slack-scale/
- Facts:
  - The old `rtm.start` sent "a full snapshot of a team's data" at connect time. Flannel caches users and channels at the edge and serves them lazily.
  - Startup payload shrank 7× for a 1.5K-user team and 44× for a 32K-user team. Presence events reaching clients fell by a factor of 5 after moving to pub/sub.
  - Peak: 4 million simultaneous connections and 600K client queries per second. Team/user affinity is kept with consistent hashing.

### 11. How Discord Scaled Elixir to 5,000,000 Concurrent Users (T3, T4, T8)
- Stanislav Vishnevskiy, Discord Blog, July 6, 2017.
- URL: https://discord.com/blog/how-discord-scaled-elixir-to-5-000-000-concurrent-users
- Facts:
  - "nearly five million concurrent users" and "millions of events per second".
  - Each guild (server) is a process that fans out to member sessions. One `send/2` took 30-70 μs, so publishing to a 30,000-user guild took 900 ms to 2.1 s. Manifold batches sends per remote node, calling `send/2` at most once per node.
  - Each Erlang VM holds "up to 500,000 live sessions"; the average user is in 5 guilds.
  - After a session-server restart, hash-ring lookups would take about 30 s. ETS brought this to 17.5 s and FastGlobal (0.3 μs per lookup) to 750 ms. A semaphore lets sessions skip registry calls that are bound to fail.

### 12. Maxjourney: Pushing Discord's Limits with a Million+ Online Users in a Single Server (T4, T8)
- Yuliy Pisetsky, Discord Blog, October 25, 2023.
- URL: https://discord.com/blog/maxjourney-pushing-discords-limits-with-a-million-plus-online-users-in-a-single-server
- Facts:
  - Midjourney had "over 10 million members, of whom over 1 million are online".
  - Fan-out grows quadratically: with 1,000 online users, one message each to everyone produces 1 million notifications; 10,000 gives 100 million; 100,000 gives 10 billion.
  - "around 90% of user-guild connections in large servers were passive", so passive sessions made fan-out "90% less expensive".
  - Relays split the fan-out: "We handle up to 15,000 connected sessions per relay."

### 13. How Discord Reduced Websocket Traffic by 40% (T2, T8)
- Austin Whyte, Discord Blog, September 20, 2024.
- URL: https://discord.com/blog/how-discord-reduced-websocket-traffic-by-40-percent
- Facts:
  - Moving gateway compression from zlib (in use since late 2017) to streaming zstandard raised the MESSAGE_CREATE compression ratio "from 6 to almost 10".
  - A READY payload of 2,517,725 bytes compresses to 306,745 bytes with zstandard.
  - Passive Update V1 was about 35% of gateway traffic but only about 2% of dispatches. V2 cut it to 5%.
  - zstandard plus Passive Sessions V2 reduced client gateway bandwidth "by almost 40%" (rolled out April-May 2024).

### 14. How Discord Stores Billions of Messages (T5)
- Discord Blog, January 13, 2017.
- URL: https://discord.com/blog/how-discord-stores-billions-of-messages
- Facts:
  - Discord was "built in just under two months in early 2015" on a single MongoDB replica set. By November 2015, at 100 million stored messages, data and index outgrew RAM and latencies became unpredictable.
  - Volume: 40M messages/day in July, 100M/day in December, over 120M/day by January 2017. Read/write ratio "about 50/50".
  - Cassandra primary key `((channel_id, bucket), message_id)`, where message_id is a Snowflake. Buckets of about 10 days keep partitions under 100 MB (Cassandra supports 2 GB).
  - 12 nodes, replication factor 3, nearly 1 TB compressed per node. Writes sub-millisecond, reads under 5 ms. 4 backend engineers.

### 15. How Discord Stores Trillions of Messages (T5, T6)
- Discord Blog, March 6, 2023.
- URL: https://discord.com/blog/how-discord-stores-trillions-of-messages
- Facts:
  - Grew from 12 Cassandra nodes (2017) to 177 nodes holding "trillions of messages" (early 2022), then migrated to 72 ScyllaDB nodes (about 9 TB per node vs about 4 TB per Cassandra node). Cutover May 2022.
  - p99 historical-message reads went from 40-125 ms to 15 ms; p99 inserts from 5-70 ms to a steady 5 ms.
  - Rust data services route by channel ID with consistent hashing and do request coalescing: concurrent requests for the same row hit the database once.
  - The Rust migrator peaked at 3.2 million messages per second and took 9 days (vs about 3 months estimated for the Spark migrator).

### 16. Snowflake (Twitter's ID generator), README on the snowflake-2010 branch (T5, T7)
- Twitter, GitHub `twitter-archive/snowflake`, 2010.
- URL: https://github.com/twitter-archive/snowflake/tree/snowflake-2010
- Facts:
  - Requirements: "minimum 10k ids per second per process", "response rate 2ms (plus network latency)", "we need to keep our ids under 64bits."
  - Layout: "time - 41 bits (millisecond precision w/ a custom epoch gives us 69 years)", "configured machine id - 10 bits - gives us up to 1024 machines", "sequence number - 12 bits - rolls over every 4096 per machine".
  - IDs are "k-sorted" (roughly time-ordered), which lets them serve as sort keys.
- Note: the original announcement (blog.x.com/engineering/en_us/a/2010/announcing-snowflake) returned HTTP 403 and was **not read**.

### 17. Consistent Hashing and Random Trees: Distributed Caching Protocols for Relieving Hot Spots on the World Wide Web (T6)
- Karger, Lehman, Leighton, Levine, Lewin, Panigrahy (MIT).
- URL: https://www.akamai.com/site/en/documents/research-paper/consistent-hashing-and-random-trees-distributed-caching-protocols-for-relieving-hot-spots-on-the-world-wide-web-technical-publication.pdf
- Facts:
  - "a consistent hash function is one which changes minimally as the range of the function changes."
  - Monotonicity: when new buckets are added, "an item may move from an old bucket to a new bucket, but not from one old bucket to another."
  - Motivation: "Hot spots occur any time a large number of clients wish to simultaneously access data from a single server."
- Venue (ACM STOC 1997) is not printed in the extracted text **[UNVERIFIED on page]**.

### 18. Dynamo: Amazon's Highly Available Key-value Store (T6, T7)
- DeCandia et al., SOSP '07, October 14-17, 2007, Stevenson, Washington.
- URL: https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf
- Facts:
  - Example SLA: "a response within 300ms for 99.9% of its requests for a peak client load of 500 requests per second." Amazon designs to the 99.9th percentile, not the mean.
  - Consistent hashing with "virtual nodes": each node takes multiple positions ("tokens") on the ring, so a failed node's load "is evenly dispersed across the remaining available nodes."
  - Quorums: R + W > N; "The common (N,R,W) configuration used by several instances of Dynamo is (3,2,2)." Also vector clocks, sloppy quorum, and hinted handoff.
  - Scale: the shopping cart served "tens of millions requests that resulted in well over 3 million checkouts in a single day".

### 19. Scaling Memcache at Facebook (T6, T8, T10)
- Nishtala et al., NSDI '13 (USENIX), 2013.
- URL: https://www.usenix.org/system/files/conference/nsdi13/nsdi13-final170_update.pdf
- Facts:
  - "handles billions of requests per second and holds trillions of items" for over a billion users. Memcache is used as a "demand-filled look-aside cache".
  - Leases fix stale sets and thundering herds. Servers "return a token only once every 10 seconds per key"; other clients wait briefly and retry.
  - Measured over one week of herd-prone keys: peak DB query rate was "17K/s" without leases and "1.3K/s" with them.
  - Multi-region: co-located clusters form a region, and a "master region" streams updates to keep non-master regions current.

### 20. Redis Pub/Sub documentation (T4)
- Redis, official docs.
- URL: https://redis.io/docs/latest/develop/pubsub/
- Facts:
  - "Redis' Pub/Sub exhibits at-most-once message delivery semantics... If the subscriber is unable to handle the message (for example, due to an error or a network disconnect) the message is forever lost." For stronger guarantees use Redis Streams (at-least-once).
  - Sharded Pub/Sub (Redis 7.0+, SSUBSCRIBE/SPUBLISH) keeps messages within a shard, whereas global Pub/Sub sends "each message propagates to each node in the cluster". This lets Pub/Sub scale horizontally by adding shards.
  - "Subscribers receive the messages in the order that the messages are published."

### 21. Apache Kafka documentation: Design, Message Delivery Semantics (T4, T7)
- Apache Software Foundation, Kafka 3.9 docs.
- URL: https://kafka.apache.org/39/design/design/ (section "Message Delivery Semantics")
- Facts:
  - At most once: "Messages may be lost but are never redelivered." At least once: "Messages are never lost but may be redelivered." Exactly once: "each message is delivered once and only once."
  - "Kafka guarantees at-least-once delivery by default."
  - Idempotent producer (since 0.11.0.0): "the broker assigns each producer an ID" and "deduplicates messages using a sequence number."
  - A topic is "a set of totally ordered partitions, each of which is consumed by exactly one consumer within each subscribing consumer group at any given time". Keying by conversation ID gives per-conversation ordering.

### 22. Designing robust and predictable APIs with idempotency (T7)
- Brandur Leach, Stripe Blog, February 22, 2017.
- URL: https://stripe.com/blog/idempotency
- Facts:
  - The client "generates a unique ID to identify just that operation" and sends it as `Idempotency-Key` (e.g. `AGJ6FJMkGQIpHUTX`). Retries reuse the key so the side effect happens once.
  - Retry with exponential backoff, waiting proportionally to `2^n` after n failures, plus jitter to avoid a thundering herd.

### 23. Building Mobile-First Infrastructure for Messenger (T7, T9)
- Jeremy Fein, Engineering at Meta, October 9, 2014.
- URL: https://engineering.fb.com/2014/10/09/production-engineering/building-mobile-first-infrastructure-for-messenger/
- Facts:
  - "Iris is a totally ordered queue of messaging updates" (new messages and read-state changes). Each consumer (the phone, the storage tier) has its own pointer that advances only after successful delivery, so offline phones resume where they left off.
  - Clients fetch one snapshot over HTTPS, then receive "delta updates, which are immediately pushed to the app through MQTT."
  - Results: non-media data usage cut "by about 40%"; "roughly a 20% decrease in the number of people who experience errors when trying to send a message"; Thrift halved payload size vs JSON.
  - Recent messages are served from Iris memory, the last week from MySQL/flash, and older history from disk.

### 24. Why Discord is switching from Go to Rust (Read States service) (T7)
- Jesse Howarth, Discord Blog, February 4, 2020.
- URL: https://discord.com/blog/why-discord-is-switching-from-go-to-rust
- Facts:
  - Read States tracks "which channels and messages you have read", one per user per channel: billions in total.
  - Each server's LRU cache holds millions of users and tens of millions of Read States, with hundreds of thousands of cache updates per second and tens of thousands of Cassandra writes per second. A commit is scheduled 30 s after each update (write batching).
  - Go's forced GC caused "latency and CPU spikes roughly every 2 minutes". The Rust rewrite removed them and the cache grew to 8 million Read States.

### 25. Scaling your API with rate limiters (T8)
- Paul Tarjan, Stripe Blog, March 30, 2017.
- URL: https://stripe.com/blog/rate-limiters
- Facts:
  - "We use the token bucket algorithm to do rate limiting" and "We implement our rate limiters using Redis." Respond with HTTP 429 or 503.
  - Four layers: request-rate limiter (N req/s per user), concurrent-requests limiter (example: 20 in flight), fleet-usage load shedder (example: reserve 20% for critical traffic and reject non-critical requests above 80% with 503), and worker-utilization load shedder.
  - The final-line shedder rejected "Only 100 requests ... this month".

### 26. Timeouts, retries, and backoff with jitter (T8)
- Marc Brooker (Amazon Builders' Library, now on builder.aws.com; page shows publication June 12, 2026 for the repost).
- URL: https://builder.aws.com/content/3EumjoZascWd1oZiEgL8ORlv3qE/timeouts-retries-and-backoff-with-jitter (redirected from aws.amazon.com/builders-library/...)
- Facts:
  - In a 5-deep call stack, "If each layer retries independently, the load on the database will increase 243x". Retry at a single layer.
  - Timeout choice: pick an acceptable false-timeout rate (e.g. 0.1%) and use the matching downstream percentile (p99.9).
  - Retries are limited by a local token bucket (in AWS SDKs since 2016). "Jitter adds some amount of randomness to the backoff to spread the retries around in time."
- Note: the page byline reads "Marc"; the full surname is from the original Builders' Library attribution and was not shown in the fetched text **[UNVERIFIED on page]**.

### 27. Google SRE Book, Chapter 21: Handling Overload (T8)
- Google, *Site Reliability Engineering* (O'Reilly, 2016), free online.
- URL: https://sre.google/sre-book/handling-overload/
- Facts:
  - Client-side adaptive throttling: clients reject locally once `requests` exceeds K × `accepts` over 2 minutes (K = 2 typical).
  - Retry budgets: at most 3 attempts per request, and retries only while the per-client retry ratio is below 10%. Worst-case load amplification drops from "just under 3X" to about 1.1X.
  - Criticality classes (CRITICAL_PLUS, CRITICAL, SHEDDABLE_PLUS, SHEDDABLE) let overloaded tasks shed the least important traffic first.
  - Per-customer quotas example: Gmail 4,000 CPU-s/s, Android 3,000, and so on, on a 10,000-CPU backend, deliberately oversubscribed.

### 28. How Discord Handles Push Request Bursts of Over a Million per Minute with Elixir's GenStage (T8, T9)
- Jesse Howarth, Discord Blog, December 12, 2016.
- URL: https://discord.com/blog/how-discord-handles-push-request-bursts-of-over-a-million-per-minute-with-elixirs-genstage
- Facts:
  - "Firebase requires that each XMPP connection has no more than 100 pending requests at a time." Each Pusher (consumer) demands 100 at a time from a per-machine Push Collector (producer). This is demand-driven backpressure.
  - When the buffer fills, the collector sheds (drops) push requests, "about once a month in catastrophic situations". The example incident recovered in about 2.5 minutes.
  - Trigger example: the /r/Overwatch server "just passed 25,000 concurrent users".
  - "over a million per minute" appears only in the title; the body gives no per-minute figure **[title claim only]**.

### 29. Sending notification requests to APNs (T9)
- Apple Developer Documentation (read via the page's JSON data endpoint, since the HTML is JavaScript-rendered).
- URL: https://developer.apple.com/documentation/usernotifications/sending-notification-requests-to-apns
- Facts:
  - "Use HTTP/2 and TLS 1.2 or later" to `api.push.apple.com:443` (port 2197 is an alternative). "Reuse a connection as long as possible... for many hours to days"; open multiple connections for high volume.
  - Payload "limited to a maximum size of 4 KB (4096 bytes)"; VoIP 5 KB (5120 bytes). `apns-collapse-id` "must not exceed 64 bytes".
  - "APNs may reorder notifications you send to the same device token". If the device is offline, APNs "may store the notification for 30 days or less", and "APNs stores only one notification per bundle ID". Push is a hint, not a delivery log.
  - JWT token-refresh cadence (20 min / 1 h) was not found in the fetched text **[UNVERIFIED]**.

### 30. Firebase Cloud Messaging: Setting the lifespan of a message (T9)
- Google Firebase docs.
- URL: https://firebase.google.com/docs/cloud-messaging/customize-messages/setting-message-lifespan
- Facts:
  - TTL range "0 to 2,419,200 seconds (28 days)"; the default is a maximum of four weeks. TTL 0 means deliver now or discard.
  - If the device is offline, "the message is stored until a connection is established". If an Android device hasn't connected for more than one month, FCM "still accepts the message but immediately discards it."
  - Collapsible messages: a new message with the same `collapse_key` replaces the pending one.
  - The "100 stored non-collapsible messages" and "4 collapse keys" limits are not on this page **[UNVERIFIED]**.

### 31. Google SRE Book, Chapter 6: Monitoring Distributed Systems (T10)
- Google, *Site Reliability Engineering* (2016).
- URL: https://sre.google/sre-book/monitoring-distributed-systems/
- Facts:
  - The four golden signals are latency, traffic, errors, and saturation; "a slow error is even worse than a fast error."
  - Tail example: 100 ms average at 1,000 req/s, where "1% of requests might easily take 5 seconds". Also, "the 99th percentile of one backend can easily become the median response of your frontend."
  - Use histogram buckets spaced by factors of about 3 (0-10 ms, 10-30, 30-100, 100-300 ms).

---

## Narrative spine (10 scenes, 1 user to 1,000,000)

| # | Users | Scene | Key on-screen number / fact | Source |
|---|---|---|---|---|
| 1 | 1 | **One box, one database.** Define capacity with Little's law: open connections = arrival rate × time in system. For chat, every online user *is* a long-lived "request". | `L = λW`. 10,000 req/s × 0.1 s = 1,000 in flight **[derived]**. In ~1999, "ten thousand clients simultaneously" was the frontier. | #1, #2 |
| 2 | 10 to 1k | **Getting messages to the phone: polling, long polling, SSE, WebSocket.** Polling wastes requests; long polling sends a full HTTP message per event; WebSocket upgrades once to one bidirectional TCP connection. | Long polling: worst case "over three network transits", 30 s timeout "safer". WebSocket: one `101 Switching Protocols`, then ping/pong heartbeats. SSE: keep-alive comment "every 15 seconds or so". | #3, #4, #5 |
| 3 | 10k to 100k | **How many sockets fit on one machine? Scale up first.** Vertical scaling goes surprisingly far with event-driven runtimes. | WhatsApp, 2012: **2,277,845** open sockets on one 24-core FreeBSD/Erlang box. Phoenix, 2015: **2M** WebSockets on 40 cores / 128 GB, "limited by ulimit". | #6, #7 |
| 4 | 100k | **Second box: split stateless from stateful.** Stateless API behind a load balancer; long-lived sockets go to a gateway tier that tracks who is connected where. LB reloads must not drop connections. | Slack: gateways, channel servers and presence servers. "delivers messages across the world in 500ms". Envoy hot-restarts "without dropping any connections". | #8, #9 |
| 5 | 100k to 500k | **Fan-out between gateways (pub/sub).** A message on gateway A must reach users on gateways B to Z. Fan-out cost explodes in big rooms. | Fan-out is quadratic: 1,000 online → **1M** notifications; 100,000 → **10B**. Discord: 30 to 70 μs per send → **0.9 to 2.1 s** to fan out to 30k users before Manifold. Redis Pub/Sub is "at-most-once". | #12, #11, #20 |
| 6 | 500k | **Storage: a write-heavy, time-ordered log per channel.** MongoDB broke at 100M messages. Partition by `(channel_id, bucket)` and sort by a time-ordered 64-bit ID. | Snowflake = **41-bit ms timestamp + 10-bit machine + 12-bit sequence**. Discord: 10-day buckets keep partitions under 100 MB; later **177 Cassandra → 72 ScyllaDB** nodes, p99 read **40 to 125 ms → 15 ms**. | #14, #16, #15 |
| 7 | 500k to 1M | **Caching and sharding without reshuffling everything.** Consistent hashing moves only the keys that must move; virtual nodes spread load. Protect the DB from herds. | Dynamo (N,R,W) = **(3,2,2)**, target 300 ms at p99.9. Memcache leases: peak DB load **17K/s → 1.3K/s**. Discord request coalescing: one DB read for many readers. | #17, #18, #19, #15 |
| 8 | 1M | **Delivery semantics: assume duplicates and reconnects.** Use at-least-once transport plus idempotency keys (client message IDs). Order per conversation through partitioning. Offline sync works from a cursor into an ordered log; read receipts are per-user-per-channel state. | Kafka: "at-least-once delivery by default"; producer ID + sequence number dedup; one consumer per partition. Messenger Iris: "totally ordered queue" with per-device pointers, **~40%** less data. Discord Read States: **billions**, commits batched 30 s. | #21, #22, #23, #24 |
| 9 | 1M (bad day) | **Overload: presence storms, retries, thundering herds, and the offline phone.** Shed load, budget retries, add jitter, cap per-user rates. Offline users get a push hint, not the message log. | Retries at 5 layers × 3 = **243×** load. SRE retry budget 10% caps amplification at **~1.1×**. Discord sheds pushes, max **100 pending** per FCM connection. APNs: **4 KB** payload, "may reorder", stores only one notification per app. FCM TTL max **28 days**. | #26, #27, #25, #28, #29, #30 |
| 10 | 1M and beyond | **See it, then go global.** Watch the four golden signals and the tail; put gateways at the edge in many regions with draining; keep the hot core sharded. Payoff: what the giants run. | "the 99th percentile of one backend can easily become the median response of your frontend." Slack: gateways in multiple regions, edge caches serving **4M** connections / **600K** qps. Discord: **~5M** concurrent users (2017), one server with **1M+** online (2023). | #31, #8, #10, #11, #12 |

Optional on-screen numbers if time allows: Discord zstd raised MESSAGE_CREATE compression from ~6× to ~10× and cut gateway bandwidth by almost 40% (#13). Discord passive sessions made large-server fan-out 90% cheaper (#12).
