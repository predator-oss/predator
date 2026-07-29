'use strict';

const kafkaManager = require('../models/kafkaManager');

module.exports.getTopics = async (req, res, next) => {
    try {
        const topics = await kafkaManager.getTopics();
        res.status(200).json(topics);
    } catch (error) {
        next(error);
    }
};

module.exports.getConsumerGroups = async (req, res, next) => {
    try {
        const groups = await kafkaManager.getConsumerGroups();
        res.status(200).json(groups);
    } catch (error) {
        next(error);
    }
};
