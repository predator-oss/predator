import React, { useState } from 'react';
import StepForm from './StepForm';
import KafkaStepForm from './KafkaStepForm';
import SleepForm from './SleepForm';
import style from './stepTabs.scss';

// One step in focus, its detail split across tabs. The count badge means a step's
// assertions or captures are legible without unfolding it - the reason the old
// single-scroll form was hard to scan once a test had more than a few steps.

const filled = (rows = []) => rows.filter((r) => r && Object.keys(r).some((k) => r[k])).length;

const httpTabs = (step) => [
  { id: 'headers', label: 'Headers', count: filled(step.headers) },
  { id: 'body', label: 'Body' },
  { id: 'captures', label: 'Capture', count: filled(step.captures) },
  { id: 'expectations', label: 'Assert', count: (step.expectations || []).length }
];

const StepTabs = (props) => {
  const { step, engine, index, onChangeValue } = props;
  const isSleep = step.type === 'sleep';
  const isKafka = engine === 'kafka' && !isSleep;
  const tabs = isKafka || isSleep ? [] : httpTabs(step);
  const [active, setActive] = useState(tabs.length ? tabs[0].id : null);
  const current = tabs.find((t) => t.id === active) ? active : (tabs[0] && tabs[0].id);

  if (isSleep) {
    return <div className={style.pane}><SleepForm {...props} /></div>;
  }

  if (isKafka) {
    // Kafka steps are topic + key + payload: no headers, captures or assertions to
    // hide, so tabs would be chrome around a single pane.
    return <div className={style.pane}><KafkaStepForm {...props} /></div>;
  }

  return (
    <div className={style.editor}>
      <div className={style.target}>
        <StepForm {...props} section='target' />
      </div>
      <div className={style.tabs} role='tablist'>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role='tab'
            type='button'
            aria-selected={current === tab.id}
            className={`${style.tab} ${current === tab.id ? style.active : ''}`}
            onClick={() => setActive(tab.id)}
          >
            {tab.label}
            {tab.count > 0 && <span className={style.count}>{tab.count}</span>}
          </button>
        ))}
      </div>
      <div className={style.pane} role='tabpanel'>
        <StepForm {...props} section={current} index={index} onChangeValue={onChangeValue} />
      </div>
    </div>
  );
};

export default StepTabs;
