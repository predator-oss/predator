'use strict';

const sinon = require('sinon');
const kafkaManager = require('../../../src/kafka/models/kafkaManager');
const kafkaController = require('../../../src/kafka/controllers/kafkaController');

describe('Kafka controller', function () {
    let sandbox, res, next;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        res = { status: sandbox.stub().returnsThis(), json: sandbox.stub() };
        next = sandbox.stub();
    });

    afterEach(() => sandbox.restore());

    it('getTopics passes the brokers query param through', async () => {
        const getTopicsStub = sandbox.stub(kafkaManager, 'getTopics').resolves(['orders']);
        await kafkaController.getTopics({ query: { brokers: 'b1:9092' } }, res, next);
        getTopicsStub.calledOnceWith('b1:9092').should.eql(true);
        res.status.calledOnceWith(200).should.eql(true);
        res.json.calledOnceWith(['orders']).should.eql(true);
        next.called.should.eql(false);
    });

    it('getConsumerGroups passes the brokers query param through', async () => {
        const getGroupsStub = sandbox.stub(kafkaManager, 'getConsumerGroups').resolves(['billing']);
        await kafkaController.getConsumerGroups({ query: { brokers: 'b2:9092' } }, res, next);
        getGroupsStub.calledOnceWith('b2:9092').should.eql(true);
        res.json.calledOnceWith(['billing']).should.eql(true);
    });

    it('errors go to next', async () => {
        const error = new Error('boom');
        sandbox.stub(kafkaManager, 'getTopics').rejects(error);
        await kafkaController.getTopics({ query: {} }, res, next);
        next.calledOnceWith(error).should.eql(true);
        res.json.called.should.eql(false);
    });
});
