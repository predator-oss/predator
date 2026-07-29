'use strict';

const { Kafka, logLevel } = require('kafkajs');
const configHandler = require('../../configManager/models/configHandler');
const { CONFIG } = require('../../common/consts');
const generateError = require('../../common/generateError');

async function buildClient () {
    const brokers = await configHandler.getConfigValue(CONFIG.KAFKA_BROKERS);
    if (!brokers) {
        throw generateError(422, 'Kafka is not configured. Set kafka_brokers in the configuration.');
    }
    const [ssl, saslMechanism, saslUsername, saslPassword] = await Promise.all([
        configHandler.getConfigValue(CONFIG.KAFKA_SSL),
        configHandler.getConfigValue(CONFIG.KAFKA_SASL_MECHANISM),
        configHandler.getConfigValue(CONFIG.KAFKA_SASL_USERNAME),
        configHandler.getConfigValue(CONFIG.KAFKA_SASL_PASSWORD)
    ]);

    return new Kafka({
        clientId: 'predator',
        brokers: String(brokers).split(',').map(b => b.trim()),
        ssl: ssl === true || ssl === 'true' || undefined,
        sasl: saslMechanism ? { mechanism: saslMechanism, username: saslUsername, password: saslPassword } : undefined,
        logLevel: logLevel.NOTHING
    });
}

async function withAdmin (fn) {
    const kafka = await buildClient();
    const admin = kafka.admin();
    try {
        await admin.connect();
        return await fn(admin);
    } catch (error) {
        if (error.statusCode) {
            throw error;
        }
        throw generateError(502, `Failed to reach Kafka: ${error.message}`);
    } finally {
        await admin.disconnect().catch(() => {});
    }
}

module.exports.getTopics = () => withAdmin(async (admin) => {
    const topics = await admin.listTopics();
    return topics.filter(t => !t.startsWith('__')).sort();
});

module.exports.getConsumerGroups = () => withAdmin(async (admin) => {
    const { groups } = await admin.listGroups();
    return groups.map(g => g.groupId).sort();
});
