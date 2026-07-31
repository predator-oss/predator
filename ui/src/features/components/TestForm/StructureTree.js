import React from 'react';
import style from './structureTree.scss';

// The test structure as a tree, so exactly one step is in focus instead of every
// scenario and step being expanded down one long scroll. Scenario weight and
// engine ride as chips here rather than inside a collapsed config card, because
// the traffic split is the thing you most want to read at a glance.

const METHOD_CLASS = {
  GET: style.get, POST: style.post, PUT: style.put, PATCH: style.put, DELETE: style.del
};

const stepChip = (step, engine) => {
  if (step.type === 'sleep') return { label: 'WAIT', className: style.wait };
  if (engine === 'kafka') return { label: 'PRODUCE', className: style.post };
  const method = (step.method || 'GET').toUpperCase();
  return { label: method, className: METHOD_CLASS[method] || style.post };
};

const stepLabel = (step, engine) => {
  if (step.type === 'sleep') return `${step.sleep || 0}s`;
  if (engine === 'kafka') return step.topic || 'no topic';
  return step.url || 'no url';
};

const Node = ({ selected, indent, chip, label, badges = [], onClick, onDelete }) => (
  <div
    className={`${style.node} ${indent ? style.step : style.scenario} ${selected ? style.selected : ''}`}
    onClick={onClick}
    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
    role='treeitem'
    aria-selected={!!selected}
    tabIndex={0}
  >
    {chip && <span className={`${style.chip} ${chip.className}`}>{chip.label}</span>}
    <span className={style.label} title={label}>{label}</span>
    {badges.map((b) => <span key={b} className={style.pill}>{b}</span>)}
    {onDelete &&
      <button
        className={style.remove}
        title='Delete'
        aria-label={`Delete ${label}`}
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
      >×</button>}
  </div>
);

const StructureTree = ({
  scenarios = [], before, currentScenarioIndex, currentStepIndex,
  scenarioEngine, onSelectScenario, onSelectBefore, onSelectStep,
  onAddScenario, onDeleteScenario, onDeleteStep, showEngine
}) => {
  const beforeSelected = currentScenarioIndex === null;

  return (
    <nav className={style.rail} role='tree' aria-label='Test structure'>
      <div className={style.head}>
        <span>Structure</span>
        <span className={style.spacer} />
        <button className={style.add} title='Add scenario' onClick={onAddScenario}>+</button>
      </div>

      {before &&
        <>
          <Node
            selected={beforeSelected && currentStepIndex === null}
            label='Before'
            badges={['setup']}
            onClick={onSelectBefore}
          />
          {(before.steps || []).map((step, i) => (
            <Node
              key={step.id || i}
              indent
              selected={beforeSelected && currentStepIndex === i}
              chip={stepChip(step, 'http')}
              label={stepLabel(step, 'http')}
              onClick={() => onSelectStep(null, i)}
              onDelete={() => onDeleteStep(null, i)}
            />
          ))}
        </>}

      {scenarios.map((scenario, sIndex) => {
        const engine = scenarioEngine(scenario);
        const active = currentScenarioIndex === sIndex;
        const badges = [];
        if (scenario.weight) badges.push(`${scenario.weight}%`);
        if (showEngine) badges.push(engine);
        if (scenario.repeat > 1) badges.push(`x${scenario.repeat}`);

        return (
          <React.Fragment key={scenario.id || sIndex}>
            <Node
              selected={active && currentStepIndex === null}
              label={scenario.scenario_name || `Scenario ${sIndex + 1}`}
              badges={badges}
              onClick={() => onSelectScenario(sIndex)}
              onDelete={scenarios.length > 1 ? () => onDeleteScenario(sIndex) : undefined}
            />
            {(scenario.steps || []).map((step, i) => (
              <Node
                key={step.id || i}
                indent
                selected={active && currentStepIndex === i}
                chip={stepChip(step, engine)}
                label={stepLabel(step, engine)}
                onClick={() => onSelectStep(sIndex, i)}
                onDelete={() => onDeleteStep(sIndex, i)}
              />
            ))}
          </React.Fragment>
        );
      })}
    </nav>
  );
};

export default StructureTree;
