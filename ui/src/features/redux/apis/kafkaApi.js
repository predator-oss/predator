import axios from 'axios';
import env from '../../../App/common/env';

export const getKafkaTopics = () => axios.get(`${env.PREDATOR_URL}/kafka/topics`, { headers: {} });
export const getKafkaConsumerGroups = () => axios.get(`${env.PREDATOR_URL}/kafka/consumer-groups`, { headers: {} });
