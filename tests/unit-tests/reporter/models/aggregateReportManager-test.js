const { expect } = require('chai');
const sinon = require('sinon');
const rewire = require('rewire');

const databaseConnector = require('../../../../src/reports/models/databaseConnector');
const constants = require('../../../../src/reports/utils/constants');

const aggregateReportManager = rewire('../../../../src/reports/models/aggregateReportManager');

// Each runner posts its own stats for the same bucket. Counters are per-runner
// tallies of work done, so they must sum across runners: dropping them made a
// parallel kafka run report zero traffic while the load was real, which in turn
// let the report page attribute every kafka message to http.
describe('aggregateReportManager', function () {
    let sandbox, getStatsStub;

    const statsFor = (runnerId, counters) => ({
        phase_status: constants.SUBSCRIBER_INTERMEDIATE_STAGE,
        runner_id: runnerId,
        data: JSON.stringify({
            timestamp: '2026-07-30T10:00:00.000Z',
            counters,
            summaries: { 'kafka.consumer_lag_total.billing': { max: 500 } },
            requestsCompleted: counters['kafka.messages_sent'] || 0,
            scenariosCreated: 0,
            scenariosAvoided: 0,
            scenariosCompleted: 0,
            pendingRequests: 0,
            concurrency: 0,
            scenarioCounts: {},
            codes: {},
            errors: {},
            latency: { median: 1, min: 1, max: 1, p95: 1, p99: 1 },
            scenarioDuration: { median: 1, min: 1, max: 1, p95: 1, p99: 1 },
            rps: { mean: 1, count: counters['kafka.messages_sent'] || 0 }
        })
    });

    const report = {
        test_id: 'test-id',
        report_id: 'report-id',
        duration: 30,
        duration_seconds: 30,
        start_time: '2026-07-30T10:00:00.000Z',
        end_time: '2026-07-30T10:00:30.000Z',
        status: constants.REPORT_FINISHED_STATUS,
        parallelism: 2
    };

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        getStatsStub = sandbox.stub(databaseConnector, 'getStats');
    });

    afterEach(() => sandbox.restore());

    it('sums counters across parallel runners instead of dropping them', async () => {
        getStatsStub.resolves([
            statsFor('runner-a', { 'kafka.messages_sent': 100, 'kafka.messages_sent.orders': 100 }),
            statsFor('runner-b', { 'kafka.messages_sent': 150, 'kafka.messages_sent.orders': 150 })
        ]);

        const result = await aggregateReportManager.aggregateReport(report);

        expect(result.aggregate.counters['kafka.messages_sent']).to.equal(250);
        expect(result.aggregate.counters['kafka.messages_sent.orders']).to.equal(250);
        expect(result.intermediates[0].counters['kafka.messages_sent']).to.equal(250);
    });

    it('keeps the highest sample for summaries rather than summing duplicates', async () => {
        getStatsStub.resolves([
            statsFor('runner-a', { 'kafka.messages_sent': 10 }),
            statsFor('runner-b', { 'kafka.messages_sent': 10 })
        ]);

        const result = await aggregateReportManager.aggregateReport(report);

        // Both runners observed the same external lag value: 500, not 1000.
        expect(result.aggregate.summaries['kafka.consumer_lag_total.billing'].max).to.equal(500);
    });
});
