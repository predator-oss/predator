'use strict';

const swaggerValidator = require('express-ajv-swagger-validation');
const express = require('express');
const router = express.Router();

const kafka = require('../controllers/kafkaController');

router.get('/topics', swaggerValidator.validate, kafka.getTopics);
router.get('/consumer-groups', swaggerValidator.validate, kafka.getConsumerGroups);

module.exports = router;
