'use strict';

const sinon = require('sinon');
const rewire = require('rewire');
const configHandler = require('../../../src/configManager/models/configHandler');

describe('Kafka manager', function () {
    let sandbox;
    let kafkaManager;
    let adminStub;
    let getConfigStub;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        getConfigStub = sandbox.stub(configHandler, 'getConfigValue');
        adminStub = {
            connect: sandbox.stub().resolves(),
            disconnect: sandbox.stub().resolves(),
            listTopics: sandbox.stub().resolves(['orders', '__consumer_offsets', 'payments']),
            listGroups: sandbox.stub().resolves({ groups: [{ groupId: 'billing' }, { groupId: 'analytics' }] })
        };
        kafkaManager = rewire('../../../src/kafka/models/kafkaManager');
        kafkaManager.__set__('Kafka', function FakeKafka () {
            this.admin = () => adminStub;
        });
    });

    afterEach(() => sandbox.restore());

    it('lists topics sorted, without internal ones', async () => {
        getConfigStub.withArgs('kafka_brokers').resolves('b1:9092, b2:9092');
        getConfigStub.resolves(undefined);
        const topics = await kafkaManager.getTopics();
        topics.should.eql(['orders', 'payments']);
        adminStub.disconnect.calledOnce.should.eql(true);
    });

    it('lists consumer groups sorted', async () => {
        getConfigStub.withArgs('kafka_brokers').resolves('b1:9092');
        getConfigStub.resolves(undefined);
        const groups = await kafkaManager.getConsumerGroups();
        groups.should.eql(['analytics', 'billing']);
    });

    it('422 when kafka is not configured', async () => {
        getConfigStub.resolves(undefined);
        try {
            await kafkaManager.getTopics();
            throw new Error('should not get here');
        } catch (error) {
            error.statusCode.should.eql(422);
        }
    });

    it('502 when kafka is unreachable, still disconnects', async () => {
        getConfigStub.withArgs('kafka_brokers').resolves('b1:9092');
        getConfigStub.resolves(undefined);
        adminStub.listTopics.rejects(new Error('connection refused'));
        try {
            await kafkaManager.getTopics();
            throw new Error('should not get here');
        } catch (error) {
            error.statusCode.should.eql(502);
            error.message.should.match(/connection refused/);
        }
        adminStub.disconnect.calledOnce.should.eql(true);
    });
});
