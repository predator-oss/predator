import React from 'react';
import style from './style.scss';
import * as Actions from '../../redux/action';
import * as Selectors from '../../redux/selectors/testsSelector';
import * as ProcessorsSelector from '../../redux/selectors/processorsSelector';
import { connect } from 'react-redux';
import Modal from '../Modal';
import { createTestRequest, createStateForEditTest, createDefaultExpectation, createDefaultCapture, ENGINE_MIXED } from './utils';
import { v4 as uuid } from 'uuid';
import { cloneDeep, reduce, isNumber } from 'lodash';
import ErrorDialog from '../ErrorDialog';
import ProcessorsDropDown from './ProcessorsDropDown';
import Tabs from '../../../components/Tabs/Tabs'
import TitleInput from '../../../components/TitleInput';
import TextArea from '../../../components/TextArea';
import StepsList from './stepsList';
import FormWrapper from '../../../components/FormWrapper';
import ErrorWrapper from '../../../components/ErrorWrapper'
import CollapsibleScenarioConfig from './collapsibleScenarioConfig';
import { FileDrop } from 'react-file-drop';
import env from '../../../App/common/env';
import { CONTENT_TYPES } from './constants'
import { getKafkaTopics, getKafkaConsumerGroups } from '../../redux/apis/kafkaApi'
import { getFrameworkConfig } from '../../redux/apis/configApi'
import { isUrlValid, URL_FIELDS } from '../../../validators/validate-urls';
import IconButton from '../../../components/IconButton';
import { faDownload } from '@fortawesome/free-solid-svg-icons';
import {faStar as fullStar} from "@fortawesome/free-solid-svg-icons";
import { faSave, faPlayCircle, faStar as emptyStar } from '@fortawesome/free-regular-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { EMPTY_STRING, INVALID_URL_MESSAGE } from '../../../constants';
import InfoToolTip from "../InfoToolTip";
import CustomDropdown from '../../../components/Dropdown/CustomDropdown';
import Input from '../../../components/Input';
import MultiSelect from '../../../components/MultiSelect/MultiSelect.export';

const SLEEP = 'sleep';
const MAX_PROBABILITY = 100;

export class TestForm extends React.Component {
  constructor (props) {
    super(props);
    if (props.data) {
      this.state = createStateForEditTest(props.data, props.cloneMode);
    } else {
      this.state = {
        scenarios: [],
        before: null,
        type: 'basic',
        testEngine: 'http',
        kafkaBrokers: '',
        kafkaMonitoredGroups: [],
        kafkaCustomGroup: '',
        kafkaTopics: [],
        kafkaConsumerGroups: [],
        kafkaStatus: 'idle', // idle | connecting | connected | error
        kafkaStatusMessage: '',
        name: '',
        description: '',
        currentScenarioIndex: 0,
        currentStepIndex: null,
        processorId: undefined,
        processorsExportedFunctions: [],
        csvMode: false,
        csvFile: null,
        csvFileId: undefined,
        isFavorite: false
      }
    }
    this.state.validationErrors = {
      [URL_FIELDS.BASE]: {
        value: EMPTY_STRING,
        error: null
      },
      [URL_FIELDS.STEP]: {
        value: EMPTY_STRING,
        error: null
      }
    }
  }

    hasValidationErrors = () => {
      return !(this.state.baseUrl ? isUrlValid(this.state.baseUrl) : true);
    };

    isButtonDisabled = () => {
      const { name, testEngine, baseUrl, scenarios } = this.state;
      // http scenarios use relative urls, so they need a base url to resolve against
      const needsBaseUrl = testEngine === 'http' ||
        (testEngine === ENGINE_MIXED && scenarios.some((s) => this.scenarioEngine(s) === 'http'));
      return !name || this.hasValidationErrors() || (needsBaseUrl && !(baseUrl || '').trim());
    }

    updateValidationError = ({ error }) => {
      const newState = Object.assign({}, this.state);
      newState.validationErrors[URL_FIELDS.BASE].error = error;
      this.setState(newState);
    };

    validateUrl = () => {
      if (this.hasValidationErrors()) {
        this.updateValidationError({ error: INVALID_URL_MESSAGE });
      } else {
        this.updateValidationError({ error: null });
      }
    };

    postTest = (goToRunJob) => {
      const { editMode, id, csvFile } = this.state;
      const { createTest, editTest } = this.props;
      if (editMode) {
        this.setState({ goToRunJob }, () => {
          editTest(createTestRequest(this.state), id, csvFile)
        })
      } else {
        this.setState({ goToRunJob }, () => {
          createTest(createTestRequest(this.state), csvFile);
        })
      }
    };
    onCloseErrorDialog = () => {
      const { maxSupportedScenariosUi } = this.state;
      const { cleanAllErrors } = this.props;
      cleanAllErrors();
      if (maxSupportedScenariosUi) {
        this.setState({ maxSupportedScenariosUi: null })
      }
    };

    componentDidUpdate (prevProps, prevState) {
      const { createTestSuccess: createTestSuccessBefore, processorsList: processorsListBefore } = prevProps;
      const { createTestSuccess, closeDialog, processorsList, history } = this.props;

      if (!!createTestSuccess && createTestSuccessBefore === false) {
        this.props.clearAllSuccessOperationsState();
        if (this.state.goToRunJob) {
          history.push(`/tests/${createTestSuccess.id}/run`);
        } else {
          closeDialog();
        }
      }
      if (processorsList && processorsList.length > 0 && this.state.processorsExportedFunctions.length === 0 && this.state.processorId) {
        const processorsExportedFunctions = this.extractExportedFunctions(processorsList, this.state.processorId);
        this.setState({ processorsExportedFunctions })
      }
    }

    componentWillUnmount () {
      clearTimeout(this.kafkaDiscoveryTimer);
      this.props.getFileMetadataSuccess(undefined);
    }

    componentDidMount () {
      this.props.getProcessors({ exclude: 'javascript' });
      this.props.initForm();
      if (this.state.testEngine !== 'http') {
        this.loadKafkaDiscovery();
      }
      if (this.state.editMode || this.props.cloneMode) {
        if (this.props.data.csv_file_id) {
          this.props.getFileMetadata(this.props.data.csv_file_id);
        }

        if (this.state.before) {
          this.onChooseBefore()
        } else if (this.state.scenarios.length > 0) {
          this.onChooseScenario(this.state.scenarios[0].id);
        }
      } else {
        this.addScenarioHandler();
      }
    }

    render () {
      const { createTestError, processorsError, closeDialog, processorsLoading, processorsList, csvMetadata } = this.props;
      const { name, description, urls, baseUrl, processorId, editMode, maxSupportedScenariosUi, validationErrors, isFavorite, testEngine, kafkaBrokers, kafkaMonitoredGroups, kafkaCustomGroup, kafkaConsumerGroups, kafkaStatus, kafkaStatusMessage, kafkaTopics } = this.state;
      const error = createTestError || processorsError || maxSupportedScenariosUi;
      return (
        <Modal style={{ paddingTop: '12px', paddingBottom: '12px', paddingLeft: '40px', paddingRight: '40px' }}
          height={'100%'} width={'100%'} maxWidth={'1440px'} onExit={closeDialog}>
          <FormWrapper title={`${(editMode && 'Edit') || 'Create'} Test`}>
            <div style={{ flex: 1, overflow: 'scroll' }}>
              <div className={style['top']}>
                <div className={style['form-grid']}>
                  <div className={style['name-cell']}>
                    <div onClick={this.setFavorite} className={style['favorite-star']}>
                      <InfoToolTip data={{
                        key: 'star-info',
                        info: isFavorite ? 'Remove from favorites' : 'Add to favorites'
                      }} icon={isFavorite ? fullStar : emptyStar} iconSize={'20px'}/>
                    </div>
                    <TitleInput style={{ flex: '1' }} title={'Name'}>
                      <TextArea maxRows={5} value={name} onChange={(evt, value) => {
                        this.setState({ name: evt.target.value })
                      }} />
                    </TitleInput>
                  </div>
                  <TitleInput title={'Description'}>
                    <TextArea maxRows={5} value={description} onChange={(evt, value) => {
                      this.setState({ description: evt.target.value })
                    }} />
                  </TitleInput>
                  <TitleInput title={'Test type'}>
                    <CustomDropdown list={['http', 'kafka', ENGINE_MIXED]} value={testEngine}
                      onChange={(value) => this.onChangeTestEngine(value)} placeHolder={'http'} />
                  </TitleInput>
                  <TitleInput title={'Processor'}>
                    <ProcessorsDropDown
                      onChange={this.onProcessorChosen} options={processorsList} value={processorId}
                      loading={processorsLoading} />
                  </TitleInput>
                  {testEngine !== 'kafka' &&
                  <TitleInput title={'Base url'}>
                    <ErrorWrapper errorText={validationErrors[URL_FIELDS.BASE].error}>
                      <TextArea maxRows={5} value={baseUrl} placeholder={'http://my.api.com/'}
                        onChange={(evt, value) => {
                          this.setState({ baseUrl: evt.target.value }, () => {
                            this.validateUrl()
                          })
                        }} />
                    </ErrorWrapper>
                  </TitleInput>}
                </div>
                {testEngine !== 'http' &&
                <div className={style['kafka-panel']}>
                  <div className={style['panel-label']}>Kafka</div>
                  <div className={style['kafka-grid']}>
                    <div>
                      <TitleInput title={'Brokers'}>
                        <TextArea maxRows={2} value={kafkaBrokers} placeholder={'broker1:9092,broker2:9092'}
                          onChange={(evt) => this.onKafkaBrokersChange(evt.target.value)} />
                      </TitleInput>
                      {this.renderKafkaStatus(kafkaStatus, kafkaStatusMessage, kafkaTopics, kafkaConsumerGroups)}
                      <div style={{ marginTop: '4px', fontSize: 'var(--text-xs)', color: 'var(--fg-secondary)' }}>
                        must be reachable from the load runner's network, which may differ from Predator's
                      </div>
                    </div>
                    <TitleInput title={'Monitor consumer groups (lag)'}>
                      {this.renderMonitoredGroups(kafkaMonitoredGroups, kafkaConsumerGroups, kafkaCustomGroup)}
                    </TitleInput>
                  </div>
                </div>}
              </div>
              {/* bottom */}

              {this.generateScenarioDashBoard()}
            </div>
            {this.generateBottomBar()}
            {error && <ErrorDialog closeDialog={this.onCloseErrorDialog} showMessage={error} />}
          </FormWrapper>
        </Modal>
      )
    }

    setFavorite = () => {
      const {isFavorite} = this.state;
      const newValue = !isFavorite;
      this.setState({isFavorite: newValue});
    };

    extractExportedFunctions = (processorsList, processorId) => {
      const chosenProcessor = processorsList.find((processor) => processor.id === processorId);
      const processorsExportedFunctions = chosenProcessor ? chosenProcessor.exported_functions.map((funcName) => ({
        id: funcName,
        name: funcName
      })) : [];
      return processorsExportedFunctions;
    };

    loadKafkaDiscovery = () => {
      // Discovery doubles as a connectivity check. When the user typed a broker
      // address it checks THAT address; otherwise it falls back to predator's
      // configured kafka_brokers. Failures never block authoring — you can
      // still type a topic — but we surface why.
      const brokers = (this.state.kafkaBrokers || '').trim() || undefined;
      this.setState({ kafkaStatus: 'connecting', kafkaStatusMessage: '' });
      if (brokers) {
        this.setState({ kafkaEffectiveBrokers: brokers, kafkaBrokersFromSettings: false });
      } else {
        // empty field falls back to predator's configured kafka_brokers — name
        // it, so "Connected" is never mistaken for the empty field working
        getFrameworkConfig()
          .then((res) => this.setState({ kafkaEffectiveBrokers: res.data.kafka_brokers || '', kafkaBrokersFromSettings: true }))
          .catch(() => this.setState({ kafkaEffectiveBrokers: '', kafkaBrokersFromSettings: true }));
      }
      getKafkaTopics(brokers)
        .then((res) => this.setState({ kafkaTopics: res.data, kafkaStatus: 'connected' }))
        .catch((err) => {
          const data = err.response && err.response.data;
          this.setState({
            kafkaStatus: 'error',
            kafkaTopics: [],
            kafkaConsumerGroups: [],
            kafkaStatusMessage: (data && data.message) || (brokers ? `Could not reach ${brokers}` : 'Could not reach Kafka. Check kafka_brokers in Settings.')
          });
        });
      getKafkaConsumerGroups(brokers).then((res) => this.setState({ kafkaConsumerGroups: res.data })).catch(() => {});
    };

    onKafkaBrokersChange = (value) => {
      this.setState({ kafkaBrokers: value });
      clearTimeout(this.kafkaDiscoveryTimer);
      this.kafkaDiscoveryTimer = setTimeout(this.loadKafkaDiscovery, 600);
    };

    addCustomGroup = () => {
      const g = (this.state.kafkaCustomGroup || '').trim();
      if (!g) return;
      const set = new Set(this.state.kafkaMonitoredGroups);
      set.add(g);
      this.setState({ kafkaMonitoredGroups: [...set], kafkaCustomGroup: '' });
    };

    // Multi-select dropdown of discovered groups; groups not yet discovered can
    // still be added by name below. Lag is reported per selected group.
    renderMonitoredGroups = (selected, discovered, custom) => {
      const allNames = [...new Set([...discovered, ...selected])];
      const options = allNames.map((g) => ({ key: g, value: g }));
      return (
        <div>
          <MultiSelect
            options={options}
            selectedOptions={options.filter((o) => selected.includes(o.key))}
            onChange={(values) => this.setState({ kafkaMonitoredGroups: values.map((v) => v.key) })}
            placeholder={discovered.length ? 'Select consumer groups' : 'No groups discovered — add one below'}
            height={'35px'}
            enableFilter
            enableSelectAll
          />
          <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
            <Input value={custom} placeholder={'add a group by name'}
              onChange={(evt) => this.setState({ kafkaCustomGroup: evt.target.value })}
              onKeyDown={(evt) => { if (evt.key === 'Enter') { evt.preventDefault(); this.addCustomGroup(); } }} />
          </div>
        </div>
      );
    };

    renderKafkaStatus = (status, message, topics, groups) => {
      // Status is colour + glyph + label (never colour alone), the same rule the
      // rest of the product follows. It always names the broker it actually
      // checked, so an empty field can never read as "your input works" —
      // empty falls back to predator's configured kafka_brokers, labelled as such.
      const { kafkaEffectiveBrokers, kafkaBrokersFromSettings } = this.state;
      const target = kafkaEffectiveBrokers ? `${kafkaEffectiveBrokers}${kafkaBrokersFromSettings ? ' (from Settings)' : ''}` : '';
      const base = { display: 'inline-flex', alignItems: 'center', gap: '6px', marginTop: '6px', fontSize: 'var(--text-xs)' };
      if (status === 'connecting') {
        return <div style={{ ...base, color: 'var(--fg-secondary)' }}>connecting{target ? ` to ${target}` : ''}…</div>;
      }
      if (status === 'connected') {
        return <div style={{ ...base, color: 'var(--held-fg)' }}
          title={'Topics and consumer groups below come from this cluster. Type a broker above to check a different one.'}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--held-fg)', flex: 'none' }} />
          Connected to {target || 'Kafka'} — {topics.length} topic{topics.length === 1 ? '' : 's'}, {groups.length} group{groups.length === 1 ? '' : 's'}
        </div>;
      }
      if (status === 'error') {
        return <div style={{ ...base, color: 'var(--breach-fg)' }} title={message}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--breach-fg)', flex: 'none' }} />
          {target ? `Could not connect to ${target}` : 'No broker — type one above or set kafka_brokers in Settings'}
        </div>;
      }
      return null;
    };

    onChangeTestEngine = (value) => {
      if (value === this.state.testEngine) return;
      // steps are engine-specific — restart each scenario's flow for the new
      // engine instead of leaving http steps dressed up as kafka ones
      const scenarios = this.state.scenarios.map((scenario) => {
        const engine = value === ENGINE_MIXED ? 'http' : undefined;
        return { ...scenario, engine, steps: [this.initStepForEngine(value === 'kafka' ? 'kafka' : 'http')] };
      });
      this.setState({ testEngine: value, scenarios, before: value === 'kafka' ? undefined : this.state.before }, () => {
        if (value !== 'http') this.loadKafkaDiscovery();
      });
    };

    // The engine a scenario's steps run under. Only mixed tests carry it per
    // scenario; pure tests derive it from the test type.
    scenarioEngine = (scenario) => {
      if (this.state.testEngine === 'kafka') return 'kafka';
      if (this.state.testEngine === ENGINE_MIXED) return scenario.engine || 'http';
      return 'http';
    };

    onChangeScenarioEngine = (index, engine) => {
      const { scenarios } = this.state;
      if (scenarios[index].engine === engine) return;
      scenarios[index].engine = engine;
      // steps are engine-specific (produce vs http request) — start the flow over
      scenarios[index].steps = [this.initStepForEngine(engine)];
      this.setState({ scenarios });
    };

    onProcessorChosen = (id) => {
      const processorsExportedFunctions = this.extractExportedFunctions(this.props.processorsList, id);

      this.setState({
        processorId: id, processorsExportedFunctions
      })
    }
    generateBottomBar = () => {
      const { isLoading } = this.props;

      return (
        <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '5px 32px 5px 0' }}>
          <IconButton style={{ marginRight: '5px' }}
            spinner={isLoading}
            disabled={this.isButtonDisabled()}
            onClick={() => this.postTest(false)}
            inverted
            width='28px'
            height='28px'
            title='Save'>
            <FontAwesomeIcon icon={faSave} size='2x' />
          </IconButton>
          <IconButton
            spinner={isLoading}
            disabled={this.isButtonDisabled()}
            onClick={() => this.postTest(true)}
            inverted
            width='28px'
            height='28px'
            title='Save & Run'>
            <FontAwesomeIcon icon={faPlayCircle} size='2x' />
          </IconButton>
        </div>
      )
    };
    addScenarioHandler = () => {
      const { scenarios } = this.state;

      const maxWeight = this.calcMaxAllowedWeight(scenarios.length);
      const scenarioId = uuid();
      scenarios.push({
        id: scenarioId,
        steps: [],
        weight: maxWeight,
        engine: this.state.testEngine === ENGINE_MIXED ? 'http' : undefined,
        scenario_name: 'Scenario ' + (scenarios.length + 1),
        additionalInfo: { isEnable: false }
      });
      this.setState({
        scenarios,
        currentScenarioIndex: scenarios.length - 1,
        isBeforeSelected: false
      }, () => {
        this.addStepHandler();
      })
    };

    addBeforeHandler = () => {
      const before = {
        id: uuid(),
        scenario_name: 'Before',
        isBefore: true,
        steps: [this.initStep()]
      };
      this.setState({ before });
      this.setState({ currentScenarioIndex: null })
    };
    addStepHandler = (type) => {
      const { scenarios, currentScenarioIndex, before } = this.state;

      let steps;
      if (currentScenarioIndex === null) {
        // should be before selected
        steps = before.steps;
      } else {
        steps = scenarios[currentScenarioIndex].steps;
      }
      steps.push(this.initStep(type));
      this.setState({
        scenarios,
        before
      })
    };

    initStep (type) {
      if (type === SLEEP) {
        return { id: uuid(), sleep: 10, type };
      }
      const { scenarios, currentScenarioIndex } = this.state;
      const scenario = currentScenarioIndex !== null && scenarios[currentScenarioIndex];
      const engine = scenario ? this.scenarioEngine(scenario) : 'http';
      return this.initStepForEngine(engine);
    }

    initStepForEngine (engine) {
      if (engine === 'kafka') {
        return { id: uuid(), engine: 'kafka', topic: '', key: '', message: {} };
      }
      return {
        id: uuid(),
        method: 'POST',
        headers: [{}],
        captures: [createDefaultCapture()],
        url: '',
        forever: true,
        contentType: CONTENT_TYPES.APPLICATION_JSON,
        expectations: [createDefaultExpectation()],
        gzip: true,
        probability: MAX_PROBABILITY
      }
    }

    onChooseScenario = (key) => {
      const scenarioResult = this.state.scenarios.findIndex((scenario) => scenario.id === key);
      let currentScenarioIndex = null;
      if (scenarioResult !== -1) {
        currentScenarioIndex = scenarioResult
      }
      this.setState({
        currentStepIndex: null,
        currentScenarioIndex
      })
    };

    onChooseBefore = () => {
      this.setState({
        currentScenarioIndex: null
      })
    };
    onDeleteStep = (stepIndex) => {
      const { scenarios, before, currentScenarioIndex } = this.state;

      let steps = this.getStepsByCurrentState();
      steps.splice(stepIndex, 1);
      if (currentScenarioIndex === null && steps.length === 0) {
        this.setState({ scenarios, before: undefined, currentScenarioIndex: 0 });
      } else {
        this.setState({ scenarios, before });
      }
    };
    onDuplicateStep = (stepIndex) => {
      const { scenarios } = this.state;
      let steps = this.getStepsByCurrentState();
      const duplicatedStep = cloneDeep(steps[stepIndex]);
      duplicatedStep.id = uuid();
      steps.splice(stepIndex, 0, duplicatedStep);
      this.setState({ scenarios });
    };
    onDeleteScenario = () => {
      const { scenarios, currentScenarioIndex } = this.state;
      scenarios.splice(currentScenarioIndex, 1);
      let newCurrentScenarioIndex;
      if (currentScenarioIndex === 0) {
        newCurrentScenarioIndex = 0;
      } else {
        newCurrentScenarioIndex = currentScenarioIndex - 1;
      }
      this.setState({ scenarios, currentScenarioIndex: newCurrentScenarioIndex });
    };

    onDuplicateScenario = () => {
      const { scenarios, currentScenarioIndex } = this.state;
      const duplicatedScenario = cloneDeep(scenarios[currentScenarioIndex])
      duplicatedScenario.id = uuid();
      scenarios.splice(currentScenarioIndex, 0, duplicatedScenario);
      this.setState({ scenarios });
    };

    getStepsByCurrentState = () => {
      const { scenarios, currentScenarioIndex, before } = this.state;
      let steps;
      if (currentScenarioIndex !== null) {
        steps = scenarios[currentScenarioIndex].steps;
      } else {
        steps = before.steps
      }
      return steps;
    };
    updateStepOrder = (dragIndex, hoverIndex) => {
      const { scenarios, currentScenarioIndex, before } = this.state;
      let steps;
      if (currentScenarioIndex === null) {
        steps = before.steps;
      } else {
        steps = scenarios[currentScenarioIndex].steps;
      }
      const step = steps[dragIndex];
      steps.splice(dragIndex, 1);
      steps.splice(hoverIndex, 0, step);
      this.setState({ scenarios, before });
    };
    calcMaxAllowedWeight = (index) => {
      const { scenarios, currentScenarioIndex } = this.state;
      const exceptIndex = index || currentScenarioIndex;
      return reduce(scenarios, (result, value, key) => {
        if (exceptIndex !== key && isNumber(value.weight)) {
          result = result - value.weight;
          return result;
        } else {
          return result;
        }
      }, 100);
    };
    generateScenarioDashBoard = () => {
      const {
        scenarios, before, currentScenarioIndex,
        processorsExportedFunctions, csvMode,
        csvFile,
        editMode
      } = this.state;
      const { csvMetadata } = this.props;

      const currentCsvFile = csvFile || (csvMetadata ? { name: csvMetadata.filename } : undefined);

      let tabsData;
      if (before) {
        tabsData = [before, ...scenarios];
      } else {
        tabsData = [...scenarios];
      }

      const activeTabKey = currentScenarioIndex === null ? before.id : scenarios[currentScenarioIndex] && scenarios[currentScenarioIndex].id;
      return (
        <>
          {/* bottom */}
          <div style={{
            marginLeft: 'auto',
            marginRight: '12px',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '18px',
            position: 'sticky',
            top: '0px',
            zIndex: 22,
            padding: '10px 0',
            backgroundColor: 'var(--bg-surface)'
          }}>

            <div className={style['actions-style']} onClick={this.addScenarioHandler}>+Add Scenario</div>
            <div className={style['actions-style']} onClick={this.addStepHandler}>+Add Step</div>
            <div className={style['actions-style']} onClick={() => this.addStepHandler(SLEEP)}>+Add Sleep</div>
            {this.state.testEngine !== 'kafka' &&
            <div className={style['actions-style']} onClick={this.addBeforeHandler}>+Add Before</div>}
            <div className={style['actions-style']}
              onClick={() => this.setState({ csvMode: true })}>{(csvFile || csvMetadata) ? 'Modify' : '+Add'} CSV
            </div>
          </div>
          {csvMode &&
          <DragAndDrop csvMetadata={csvMetadata} csvFile={currentCsvFile}
            onDropFile={(file) => this.setState({ csvFile: file })} />}
          <Tabs onTabChosen={(key) => this.onChooseScenario(key)} activeTabKey={activeTabKey}
            className={style.tabs}>
            {
              tabsData.map((tabData, index) => {
                return (
                  <Tabs.TabPane style={{
                    padding: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    flexDirection: 'column',
                    flex: 1
                  }} tab={tabData.scenario_name || 'Scenario'}
                    key={tabData.id}>
                    {
                      !tabData.isBefore &&
                      <div style={{ width: '80%' }}>

                        <CollapsibleScenarioConfig
                          allowedWeight={this.calcMaxAllowedWeight()}
                          scenario={tabData}
                          onChangeValueOfScenario={this.onChangeValueOfScenario}
                          processorsExportedFunctions={processorsExportedFunctions}
                          showEngine={this.state.testEngine === ENGINE_MIXED}
                          isKafkaScenario={this.scenarioEngine(tabData) === 'kafka'}
                          engineValue={this.scenarioEngine(tabData)}
                          onChangeEngine={(value) => this.onChangeScenarioEngine(index - (this.state.before ? 1 : 0), value)}
                          onDeleteScenario={scenarios.length === 1 ? undefined : this.onDeleteScenario}
                          onDuplicateScenario={this.onDuplicateScenario}
                        />
                      </div>

                    }
                    <div style={{ width: '70%' }}>
                      <StepsList
                        steps={tabData.steps}
                        editMode={editMode}
                        testEngine={tabData.isBefore ? 'http' : this.scenarioEngine(tabData)}
                        kafkaTopics={this.state.kafkaTopics}
                        onChangeValueOfStep={this.onChangeValueOfStep}
                        processorsExportedFunctions={processorsExportedFunctions}
                        onDeleteStep={this.onDeleteStep}
                        onDuplicateStep={this.onDuplicateStep}
                        updateStepOrder={this.updateStepOrder}
                        // validationError={validationErrors[URL_FIELDS.STEP].error} //todo
                        validateUrl={() => {}} // todo temp
                      />
                    </div>

                  </Tabs.TabPane>
                )
              })
            }
          </Tabs>
        </>
      )
    };

    onChangeValueOfScenario = (key, value) => {
      const { scenarios, currentScenarioIndex } = this.state;
      scenarios[currentScenarioIndex][key] = value;

      this.setState({ scenarios: scenarios });
    };
    onChangeValueOfStep = (newStep, index) => {
      const { scenarios, currentScenarioIndex, before } = this.state;
      if (currentScenarioIndex === null) {
        before.steps[index] = newStep;
      } else {
        scenarios[currentScenarioIndex].steps[index] = newStep;
      }
      this.setState({ scenarios: scenarios, before });
    };
}

export const DragAndDrop = ({ csvFile, onDropFile, csvMetadata }) => {
  const styles = {
    border: '1px solid black',
    borderStyle: 'dashed',
    height: 50,
    color: 'black',
    alignItems: 'center',
    justifyContent: 'center',
    display: 'flex'
  };
  return (
    <div style={styles}>
      <FileDrop
        targetClassName={style.fileDropTarget}
        className={style.fileDrop}
        // onFrameDragEnter={(event) => console.log('onFrameDragEnter', event)}
        // onFrameDragLeave={(event) => console.log('onFrameDragLeave', event)}
        // o    nFrameDrop={(event) => console.log('onFrameDrop', event)}
        // onDragOver={(event) => console.log('onDragOver', event)}
        // onDragLeave={(event) => console.log('onDragLeave', event)}
        onDrop={(files, event) => {
          onDropFile(files[0])
        }}
      >

        {
          (csvFile && csvFile.name) ||
          <span>Drop csv file here</span>
        }

        {csvMetadata &&
        <div className={style['download-button']}
          onClick={() => window.open(`${env.PREDATOR_URL}/files/${csvMetadata.id}`)}>
          <FontAwesomeIcon icon={faDownload} />
        </div>
        }

      </FileDrop>
    </div>
  );
};

function mapStateToProps (state) {
  return {
    isLoading: Selectors.isLoading(state),
    createTestError: Selectors.errorOnCreateTest(state),
    createTestSuccess: Selectors.createTestSuccess(state),
    processorsList: ProcessorsSelector.processorsList(state),
    processorsLoading: ProcessorsSelector.processorsLoading(state),
    processorsError: ProcessorsSelector.processorFailure(state),
    csvMetadata: Selectors.csvMetadata(state)
  }
}

const mapDispatchToProps = {
  createTest: Actions.createTest,
  editTest: Actions.editTest,
  cleanAllErrors: Actions.cleanAllErrors,
  getProcessors: Actions.getProcessors,
  initForm: Actions.initCreateTestForm,
  getFileMetadata: Actions.getFileMetadata,
  getFileMetadataSuccess: Actions.getFileMetadataSuccess,
  clearAllSuccessOperationsState: Actions.clearAllSuccessOperationsState

};
export default connect(mapStateToProps, mapDispatchToProps)(TestForm);
