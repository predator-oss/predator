'use strict';

const should = require('should');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const SERVER_PATH = path.join(__dirname, '../../../mcp/server.js');

// Speaks real JSON-RPC over stdio to the spawned MCP server, backed by a
// stubbed Predator API — covers the transport, tool wiring and error mapping.
describe('MCP server', function () {
    this.timeout(15000);

    let apiServer, mcp, nextId, pending, buffer;

    const API_RESPONSES = {
        'GET /v1/tests': [
            { id: 't1', name: 'checkout', description: 'd', type: 'basic', updated_at: 'ts', artillery_test: { big: 'blob' } }
        ],
        'GET /v1/tests/t1/reports/r1': { status: 'finished', start_time: 's', end_time: 'e', avg_rps: 50, last_success_rate: 100 },
        'GET /v1/tests/t1/reports/r1/aggregate': {
            aggregate: { rps: { mean: 50 } },
            intermediates: [
                { bucket: 15, summaries: { 'kafka.consumer_lag_total.billing': { max: 120 } } },
                { bucket: 30, summaries: { 'kafka.consumer_lag_total.billing': { max: 40 } } }
            ]
        }
    };

    function rpc(method, params) {
        const id = nextId++;
        mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
        // no per-call timer: mocha's suite timeout already bounds a hang
        return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    }

    function callTool(name, args) {
        return rpc('tools/call', { name, arguments: args });
    }

    before(async () => {
        nextId = 1;
        pending = new Map();
        buffer = '';

        apiServer = http.createServer((req, res) => {
            const key = `${req.method} ${req.url}`;
            res.setHeader('Content-Type', 'application/json');
            if (key === 'GET /v1/kafka/topics') {
                res.statusCode = 422;
                res.end(JSON.stringify({ message: 'Kafka is not configured. Set kafka_brokers in the configuration.' }));
                return;
            }
            if (API_RESPONSES[key]) {
                res.end(JSON.stringify(API_RESPONSES[key]));
                return;
            }
            res.statusCode = 404;
            res.end(JSON.stringify({ message: `no stub for ${key}` }));
        });
        await new Promise(resolve => apiServer.listen(0, '127.0.0.1', resolve));

        mcp = spawn('node', [SERVER_PATH], {
            env: { ...process.env, PREDATOR_URL: `http://127.0.0.1:${apiServer.address().port}/v1` },
            stdio: ['pipe', 'pipe', 'inherit']
        });
        mcp.stdout.on('data', (chunk) => {
            buffer += chunk.toString();
            let newline;
            while ((newline = buffer.indexOf('\n')) >= 0) {
                const line = buffer.slice(0, newline);
                buffer = buffer.slice(newline + 1);
                if (!line.trim()) continue;
                const message = JSON.parse(line);
                const waiter = pending.get(message.id);
                if (waiter) {
                    pending.delete(message.id);
                    message.error ? waiter.reject(new Error(message.error.message)) : waiter.resolve(message.result);
                }
            }
        });

        const init = await rpc('initialize', {
            protocolVersion: '2025-03-26',
            capabilities: {},
            clientInfo: { name: 'test', version: '0.0.0' }
        });
        init.serverInfo.name.should.eql('predator');
        mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    });

    after(() => {
        if (mcp) mcp.kill();
        if (apiServer) apiServer.close();
    });

    it('exposes all predator tools', async () => {
        const { tools } = await rpc('tools/list', {});
        tools.map(t => t.name).sort().should.eql([
            'create_test', 'delete_test', 'get_config', 'get_report', 'get_test',
            'kafka_consumer_groups', 'kafka_topics', 'list_reports', 'list_tests',
            'run_test', 'stop_run', 'update_test'
        ]);
    });

    it('list_tests returns the summary fields without the artillery script', async () => {
        const result = await callTool('list_tests', {});
        should(result.isError).not.be.ok();
        const tests = JSON.parse(result.content[0].text);
        tests.should.eql([{ id: 't1', name: 'checkout', description: 'd', type: 'basic', updated_at: 'ts' }]);
    });

    it('get_report on a finished run includes the aggregate and consumer lag over time', async () => {
        const result = await callTool('get_report', { test_id: 't1', report_id: 'r1' });
        const report = JSON.parse(result.content[0].text);
        report.status.should.eql('finished');
        report.aggregate.should.eql({ rps: { mean: 50 } });
        report.consumer_lag_over_time.should.eql({
            'kafka.consumer_lag_total.billing': [{ bucket: 15, max: 120 }, { bucket: 30, max: 40 }]
        });
    });

    it('API errors surface as tool errors with the upstream message', async () => {
        const result = await callTool('kafka_topics', {});
        result.isError.should.eql(true);
        result.content[0].text.should.match(/422/);
        result.content[0].text.should.match(/Kafka is not configured/);
    });
});
