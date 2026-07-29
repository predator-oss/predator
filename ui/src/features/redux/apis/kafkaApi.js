import axios from 'axios';
import env from '../../../App/common/env';

export const getKafkaTopics = (brokers) => axios.get(`${env.PREDATOR_URL}/kafka/topics`, { headers: {}, params: brokers ? { brokers } : {} });
export const getKafkaConsumerGroups = (brokers) => axios.get(`${env.PREDATOR_URL}/kafka/consumer-groups`, { headers: {}, params: brokers ? { brokers } : {} });
