/**
 * A wrapper around SQS that looks like AMQP.
 */

require('../config/set_defaults');

var CONFIG = require('config');
var AMQP_CONFIG = CONFIG.amqp;
var logger = require('winston');
var RateLimiter = require('limiter').RateLimiter;
var sqs = require('./sqs');
var util = require('util');
var _ = require('lodash');

function Exchange (name, options, openCallback) {
  if (!openCallback) {
    openCallback = options;
    options = {};
  }

  options = options || {};

  var self = this;

  this._name = name;
  this._batch = [];
  this._messages = [];
  this._batchSize = options.batchSize || AMQP_CONFIG.publish.batchSize;
  this._flushDelay = null;

  sqs.createQueue(name, function(err) {
    openCallback(err, self);
  });
}

Exchange.prototype._flush = function(callback) {

  /**
   * Get a string version of our list of messages and then reset the list
   * ready for further updates. Note that if we only have one message then
   * we don't bother sending the message as a list:
   */

  var m = JSON.stringify(
    (this._batch.length === 1) ? this._batch[0]
      : this._batch
    );
  this._batch.length = 0;

  /**
   * Send the message to the queue:
   */

  sqs.sendMessage(this._name, m, callback);
};

Exchange.prototype.publish = function(routingKey, message, options, callback) {
  if (!callback) {
    callback = options;
    options = {};
  }

  options = options || {};

  var self = this;

  this._flushTimeout = options.flushTimeout || AMQP_CONFIG.publish.flushTimeout;

  /**
   * Clear any flush timer:
   */

  if (this._flushDelay) {
    clearTimeout(this._flushDelay);
    this._flushDelay = null;
  }

  /**
   * Buffer up the messages until we reach the batch size:
   *
   * Note that we periodically flush the batch buffer in case
   * there are too few messages.
   */

  function doFlush() {
    self._flush(function(err) {
      callback(err, false);
    });
  }

  this._batch.push(message);
  if (this._batch.length === this._batchSize) {
    doFlush();
  } else {
    this._flushDelay = _.delay(doFlush, this._flushTimeout);
    callback(null, true);
  }
};

function Queue (name, options, openCallback) {
  if (!openCallback) {
    openCallback = options;
    options = {};
  }

  var self = this;

  this._name = name;
  this._limiter = null;

  /**
   * [TODO] Name mustn't begin with 'amq.'.
   */

  sqs.createQueue(name, function(err) {
    openCallback(err, self);
  });
}

Queue.prototype.getMessageCount = function(callback) {
  sqs.countMessages(this._name, function(err, res) {
    callback(err, res && res.count);
  });
  return;
};

Queue.prototype.bind = function(exchange, routing) {
  if (!routing) {
    routing = exchange;
    exchange = 'amq.topic';
  }
  return;
};

Queue.prototype.subscribe = function(options, listener) {
  if (!listener) {
    listener = options;
    options = {};
  }

  options = options || {};

  /**
   * We always go via the rate limiter, but if no rate is set then we use the
   * 'fire immediately' feature which just passes all messages through:
   */

  var fireImmediately = options.fireImmediately || AMQP_CONFIG.subscribe.rateLimit.fireImmediately;
  var interval = options.interval || AMQP_CONFIG.subscribe.rateLimit.interval;
  var tokensPerInterval = options.tokensPerInterval || AMQP_CONFIG.subscribe.rateLimit.tokensPerInterval;

  this._limiter = (fireImmediately) ?
    new RateLimiter(1, 1, true)
  : new RateLimiter(tokensPerInterval, interval);

  var self = this;
  var pollInterval = AMQP_CONFIG.subscribe.pollInterval * 1000 * 60;

  /**
   * This function handles the messages recieved from SQS which may contain
   * a number of updates:
   */

  var fn = function X() {
    var elapsed;
    var timestamp = new Date();

    sqs.receiveMessage(self._name, function(err, res) {
      if (err) {
        logger.error(err);
      } else {
        _.each(res, function(message) {
          if (!_.isEmpty(message)) {

            /**
             * A message should contain a JSON payload, and may contain
             * more than one update:
             */

            var updates = JSON.parse(message.Body);

            if (!util.isArray(updates)) {
              updates = [updates];
            }

            /**
             * Track how many updates we have so that we know when we're
             * finished:
             */

            var count = updates.length;

            /**
             * For each update we have...
             */

            _.each(updates, function(update) {

              /**
               * ...send it to the listener by way of the rate limiter:
               */

              self._limiter.removeTokens(1, function(/* err, remainingRequests */) {
                listener(update, function(done) {

                  /**
                   * The listener must call us back when it has processed
                   * the message we've sent, so that we can delete the
                   * SQS message when all updates have been dealt with:
                   */

                  if (!--count) {
                    sqs.deleteMessage(self._name, message.ReceiptHandle,
                        function(err) {
                      if (err) {
                        logger.error('Failed to delete message: ', err);
                      }
                      if (done) {
                        done(err, 0);
                      }
                    });
                  } else {
                    if (done) {
                      done(null, count);
                    }
                  }
                });
              });
            });
          }
        });
      }

      /**
       * If we've just spent a lot of time processing messages then we don't
       * want to wait the full poll interval, so reduce it:
       */

      elapsed = new Date() - timestamp;
      setTimeout(fn, Math.max(0, pollInterval - elapsed));
    });
  };

  /**
   * Kick off the function and settimeout() will take over after that:
   */

  fn();
};

/**
 * Connection
 */

function Connection (options) {
  this._ready = false;

  this._exchanges = {};

  this._host = options.host;

  this._onReady = [];

  this._ready = true;
  return;
}

Connection.prototype.onReady = function() {

  /**
   * If we were previously not ready, then make
   * the transition:
   */

  if (!this.ready) {
    this._ready = true;
  }

  /**
   * If there's one or more callbacks then invoke them:
   */

  if (this._onReady.length) {
    for (var fn in this._onReady) {
      fn();
    }
  }
};

Connection.prototype.on = function(event, callback) {
  switch (event){
  case 'ready':
    this._onReady.push(callback);

    /**
     * It's possible that we've missed the transition to 'ready'; if so
     * invoke it now:
     */

    if (this._ready) {
      callback();
    }
    break;
  }
};

Connection.prototype.exchange = function(name, options, openCallback) {
  if (!openCallback) {
    openCallback = options;
    options = {};
  }
  return new Exchange(name, options, openCallback);
};

Connection.prototype.publish = function(name, message, options, callback) {
  if (!callback) {
    callback = options;
    options = {};
  }

  function pub(exchange, message, options, callback) {
    exchange.publish('', message, options, callback);
  }

  var self = this;

  if (!this._exchanges[name]) {
    this.exchange(name, options, function(err, exchange) {
      if (err) {
        callback(err);
      } else {
        self._exchanges[name] = exchange;
        pub(exchange, message, options, callback);
      }
    });
  } else {
    pub(this._exchanges[name], message, options, callback);
  }
};

Connection.prototype.queue = function(name, options, openCallback) {
  if (!openCallback) {
    openCallback = options;
    options = {};
  }
  return new Queue(name, options, openCallback);
};

exports.createConnection = function(options) {
  return new Connection(options);
};
