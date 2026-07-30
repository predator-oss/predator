# predator-mcp

An [MCP](https://modelcontextprotocol.io) server that exposes the Predator API as tools,
so an AI assistant can author load tests, run them, and read the results.

Full documentation: [MCP Server](https://predator-oss.github.io/predator/mcp.html) in the devguide.

## Connect from Claude Code

```bash
cd mcp && npm install
claude mcp add predator --env PREDATOR_URL=http://localhost:8088/v1 -- node /path/to/predator/mcp/server.js
```

`PREDATOR_URL` is the API root of a running Predator instance (defaults to
`http://localhost:8088/v1`).

## Tools

| Tool | What it does |
|---|---|
| `list_tests` / `get_test` | browse test definitions |
| `create_test` / `update_test` / `delete_test` | author tests (full artillery v2 scripts — http, kafka, or mixed) |
| `run_test` | launch a run now; returns the `report_id` |
| `stop_run` | stop a running test |
| `list_reports` / `get_report` | run status, latency/rps/error aggregates, and kafka consumer-lag over time |
| `kafka_topics` / `kafka_consumer_groups` | discover a cluster (optional `brokers` override) |
| `get_config` | read Predator's runtime configuration |

## Example prompts

- *"Create a kafka test that produces to the `orders` topic on kafka:9092 and monitors the `billing` consumer group's lag, then run it for 2 minutes at 50 rps and summarize the report."*
- *"List my tests, run the checkout one, and tell me if p95 got worse than the last run."*
