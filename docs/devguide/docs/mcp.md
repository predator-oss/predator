# MCP Server
!!! TIP "Supported from version ghcr.io/predator-oss/predator:1.9.0"

Predator ships an [MCP](https://modelcontextprotocol.io) (Model Context Protocol) server
that exposes the REST API as tools, so an AI assistant such as Claude can author load
tests, run them, and read the results — in plain language.

The server lives in the repository under [`mcp/`](https://github.com/predator-oss/predator/tree/main/mcp).
It is a thin stdio server: every tool wraps one Predator API endpoint, and it needs
nothing but a running Predator instance to talk to.

## Setting up

```bash
git clone https://github.com/predator-oss/predator.git
cd predator/mcp && npm install
```

### Claude Code

```bash
claude mcp add predator --env PREDATOR_URL=http://localhost/v1 -- node /path/to/predator/mcp/server.js
```

### Any MCP client

```json
{
  "mcpServers": {
    "predator": {
      "command": "node",
      "args": ["/path/to/predator/mcp/server.js"],
      "env": { "PREDATOR_URL": "http://localhost/v1" }
    }
  }
}
```

`PREDATOR_URL` is the API root of a running Predator instance
(defaults to `http://localhost:8088/v1`).

## Tools

| Tool | What it does |
|---|---|
| `list_tests` | list all tests (id, name, type, last update) |
| `get_test` | one test, including its full artillery script |
| `create_test` | create a test — full artillery v2 scripts: HTTP, [Kafka, or mixed](kafkatesting.md) |
| `update_test` | replace a test definition |
| `delete_test` | delete a test |
| `run_test` | launch a run now (duration, arrival rate, ramp, parallelism); returns the `report_id` |
| `stop_run` | stop a running test |
| `list_reports` | recent runs — of one test or across all tests |
| `get_report` | run status and aggregated results: latency percentiles, RPS, status codes, errors, and kafka consumer-lag over time |
| `kafka_topics` | topics of the configured cluster (or a `brokers` override) |
| `kafka_consumer_groups` | consumer groups — candidates for lag monitoring |
| `get_config` | Predator's runtime configuration |

## Example prompts

- *"Create a test that GETs `/health` and `/checkout` on `http://my-service:8080`, run it for 2 minutes at 50 rps, and summarize the report."*
- *"Create a kafka test that produces to the `orders` topic and monitors the `billing` consumer group's lag, run it, and tell me if the group kept up."*
- *"List my tests, run the checkout one, and tell me if p95 got worse than the last run."*
- *"Which consumer groups exist on the cluster? Add lag monitoring for all of them to my orders test."*
