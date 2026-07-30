import React from 'react';
import { cloneDeep } from 'lodash';
import RectangleAlignChildrenLeft from '../../../components/RectangleAlign/RectangleAlignChildrenLeft';
import TitleInput from '../../../components/TitleInput';
import Input from '../../../components/Input';
import BodyEditor from './BodyEditor';
import { CONTENT_TYPES } from './constants';
import style from './stepform.scss';

// A single kafka produce step: target topic, an optional message-key template,
// and the JSON payload. The topic is one combobox: free text (a load test may
// target a topic that does not exist yet) with the discovered topics offered
// as native datalist suggestions.
export default (props) => {
  const { step, topics = [] } = props;
  const topicsListId = `kafka-topics-${props.index}`;
  const set = (patch) => props.onChangeValue(Object.assign(cloneDeep(step), patch), props.index);

  const onMessageChange = (value) => {
    if (value && value.error) return;
    set({ message: value && value.jsObject !== undefined ? value.jsObject : value });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
      <div className={style['http-methods-request-options-wrapper']}>
        <RectangleAlignChildrenLeft className={style['rectangle-url-row']}>
          <TitleInput style={{ marginRight: '10px', flexGrow: 2 }} title={'Topic'}>
            <Input value={step.topic || ''} onChange={(evt) => set({ topic: evt.target.value })} placeholder={'orders'} list={topicsListId} />
            {topics.length > 0 &&
              <datalist id={topicsListId}>
                {topics.map((topic) => <option key={topic} value={topic} />)}
              </datalist>}
          </TitleInput>
          <TitleInput style={{ flexGrow: 1 }} title={'Message key (optional)'}>
            <Input value={step.key || ''} onChange={(evt) => set({ key: evt.target.value })} placeholder={'{{ id }}'} />
          </TitleInput>
        </RectangleAlignChildrenLeft>
      </div>
      <BodyEditor type={CONTENT_TYPES.APPLICATION_JSON} content={step.message} key={step.id} onChange={(t, v) => onMessageChange(v)} />
    </div>
  );
};
