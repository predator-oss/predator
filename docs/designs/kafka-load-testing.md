# Kafka load testing with consumer-lag reporting

Status: implemented · Depends on: predator-runner artillery v2 engine (predator-runner#2)

## Goal

Run produce-side load against a Kafka cluster from predator: pick a topic from
the cluster's real topic list, define the payload, run scenarios with
before-test setup — and during the run, watch a chosen consumer group's lag,
show it in the predator report, and export it to Prometheus for Grafana.

## Why this fits the existing architecture

Everything below rides on pipes that already exist:

- **Runner metrics pipeline** — artillery v2 custom engines emit counters and
  histograms that flow into `stats.report().customStats`, which
  `artillery-plugin-predator` already posts to predator, and which the bundled
  `publish-metrics` plugin already pushes to Prometheus. Lag becomes "just
  another metric" in both sinks with zero new plumbing.
- **Predator report UI** — charts render from the posted stats; a lag series
  is one more chart on the report page.
- **Runtime config** — cluster connection settings belong in the same
  DB-backed config the platform settings use today.

## Components

### 1. `artillery-engine-kafka` (new package in predator-runner)

A custom artillery v2 engine built on **kafkajs** (pure JS, maintained, works
on Node 24 and arm64 — no native librdkafka build pain).

```yaml
config:
  target: "kafka://broker-1:9092,broker-2:9092"
  kafka:
    clientId: predator-runner
    sasl: { mechanism: scram-sha-512, username: "...", password: "..." }
    ssl: true
scenarios:
  - name: produce orders
    engine: kafka
    flow:
      - produce:
          topic: orders
          key: "{{ orderId }}"
          message: '{"order_id": "{{ orderId }}", "amount": {{ amount }}}'
```

- One shared producer per worker (not per VU) with configurable `acks`;
  per-message latency measured from `send()` to broker ack.
- Emits: `kafka.messages_sent` (counter), `kafka.errors` (counter),
  `kafka.publish_latency` (histogram).
- Payload templating uses artillery's standard variable engine, so CSV
  payloads and processors work unchanged.
- `before` scenario support comes free from artillery v2 (one-shot scenario
  before the phases — topic seeding, auth warmup, etc.).

### 2. Consumer-lag monitor (extension to `artillery-plugin-predator`)

A singleton poller (leader process only), configured with the consumer group
to watch:

- Every stats interval: `admin.fetchTopicOffsets(topic)` +
  `admin.fetchOffsets({ groupId })` → lag per partition; sum and max.
- Emits `kafka.consumer_lag.total` and `kafka.consumer_lag.max_partition`
  histograms into the artillery event bus. From there they reach **both**
  predator (via customStats in the existing stats posts) and **Prometheus**
  (via publish-metrics pushgateway) with no extra code.

### 3. Predator API

- `GET /v1/kafka/topics` — topic discovery for the UI dropdown. Uses kafkajs
  admin `listTopics()` against the configured cluster. Connection settings
  (brokers, SASL, SSL) live in runtime config (`kafka_brokers`,
  `kafka_sasl_*`), editable in Settings without a restart. Secrets stored the
  same way SMTP credentials are today.
- Test schema: a scenario step type `produce` (mirrors the engine action) and
  a per-test `kafka` block (topic, consumer group to monitor). The swagger
  contract in `docs/openapi3.yaml` gains both.
- Jobs pass the kafka config to the runner the same way metrics config
  travels today (base64 env var).

### 4. Predator UI

- Test form: "Kafka" scenario type → topic dropdown (fed by the discovery
  endpoint), payload editor (existing monaco JSON editor), key template
  field, consumer-group picker (also discoverable:
  `admin.listGroups()`).
- Report page: when `kafka.consumer_lag.*` appears in stats, render a
  "Consumer lag" chart next to latency/RPS, using the existing chart
  components and series tokens. Lag over the run *is* the verdict of a Kafka
  load test, so it earns a readout in the report hero when present.

### 5. Grafana

No new component: `publish-metrics` pushes `kafka.*` metrics to the
pushgateway with the same test labels (`testName`, `testRunId`, `cluster`)
the HTTP metrics carry, so dashboards can join lag against publish rate and
latency per run.

## Open questions

1. **Credential handling** — runtime config is stored plaintext in the DB
   today (as SMTP credentials are). Acceptable to start; a secrets backend is
   a separate track.
2. **Multi-cluster** — start with one configured cluster; the discovery
   endpoint takes an optional named cluster for later.
3. **Lag attribution** — lag reflects the group's whole consumption, not just
   test traffic. Document it; optionally record the pre-test baseline and
   chart delta.
4. **Influx export** — publish-metrics has no influx reporter; Prometheus is
   the supported sink for the kafka path.

## Delivery plan

1. `artillery-engine-kafka` package + engine unit tests against a kafka
   testcontainer (runner repo).
2. Lag monitor in `artillery-plugin-predator` + black-box test (produce to a
   topic with a deliberately slow consumer, assert lag series posted).
3. Predator: runtime config keys + topics endpoint + schema/openapi.
4. UI: kafka scenario form + report lag chart.
5. End-to-end demo against a local kafka (docker) with a lagging consumer,
   verified in report UI and pushgateway.
