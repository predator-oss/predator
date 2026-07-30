const { get } = require('lodash');

module.exports = {
    addDefaultsToTest,
    addDefaultsToStep
};

function addDefaultsToTest(artilleryTest) {
    const scenarios = get(artilleryTest, 'scenarios', []);
    for (const scenario of scenarios){
        const flow = get(scenario, 'flow', []);
        for (const step of flow){
            addDefaultsToStep(step);
        }
    }

    const before = get(artilleryTest, 'before.flow', []);
    for (const step of before){
        addDefaultsToStep(step);
    }
    return artilleryTest;
}

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

function addDefaultsToStep(step) {
    if (step){
        const method = Object.keys(step)[0];
        // non-http steps (kafka produce, think, log, ...) have no url to default
        if (HTTP_METHODS.includes(method)){
            step[method].url = step[method].url || '/';
        }
    }
    return step;
}
