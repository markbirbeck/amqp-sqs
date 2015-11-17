/**
 * Simple wrapper around aws-sqs, which is itself a simple wrapper
 * around `aws-lib`.
 */

require('../config/set_defaults');

var CONFIG = require('config');
var AWS_CONFIG = CONFIG.aws;
var logger = require('winston');

var _ = require('lodash');

/**
 * Get our AWS keys:
 */

var AWS_ACCESS_KEY_ID = AWS_CONFIG.accessKeyId;
var AWS_SECRET_ACCESS_KEY = AWS_CONFIG.secretAccessKey;
var EC2_REGION = AWS_CONFIG.region;

/**
 * Set up a connection to SQS:
 */

var aws = require('aws-sdk');
var sqs = new aws.SQS({
  region: EC2_REGION,
  accessKeyId: AWS_ACCESS_KEY_ID,
  secretAccessKey: AWS_SECRET_ACCESS_KEY
});
var SQS_CONFIG = AWS_CONFIG.sqs;
var SQS_VISIBILITY_TIMEOUT = SQS_CONFIG.visibilityTimeout;

/**
 * Keep a list of queue to name mappings:
 */

var mappings = {};

/**
 * Create a queue:
 */

exports.createQueue = function(queue, callback) {

  /**
   * If we've already made a connection in this session then
   * reuse it:
   */

  if (!mappings[queue]) {
    sqs.createQueue({
      QueueName: queue,
      Attributes: {
        VisibilityTimeout: String(SQS_VISIBILITY_TIMEOUT)
      }
    }, function(err, data) {
      if (err) {

        /**
         * If we failed to get the URL by creating then use getQueueUrl():
         */

        sqs.getQueueUrl({QueueName: queue}, function(err2, data) {
          if (err2) {

            /**
             * If this didn't work then we might as well return the original
             * createQueue() error, since it will probably be more meaningful:
             */

            logger.error('Error creating SQS queue: ', err);
            callback(err);
          } else {
            mappings[queue] = {QueueUrl: data.QueueUrl};
            callback(null);
          }
        });
      } else {

        /**
         * Could refactor to avoid duplication, but better to just do it
         * properly with Promises:
         */

        mappings[queue] = {QueueUrl: data.QueueUrl};
        callback(null);
      }
    });
  } else {
    callback(null);
  }
};

/**
 * Delete a queue:
 */

exports.deleteQueue = function(queue, callback) {
  sqs.deleteQueue(mappings[queue], function(err, data) {
    if (err) {
      logger.error('Error deleting SQS queue: ', err);
    } else {
      delete mappings[queue];
    }
    callback(err, data);
  });
};

/**
 * Receive a message:
 */

exports.receiveMessage = function(queue, callback) {
  sqs.receiveMessage(mappings[queue], function(err, data) {
    if (err) {
      logger.error('Error receiving SQS message: ', err);
    } else {
      data = data.Messages;
    }
    callback(err, data);
  });
};

/**
 * Send a message:
 */

exports.sendMessage = function(queue, message, callback) {
  var params = _.clone(mappings[queue]);

  params.MessageBody = message;
  sqs.sendMessage(params, callback);
};

/**
 * Delete a message:
 */

exports.deleteMessage = function(queue, receiptHandle, callback) {
  var params = _.clone(mappings[queue]);

  params.ReceiptHandle = receiptHandle;
  sqs.deleteMessage(params, callback);
};

/**
 * Get the number of messages in the queue:
 */

exports.countMessages = function(queue, callback) {
  var params = _.clone(mappings[queue]);

  params.AttributeNames = ['ApproximateNumberOfMessages',
    'ApproximateNumberOfMessagesNotVisible'];
  sqs.getQueueAttributes(params, function(err, data) {
    if (err) {
      callback(err);
    } else {
      callback(null, {
        'count': Number(data.Attributes.ApproximateNumberOfMessages),
        'in_progress': Number(data.Attributes.ApproximateNumberOfMessagesNotVisible)
      });
    }
  });
};
