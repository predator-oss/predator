#!/usr/bin/env node
// MCP server over the Predator REST API. Every tool is a thin wrapper around
// one endpoint; PREDATOR_URL points at the API root (default local docker).
//
//   claude mcp add predator --env PREDATOR_URL=http://localhost:8088/v1 -- node mcp/server.js

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const BASE = (process.env.PREDATOR_URL || 'http://localhost:8088/v1').replace(/\/$/, '');

async function api (method, path, body) {
    const res = await fetch(`${BASE}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await res.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; } catch (e) { data = text; }
    if (!res.ok) {
        throw new Error(`${method} ${path} -> ${res.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
    }
    return data;
}

const asResult = (data) => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] });
const pick = (obj, keys) => Object.fromEntries(keys.map(k => [k, obj[k]]));
const brokersQs = (brokers) => brokers ? `?brokers=${encodeURIComponent(brokers)}` : '';
const tool = (fn) => async (args) => {
    try {
        return asResult(await fn(args ?? {}));
    } catch (error) {
        return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
    }
};

const server = new McpServer({ name: 'predator', version: '1.0.0' });

server.registerTool('list_tests', {
    description: 'List all load tests (id, name, type, updated_at).'
}, tool(async () => {
    const tests = await api('GET', '/tests');
    return tests.map(t => pick(t, ['id', 'name', 'description', 'type', 'updated_at']));
}));

server.registerTool('get_test', {
    description: 'Get a test definition including its full artillery_test script.',
    inputSchema: { test_id: z.string() }
}, tool(({ test_id }) => api('GET', `/tests/${test_id}`)));

server.registerTool('create_test', {
    description: 'Create a load test. artillery_test is an artillery v2 script: config.target is required (http base url, or kafka://broker for kafka tests). ' +
        'Kafka tests add config.engines={kafka:{}}, config.kafka={brokers:[...], lagMonitor:{consumerGroups:[...]}} and scenarios with engine:"kafka" whose flow steps are {produce:{topic,key,message}}. ' +
        'HTTP scenarios use flow steps like {get:{url:"/path"}} or {post:{url,json}}. Mixed tests set config.target to the http base url and mark only kafka scenarios with engine:"kafka".',
    inputSchema: {
        name: z.string(),
        description: z.string().optional(),
        type: z.enum(['basic', 'dsl']).default('basic'),
        artillery_test: z.record(z.any()).describe('artillery v2 script: { config: {...}, scenarios: [...], before?: {...} }'),
        processor_id: z.string().optional()
    }
}, tool((args) => api('POST', '/tests', args)));

server.registerTool('update_test', {
    description: 'Replace a test definition (same body shape as create_test).',
    inputSchema: {
        test_id: z.string(),
        name: z.string(),
        description: z.string().optional(),
        type: z.enum(['basic', 'dsl']).default('basic'),
        artillery_test: z.record(z.any()),
        processor_id: z.string().optional()
    }
}, tool(({ test_id, ...body }) => api('PUT', `/tests/${test_id}`, body)));

server.registerTool('delete_test', {
    description: 'Delete a test by id.',
    inputSchema: { test_id: z.string() }
}, tool(async ({ test_id }) => { await api('DELETE', `/tests/${test_id}`); return { deleted: test_id }; }));

server.registerTool('run_test', {
    description: 'Run a test now. Returns the job with report_id — poll get_report with it for results.',
    inputSchema: {
        test_id: z.string(),
        duration: z.number().describe('seconds'),
        arrival_rate: z.number().describe('new virtual users per second'),
        ramp_to: z.number().optional(),
        parallelism: z.number().default(1),
        max_virtual_users: z.number().default(250),
        notes: z.string().optional()
    }
}, tool((args) => api('POST', '/jobs', { ...args, type: 'load_test', run_immediately: true })));

server.registerTool('stop_run', {
    description: 'Stop a running test.',
    inputSchema: { job_id: z.string(), report_id: z.string() }
}, tool(async ({ job_id, report_id }) => { await api('POST', `/jobs/${job_id}/runs/${report_id}/stop`); return { stopped: report_id }; }));

server.registerTool('list_reports', {
    description: 'List reports. With test_id: that test\'s runs; without: the most recent runs across all tests.',
    inputSchema: { test_id: z.string().optional(), limit: z.number().default(10) }
}, tool(async ({ test_id, limit }) => {
    const reports = test_id ? await api('GET', `/tests/${test_id}/reports`) : await api('GET', `/tests/last_reports?limit=${limit}`);
    return reports.slice(0, limit).map(r =>
        pick(r, ['report_id', 'test_id', 'test_name', 'status', 'start_time', 'end_time', 'duration_seconds', 'avg_rps', 'last_success_rate']));
}));

server.registerTool('get_report', {
    description: 'Get a run\'s status and aggregated results: latency percentiles, rps, status codes, errors, and kafka consumer-lag summaries (kafka.consumer_lag_total.<group> / kafka.consumer_lag_partition.<group>.<topic>.<partition>).',
    inputSchema: { test_id: z.string(), report_id: z.string() }
}, tool(async ({ test_id, report_id }) => {
    const report = await api('GET', `/tests/${test_id}/reports/${report_id}`);
    const result = { status: report.status, start_time: report.start_time, end_time: report.end_time, avg_rps: report.avg_rps, last_success_rate: report.last_success_rate };
    if (['finished', 'partially_finished', 'aborted'].includes(report.status)) {
        const aggregate = await api('GET', `/tests/${test_id}/reports/${report_id}/aggregate`);
        result.aggregate = aggregate.aggregate;
        const lag = {};
        for (const bucket of aggregate.intermediates || []) {
            for (const [key, summary] of Object.entries(bucket.summaries || {})) {
                if (key.startsWith('kafka.consumer_lag')) {
                    (lag[key] = lag[key] || []).push({ bucket: bucket.bucket, max: summary.max });
                }
            }
        }
        if (Object.keys(lag).length) result.consumer_lag_over_time = lag;
    }
    return result;
}));

server.registerTool('kafka_topics', {
    description: 'List topics in a Kafka cluster. brokers overrides Predator\'s configured kafka_brokers.',
    inputSchema: { brokers: z.string().optional().describe('comma-separated host:port list') }
}, tool(({ brokers }) => api('GET', `/kafka/topics${brokersQs(brokers)}`)));

server.registerTool('kafka_consumer_groups', {
    description: 'List consumer groups in a Kafka cluster (candidates for lag monitoring). brokers overrides the configured kafka_brokers.',
    inputSchema: { brokers: z.string().optional().describe('comma-separated host:port list') }
}, tool(({ brokers }) => api('GET', `/kafka/consumer-groups${brokersQs(brokers)}`)));

server.registerTool('get_config', {
    description: 'Get Predator\'s runtime configuration (job_platform, runner_docker_image, kafka_brokers, ...).'
}, tool(() => api('GET', '/config')));

const transport = new StdioServerTransport();
await server.connect(transport);
