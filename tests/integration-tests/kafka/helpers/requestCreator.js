const request = require('supertest');
const appInitUtils = require('../../testUtils');
let app;

module.exports = {
    init,
    getTopics: (query) => get('/v1/kafka/topics', query),
    getConsumerGroups: (query) => get('/v1/kafka/consumer-groups', query)
};

async function init() {
    try {
        app = await appInitUtils.getCreateTestApp();
    } catch (err) {
        console.log(err);
        process.exit(1);
    }
}

function get(path, query = {}) {
    return request(app).get(path)
        .query(query)
        .set({ 'Content-Type': 'application/json' });
}
