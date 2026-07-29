import { cloneDeep, isUndefined } from 'lodash';
import { v4 as uuid } from 'uuid';
import {
  CONTENT_TYPES,
  CAPTURE_TYPE_TO_REQUEST,
  CAPTURE_RES_TYPE_TO_CAPTURE_TYPE,
  EXPECTATIONS_SPEC_BY_PROP, EXPECTATIONS_TYPE, CAPTURE_TYPES, CAPTURE_KEY_VALUE_PLACEHOLDER
} from './constants';

const SLEEP = 'sleep';
const MAX_PROBABILITY = 100;

export const ENGINE_MIXED = 'kafka + http';

export const createTestRequest = (data) => {
  const { name, description, scenarios, type, baseUrl, before, processorId, csvFileId, isFavorite,
    testEngine, kafkaBrokers, kafkaMonitoredGroups } = data;
  const isKafka = testEngine === 'kafka';
  const isMixed = testEngine === ENGINE_MIXED;
  // artillery engines are per-scenario: a kafka-engine scenario runs produce
  // steps, everything else runs the default http engine.
  const scenarioIsKafka = (scenario) => isKafka || (isMixed && scenario.engine === 'kafka');

  const scenariosRequest = scenarios.map((scenario) => {
    return {
      name: scenario.scenario_name,
      weight: scenario.weight,
      engine: scenarioIsKafka(scenario) ? 'kafka' : undefined,
      beforeScenario: scenario.beforeScenario,
      afterScenario: scenario.afterScenario,
      flow: scenarioIsKafka(scenario) ? prepareKafkaFlow(scenario.steps) : prepareFlow(scenario.steps),
      additionalInfo: scenario.additionalInfo.isEnable ? scenario.additionalInfo.body : undefined
    }
  });

  const brokers = (kafkaBrokers || '').split(',').map((b) => b.trim()).filter(Boolean);
  const kafkaBlock = Object.assign(
    { brokers },
    (kafkaMonitoredGroups && kafkaMonitoredGroups.length) ? { lagMonitor: { consumerGroups: kafkaMonitoredGroups } } : {}
  );
  let config;
  if (isKafka) {
    config = {
      target: `kafka://${brokers.join(',')}`,
      engines: { kafka: {} },
      kafka: kafkaBlock
    };
  } else if (isMixed) {
    config = {
      target: baseUrl,
      engines: { kafka: {} },
      kafka: kafkaBlock,
      plugins: { expect: {} }
    };
  } else {
    config = {
      target: baseUrl,
      plugins: { expect: {} }
    };
  }

  return {
    name,
    description,
    type,
    processor_id: processorId,
    artillery_test: {
      config,
      // before is an http flow; pure-kafka tests have a kafka:// target so
      // relative urls in it would have nothing to resolve against
      before: (testEngine !== 'kafka' && before) ? { flow: prepareFlow(before.steps) } : undefined,
      scenarios: scenariosRequest
    },
    csv_file_id: csvFileId,
    is_favorite: isFavorite
  }
};

function prepareKafkaFlow(steps) {
  return steps.map((step) => {
    if (step.type === SLEEP) {
      return { think: step.sleep };
    }
    return {
      produce: {
        topic: step.topic,
        key: step.key || undefined,
        message: typeof step.message === 'object' ? JSON.stringify(step.message) : step.message
      }
    };
  });
}
export const createDefaultExpectation = () => {
  return { type: EXPECTATIONS_TYPE.STATUS_CODE, ...EXPECTATIONS_SPEC_BY_PROP[EXPECTATIONS_TYPE.STATUS_CODE] }
};
export const createDefaultCapture = () => {
  return {
    type: CAPTURE_TYPES.JSON_PATH,
    keyPlaceholder: CAPTURE_KEY_VALUE_PLACEHOLDER[CAPTURE_TYPES.JSON_PATH].key,
    valuePlaceholder: CAPTURE_KEY_VALUE_PLACEHOLDER[CAPTURE_TYPES.JSON_PATH].value
  }
};

export const createStateForEditTest = (test, cloneMode) => {
  test = cloneDeep(test);
  const { artillery_test } = test;
  const cfg = artillery_test.config || {};
  const hasKafkaEngine = !!(cfg.engines && cfg.engines.kafka);
  const isMixed = hasKafkaEngine && (artillery_test.scenarios || []).some((s) => s.engine !== 'kafka');
  const isKafka = hasKafkaEngine && !isMixed;
  const scenarios = testScenarioToTestScenario(artillery_test.scenarios, isKafka, isMixed);
  const kafkaCfg = cfg.kafka || {};
  return {
    name: test.name,
    description: test.description,
    id: test.id,
    baseUrl: isKafka ? '' : cfg.target,
    testEngine: isMixed ? ENGINE_MIXED : (isKafka ? 'kafka' : 'http'),
    kafkaBrokers: (kafkaCfg.brokers || []).join(','),
    kafkaMonitoredGroups: (kafkaCfg.lagMonitor && (kafkaCfg.lagMonitor.consumerGroups || (kafkaCfg.lagMonitor.consumerGroup ? [kafkaCfg.lagMonitor.consumerGroup] : []))) || [],
    kafkaCustomGroup: '',
    kafkaTopics: [],
    kafkaConsumerGroups: [],
    before: testBeforeToStateBefore(artillery_test.before),
    scenarios: scenarios,
    activeTabKey: scenarios[0] && scenarios[0].id,
    type: test.type,
    processorId: test.processor_id,
    editMode: !cloneMode,
    processorsExportedFunctions: [],
    csvFileId: test.csv_file_id,
    isFavorite: test.is_favorite
  }

};

function testBeforeToStateBefore(before) {
  if (!before) {
    return;
  }
  return {
    scenario_name: 'Before',
    isBefore: true,
    id: uuid(),
    steps: buildStepsFromFlow(before.flow)
  }
}

function testScenarioToTestScenario(testScenarios, isKafka, isMixed) {
  if (!testScenarios) {
    return []
  }
  return testScenarios.map((scenario) => {
    const scenarioIsKafka = isKafka || (isMixed && scenario.engine === 'kafka');
    return {
      id: uuid(),
      scenario_name: scenario.name,
      engine: isMixed ? (scenarioIsKafka ? 'kafka' : 'http') : undefined,
      beforeScenario: scenario.beforeScenario,
      afterScenario: scenario.afterScenario,
      weight: scenario.weight,
      additionalInfo: { body: scenario.additionalInfo, isEnable: !!scenario.additionalInfo },
      steps: scenarioIsKafka ? buildKafkaStepsFromFlow(scenario.flow) : buildStepsFromFlow(scenario.flow)
    }
  })
}

function buildKafkaStepsFromFlow(flow) {
  if (!flow) return [];
  return flow.map((request) => {
    if (request.think !== undefined) {
      return { type: SLEEP, id: uuid(), sleep: request.think };
    }
    const p = request.produce || {};
    let message = p.message;
    try { message = typeof p.message === 'string' ? JSON.parse(p.message) : p.message; } catch (e) { /* leave as string */ }
    return { type: 'kafka', engine: 'kafka', id: uuid(), topic: p.topic, key: p.key || '', message: message || {} };
  });
}

function buildStepsFromFlow(flow) {
  if (!flow) {
    return []
  }
  return flow.map((request) => {
    const action = Object.keys(request)[0];
    if (action.toLowerCase() === 'think') {
      return {
        type: SLEEP,
        sleep: request.think
      }
    }
    return {
      type: 'http',
      id: uuid(),
      method: action.toUpperCase(),
      body: request[action].json || request[action].body || request[action].form || request[action].formData,
      gzip: request[action].gzip,
      forever: request[action].forever,
      url: request[action].url,
      name: request[action].name,
      beforeRequest: request[action].beforeRequest,
      afterResponse: request[action].afterResponse,
      probability: request[action].probability || MAX_PROBABILITY, // support old tests which do not include probability (default - 100%)
      captures: buildCaptureState(request[action].capture),
      expectations: buildExpectationState(request[action].expect),
      headers: buildHeadersState(request[action].headers),
      contentType: (request[action].json && CONTENT_TYPES.APPLICATION_JSON) || (request[action].form && CONTENT_TYPES.FORM) || (request[action].formData && CONTENT_TYPES.FORM_DATA) || CONTENT_TYPES.OTHER
    }
  })
}

function buildHeadersState(headers) {
  const keys = headers ? Object.keys(headers) : [];
  const result = keys.map((key) => {
    return {
      key: key,
      value: headers[key]
    }
  });
  if (result.length === 0) {
    result.push({});
  }
  return result;
}

function buildCaptureState(captures) {
  if (!captures || captures.length === 0) {
    return [createDefaultCapture()];
  }
  return captures.map((cur) => {
    return {
      key: cur.json || cur.xpath || cur.regexp || cur.header,
      value: cur.as,
      type: (cur.json && CAPTURE_RES_TYPE_TO_CAPTURE_TYPE.json) ||
                (cur.xpath && CAPTURE_RES_TYPE_TO_CAPTURE_TYPE.xpath) ||
                (cur.regexp && CAPTURE_RES_TYPE_TO_CAPTURE_TYPE.regexp) ||
                (cur.header && CAPTURE_RES_TYPE_TO_CAPTURE_TYPE.header)
    }
  })
}

function buildExpectationState(expectations) {
  if (!expectations || expectations.length === 0) {
    return [createDefaultExpectation()];
  }
  return expectations.map((cur) => {
    const action = Object.keys(cur)[0];

    return {
      ...(EXPECTATIONS_SPEC_BY_PROP[action] || {}),
      type: action,
      key: Array.isArray(cur[action]) ? cur[action][0] : undefined,
      value: Array.isArray(cur[action]) ? cur[action][1] : cur[action]
    }
  })
}

function prepareFlow(steps) {
  return steps.map((step) => {
    if (step.type === SLEEP) {
      return {
        think: step.sleep
      }
    }

    return {
      [step.method.toLowerCase()]: {
        url: step.url,
        name: step.name,
        headers: prepareHeadersFromArray(step.headers),
        json: step.contentType === CONTENT_TYPES.APPLICATION_JSON ? step.body : undefined,
        body: step.contentType === CONTENT_TYPES.OTHER ? step.body : undefined,
        form: step.contentType === CONTENT_TYPES.FORM ? step.body : undefined,
        formData: step.contentType === CONTENT_TYPES.FORM_DATA ? step.body : undefined,
        capture: prepareCapture(step.captures),
        expect: prepareExpec(step.expectations),
        gzip: step.gzip,
        forever: step.forever,
        beforeRequest: step.beforeRequest,
        afterResponse: step.afterResponse,
        probability: step.probability
      }
    }
  });
}

function prepareHeadersFromArray(headersArray) {
  const result = {};
  headersArray.forEach((headerObject) => {
    if (headerObject.key) {
      result[headerObject.key] = headerObject.value;
    }
  });
  return result;
}

function prepareCapture(captures) {
  const result = [];
  captures.forEach((captureObject) => {
    if (captureObject.key) {
      result.push({
        [CAPTURE_TYPE_TO_REQUEST[captureObject.type]]: captureObject.key,
        as: captureObject.value
      });
    }
  });

  return result;
}

function prepareExpec(expectations) {
  const result = [];
  expectations.forEach((expectObject) => {
    if (expectObject.key && !isUndefined(expectObject.value)) {
      result.push({
        [expectObject.type]: [expectObject.key, expectObject.value]
      });
    } else if (!isUndefined(expectObject.value)) {
      result.push({
        [expectObject.type]: expectObject.value
      });
    }
  });

  return result;
}
