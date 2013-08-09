/**
 * Simple wrapper around aws-sqs, which is itself a simple wrapper
 * around `aws-lib`.
 */

require('../config/set_defaults');

var CONFIG = require('config')
  , AWS_CONFIG = CONFIG.aws
  , logger = require('winston')

/**
 * Get our AWS keys:
 */

var AWS_ACCESS_KEY_ID = AWS_CONFIG.accessKeyId
  , AWS_SECRET_ACCESS_KEY = AWS_CONFIG.secretAccessKey
  , EC2_REGION = AWS_CONFIG.region;

/**
 * Set up a connection to SQS:
 */

var awsSqs = require('aws-sqs')
  , sqs = new awsSqs(
      AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, {'region': EC2_REGION}
    )
  , SQS_CONFIG = AWS_CONFIG.sqs
  , SQS_VISIBILITY_TIMEOUT = SQS_CONFIG.visibilityTimeout;

/**
 * Keep a list of queue to name mappings:
 */

var mappings = {};

/**
 * Create a queue:
 */

exports.createQueue = function (queue, callback){

  /**
   * If we've already made a connection in this session then
   * reuse it:
   */

  if (!mappings[queue]){
    sqs.createQueue(queue, {VisibilityTimeout: SQS_VISIBILITY_TIMEOUT},
        function(err, res){
      if (err) {
        logger.error('Error creating SQS queue: ', err);
      } else {
        mappings[queue] = res;
      }
      callback(err);
    });
  } else {
    callback(null);
  }
};

/**
 * Delete a queue:
 */

exports.deleteQueue = function (queue, callback){
  sqs.deleteQueue(mappings[queue], function(err, res){
    if (err) {
      logger.error('Error deleting SQS queue: ', err);
    } else {
      delete mappings[queue];
    }
    callback(err, res);
  });
};

/**
 * Receive a message:
 */

exports.receiveMessage = function (queue, callback){
  sqs.receiveMessage(mappings[queue], callback);
};

/**
 * Send a message:
 */

exports.sendMessage = function (queue, message, callback){
  sqs.sendMessage(mappings[queue], message, callback);
};

/**
 * Delete a message:
 */

exports.deleteMessage = function (queue, messageReceipt, callback){
  sqs.deleteMessage(mappings[queue], messageReceipt, callback);
};

/**
 * Get the number of messages in the queue:
 */

exports.countMessages = function (queue, callback){
  sqs.getQueueAttributes(
    mappings[queue]
  , ['ApproximateNumberOfMessages', 'ApproximateNumberOfMessagesNotVisible']
  , function (err, res){
    if (err){
      callback(err);
    } else {
      callback(null, {
        'count': Number(res.ApproximateNumberOfMessages)
      , 'in_progress': Number(res.ApproximateNumberOfMessagesNotVisible)
      });
    }
  });
};
