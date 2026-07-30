# Kafka Load Testing
!!! TIP "Supported from version ghcr.io/predator-oss/predator:1.9.0"

Predator can generate produce-side load against a Kafka cluster, monitor the lag of the
consumer groups reading from it, and chart that lag in the run's report — alongside the
usual latency/RPS metrics. Kafka scenarios can also be mixed with HTTP scenarios in a
single test.

!!! NOTE
    This is different from [Streaming Platforms](streaming.md), which publishes Predator's
    own lifecycle events *to* Kafka. This page is about load testing *your* Kafka cluster.

## Setting up

Point Predator at your cluster with the `kafka_brokers` configuration key — from the
Settings page in the UI, or through `PUT /v1/config`. SSL and SASL are supported.
For the full list of keys please refer to: <u>[Kafka configuration manual](configuration.md#kafka-load-testing)</u>.

!!! WARNING
    The brokers must be reachable **from the runner's network** — not just from where the
    Predator server runs (the form's broker status is checked by the server). On the
    DOCKER platform set `DOCKER_NETWORK` to the docker network the brokers live on, or
    use a broker address that resolves everywhere (e.g. a `host.docker.internal` listener).
    On Kubernetes, runners run inside the cluster, so an in-cluster service address works.

Once configured, Predator can discover the cluster:

- `GET /v1/kafka/topics` — topics (internal `__` topics are filtered out)
- `GET /v1/kafka/consumer-groups` — consumer groups, candidates for lag monitoring

Both accept an optional `?brokers=` override to inspect a cluster other than the
configured one. The UI test form builds on these endpoints: it shows a live broker
connectivity status and offers topic and consumer-group pickers, so a Kafka scenario can
be authored without leaving the form.

## Writing a Kafka test

A Kafka test is a regular artillery test whose scenarios run on the kafka engine:

```json
{
  "name": "orders produce load",
  "description": "produce-side load on the orders topic",
  "type": "basic",
  "artillery_test": {
    "config": {
      "target": "kafka://kafka:9092",
      "engines": { "kafka": {} },
      "kafka": {
        "brokers": ["kafka:9092"],
        "lagMonitor": { "consumerGroups": ["billing"] }
      }
    },
    "scenarios": [
      {
        "name": "produce orders",
        "engine": "kafka",
        "flow": [
          {
            "produce": {
              "topic": "orders",
              "key": "{{ orderId }}",
              "message": { "order_id": "{{ orderId }}", "amount": 5 }
            }
          }
        ]
      }
    ]
  }
}
```

- `config.kafka.brokers` — the cluster the runners will produce to.
- `config.kafka.lagMonitor.consumerGroups` — consumer groups whose lag is sampled during
  the run and reported per group and per topic-partition.
- `produce` steps take a `topic`, an optional `key`, and a `message` (object or string —
  artillery variable templating works as usual, so CSV datasets and processors can feed
  the payload).

## Mixed HTTP + Kafka tests

Set `config.target` to the HTTP base url and mark only the kafka scenarios with
`engine: "kafka"`. A `before` flow (HTTP setup requests, e.g. warming endpoints or
fetching tokens) runs once before the load starts, for both engines:

```json
{
  "config": {
    "target": "http://my-service:8080",
    "engines": { "kafka": {} },
    "kafka": { "brokers": ["kafka:9092"] }
  },
  "before": {
    "flow": [{ "get": { "url": "/warmup" } }]
  },
  "scenarios": [
    { "name": "http traffic", "flow": [{ "get": { "url": "/health" } }] },
    {
      "name": "kafka traffic",
      "engine": "kafka",
      "flow": [{ "produce": { "topic": "orders", "message": { "hello": "world" } } }]
    }
  ]
}
```

Scenario weights split the virtual users between the HTTP and Kafka scenarios exactly as
they do in an HTTP-only test.

## Reading the report

Kafka runs report the standard artillery metrics (publish latency percentiles, RPS,
errors) plus consumer-lag summaries that ride along in each stats interval:

| Metric | Meaning |
|---|---|
| `kafka.consumer_lag_total.<group>` | total lag of the consumer group |
| `kafka.consumer_lag_max_partition.<group>` | the group's worst single partition |
| `kafka.consumer_lag_partition.<group>.<topic>.<partition>` | lag of one topic-partition |

The report page charts consumer lag over time next to the latency and RPS charts — one
series per monitored group, plus a per-partition breakdown. When multiple runners report
the same group's lag, Predator keeps the highest sample rather than summing duplicates of
the same external measurement.

The same summaries are exported through the report API
(`GET /v1/tests/{test_id}/reports/{report_id}/aggregate`) and, when the Prometheus
integration is configured, pushed as `kafka_consumer_lag_total` /
`kafka_consumer_lag_max_partition` / `kafka_consumer_lag_partition` gauges for Grafana.
