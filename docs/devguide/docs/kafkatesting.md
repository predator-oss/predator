# Kafka Load Testing
!!! TIP "Supported from version ghcr.io/predator-oss/predator:1.9.0"

Predator can generate produce-side load against a Kafka cluster, monitor the lag of the
consumer groups reading from it, and chart that lag in the run's report — alongside the
usual latency/RPS metrics. Kafka scenarios can also be mixed with HTTP scenarios in a
single test.

## Setting up

Point Predator at your cluster with the `kafka_brokers` runtime configuration key
(Settings page in the UI, or `PUT /v1/config`). The brokers must be reachable **from the
runner's network** — e.g. inside the same docker network or Kubernetes cluster as the
predator-runner containers.

| Configuration key      | Description                                              |
|------------------------|----------------------------------------------------------|
| `kafka_brokers`        | Comma-separated broker list (`host:port,host:port`)      |
| `kafka_ssl`            | `true` to connect over SSL                               |
| `kafka_sasl_mechanism` | SASL mechanism (e.g. `scram-sha-512`), enables SASL auth |
| `kafka_sasl_username`  | SASL username                                            |
| `kafka_sasl_password`  | SASL password                                            |

Once configured, Predator can discover the cluster for you:

- `GET /v1/kafka/topics` — topics (internal `__` topics filtered out)
- `GET /v1/kafka/consumer-groups` — consumer groups, candidates for lag monitoring

Both accept an optional `?brokers=` override. The UI test form uses these endpoints to
offer topic and consumer-group pickers with a live broker connectivity status.

## Writing a Kafka test

A Kafka test is a regular artillery test whose scenarios run on the kafka engine:

```json
{
  "name": "orders produce load",
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
  the run and reported per topic-partition.
- `produce` steps take `topic`, an optional `key`, and `message` (object or string,
  artillery variable templating works as usual).

## Mixed HTTP + Kafka tests

Set `config.target` to the HTTP base url and mark only the kafka scenarios with
`engine: "kafka"`. A `before` flow (HTTP setup requests, e.g. warming endpoints or
fetching tokens) runs once before the load starts — for both engines:

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

## Reading the report

Kafka runs report the standard artillery metrics (publish latency percentiles, RPS,
errors) plus consumer-lag summaries that ride along in each stats bucket:

- `kafka.consumer_lag_total.<group>` — total lag of the group
- `kafka.consumer_lag_partition.<group>.<topic>.<partition>` — per-partition lag

The report page charts consumer lag over time next to the latency and RPS charts. When
multiple runners report the same group's lag, Predator keeps the highest sample instead
of summing duplicates of the same external measurement.

## Driving it from an AI assistant (MCP)

The repository ships an [MCP server](https://github.com/predator-oss/predator/tree/master/mcp)
that exposes this whole flow — cluster discovery, test authoring, running, and lag-aware
report reading — as tools for AI assistants such as Claude:

```bash
claude mcp add predator --env PREDATOR_URL=http://localhost/v1 -- node /path/to/predator/mcp/server.js
```
