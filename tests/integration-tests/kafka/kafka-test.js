'use strict';
const should = require('should');
const kafkaRequestSender = require('./helpers/requestCreator');
const testsRequestSender = require('../tests/helpers/requestCreator');
const validHeaders = { 'Content-Type': 'application/json' };

const KAFKA_TEST = {
    name: 'kafka produce test',
    description: 'pushes messages to a kafka topic',
    type: 'basic',
    artillery_test: {
        config: {
            target: 'kafka://kafka:9092',
            engines: { kafka: {} },
            kafka: { brokers: ['kafka:9092'], lagMonitor: { consumerGroups: ['billing'] } },
            phases: [{ duration: 10, arrivalRate: 1 }]
        },
        scenarios: [{
            name: 'produce to orders',
            engine: 'kafka',
            flow: [{ produce: { topic: 'orders', key: 'k', message: { hello: 'world' } } }]
        }]
    }
};

const MIXED_TEST = {
    name: 'mixed http and kafka test',
    description: 'before hits http endpoints, scenarios produce to kafka and call http',
    type: 'basic',
    artillery_test: {
        config: {
            target: 'http://www.example.com',
            engines: { kafka: {} },
            kafka: { brokers: ['kafka:9092'] },
            phases: [{ duration: 10, arrivalRate: 1 }]
        },
        before: {
            flow: [
                { get: { url: 'https://www.walla.com' } },
                { get: { url: 'https://www.google.com' } }
            ]
        },
        scenarios: [
            {
                name: 'http scenario',
                flow: [{ get: { url: '/health' } }]
            },
            {
                name: 'kafka scenario',
                engine: 'kafka',
                flow: [{ produce: { topic: 'orders', message: { hello: 'world' } } }]
            }
        ]
    }
};

describe('the kafka api', function () {
    this.timeout(5000000);

    before(async function () {
        await kafkaRequestSender.init();
        await testsRequestSender.init();
    });

    describe('kafka discovery endpoints', function () {
        // when the suite env configures brokers the 422 path is unreachable
        const itWithoutBrokers = process.env.KAFKA_BROKERS ? it.skip : it;

        itWithoutBrokers('topics returns 422 when kafka is not configured', async function () {
            const res = await kafkaRequestSender.getTopics();
            res.statusCode.should.eql(422);
            res.body.message.should.eql('Kafka is not configured. Set kafka_brokers in the configuration.');
        });

        itWithoutBrokers('consumer-groups returns 422 when kafka is not configured', async function () {
            const res = await kafkaRequestSender.getConsumerGroups();
            res.statusCode.should.eql(422);
        });

        it('topics returns 502 for an unreachable brokers override', async function () {
            const res = await kafkaRequestSender.getTopics({ brokers: 'localhost:1' });
            res.statusCode.should.eql(502);
            res.body.message.should.startWith('Failed to reach Kafka:');
        });

        it('consumer-groups returns 502 for an unreachable brokers override', async function () {
            const res = await kafkaRequestSender.getConsumerGroups({ brokers: 'localhost:1' });
            res.statusCode.should.eql(502);
        });
    });

    describe('kafka test definitions', function () {
        it('creates a kafka test and reads it back intact', async function () {
            const createResponse = await testsRequestSender.createTest(KAFKA_TEST, validHeaders);
            createResponse.statusCode.should.eql(201, JSON.stringify(createResponse.body));

            const getResponse = await testsRequestSender.getTest(createResponse.body.id, validHeaders);
            getResponse.statusCode.should.eql(200);
            should(getResponse.body.artillery_test.config.engines).deepEqual({ kafka: {} });
            should(getResponse.body.artillery_test.config.kafka).deepEqual(KAFKA_TEST.artillery_test.config.kafka);
            should(getResponse.body.artillery_test.scenarios[0].engine).eql('kafka');
            should(getResponse.body.artillery_test.scenarios[0].flow).deepEqual(KAFKA_TEST.artillery_test.scenarios[0].flow);
        });

        it('creates a mixed kafka+http test with a before flow and reads it back intact', async function () {
            const createResponse = await testsRequestSender.createTest(MIXED_TEST, validHeaders);
            createResponse.statusCode.should.eql(201, JSON.stringify(createResponse.body));

            const getResponse = await testsRequestSender.getTest(createResponse.body.id, validHeaders);
            getResponse.statusCode.should.eql(200);
            should(getResponse.body.artillery_test.before).deepEqual(MIXED_TEST.artillery_test.before);
            const scenarios = getResponse.body.artillery_test.scenarios;
            should(scenarios[0].engine).eql(undefined);
            should(scenarios[1].engine).eql('kafka');
            should(getResponse.body.artillery_test.config.target).eql('http://www.example.com');
        });

        it('updating a kafka test keeps the engine on its scenarios', async function () {
            const createResponse = await testsRequestSender.createTest(KAFKA_TEST, validHeaders);
            createResponse.statusCode.should.eql(201);

            const updated = structuredClone(KAFKA_TEST);
            updated.artillery_test.scenarios[0].flow[0].produce.topic = 'payments';
            const updateResponse = await testsRequestSender.updateTest(updated, validHeaders, createResponse.body.id);
            updateResponse.statusCode.should.eql(201, JSON.stringify(updateResponse.body));

            const getResponse = await testsRequestSender.getTest(createResponse.body.id, validHeaders);
            getResponse.statusCode.should.eql(200);
            should(getResponse.body.artillery_test.scenarios[0].engine).eql('kafka');
            should(getResponse.body.artillery_test.scenarios[0].flow[0].produce.topic).eql('payments');
        });
    });
});
