/**
 * A wrapper around SQS that looks like AMQP.
 */

var CONFIG = require('config')
  , AMQP_CONFIG = CONFIG.amqp
  , logger = require('winston')
  , RateLimiter = require('limiter').RateLimiter
  , sqs = require('./sqs')
  , util = require('util')
  , _ = require('underscore');

function Exchange (name, options, openCallback){
  if (!openCallback){
    openCallback = options;
    options = {};
  }

  var self = this;

  this._name = name;
  this._batch = [];
  this._messages = [];
  this._batchSize = AMQP_CONFIG.publish.batchSize;

  if (options){
    if (options.batchSize){
      this._batchSize = options.batchSize;
    }
  }

  sqs.createQueue(name, function (err){
    openCallback(err, self);
  });
}

Exchange.prototype.publish = function (routingKey, message, options, callback){
  if (!callback){
    callback = options;
    options = {};
  }

  var self = this;

  /**
   * Buffer up the messages until we reach the batch size:
   *
   * [TODO] Add a timer that will periodically flush the
   * batch buffer in case there are too few messages.
   */

  this._batch.push(message);
  if (this._batch.length === this._batchSize){

    /**
     * Get a string version of our list of messages and then reset the list
     * ready for further updates. Note that if we only have one message then
     * we don't bother sending the message as a list:
     */

    var m = JSON.stringify(
      (this._batch.length === 1) ?
        this._batch[0]
      : this._batch
    );
    self._batch.length = 0;

    /**
     * Send the message to the queue:
     */

    sqs.sendMessage(this._name, m, function (err){
      callback(err, false);
    });
  } else {
    callback(null, true);
  }
};

function Queue (name, options, openCallback){
  if (!openCallback){
    openCallback = options;
    options = {};
  }

  var self = this;

  this._name = name;
  this._limiter = null;

  /**
   * [TODO] Name mustn't begin with 'amq.'.
   */

  sqs.createQueue(name, function (err){
    openCallback(err, self);
  });
}

Queue.prototype.bind = function (exchange, routing){
  if (!routing){
    routing = exchange;
    exchange = 'amq.topic';
  }
  return;
};

Queue.prototype.subscribe = function (options, listener){
  if (!listener){
    listener = options;
    options = null;
  }

  /**
   * We always go via the rate limiter, but if no rate is set then we use the
   * 'fire immediately' feature which just passes all messages through:
   */

  var fireImmediately = AMQP_CONFIG.subscribe.rateLimit.fireImmediately
    , interval = AMQP_CONFIG.subscribe.rateLimit.interval
    , tokensPerInterval = AMQP_CONFIG.subscribe.rateLimit.tokensPerInterval;

  if (options){
    if (options.fireImmediately){
      fireImmediately = options.fireImmediately;
    } else {
      if (options.tokensPerInterval){
        tokensPerInterval = options.tokensPerInterval;
        fireImmediately = false;
      }
      interval = options.interval || interval;
    }
  }

  this._limiter = (fireImmediately) ?
    new RateLimiter(1, 1, true)
  : new RateLimiter(tokensPerInterval, interval);

  var self = this
    , pollInterval = AMQP_CONFIG.subscribe.pollInterval * 1000 * 60;

  /**
   * This function handles the messages recieved from SQS which may contain
   * a number of updates:
   */

  var fn = function X(){
    var elapsed
      , timestamp = new Date();

    sqs.receiveMessage(self._name, function (err, res){
      if (err){
        logger.error(err);
      } else {
        _.each(res, function (message){
          if (!_.isEmpty(message)){

            /**
             * A message should contain a JSON payload, and may contain
             * more than one update:
             */

            var updates = JSON.parse(message.Body);

            if (!util.isArray(updates)){
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

            _.each(updates, function (update){

              /**
               * ...send it to the listener by way of the rate limiter:
               */

              self._limiter.removeTokens(1, function(/* err, remainingRequests */){
                listener(update, function (done){

                  /**
                   * The listener must call us back when it has processed
                   * the message we've sent, so that we can delete the
                   * SQS message when all updates have been dealt with:
                   */

                  if (!--count){
                    sqs.deleteMessage(self._name, message.ReceiptHandle,
                        function (err){
                      if (err){
                        logger.error('Failed to delete message: ', err);
                      }
                      if (done){
                        done(err, 0);
                      }
                    });
                  } else {
                    if (done){
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

function Connection (options){
  this._ready = false;

  this._exchanges = {};

  this._host = options.host;

  this._onReady = [];

  this._ready = true;
  return;
}

Connection.prototype.onReady = function (){

  /**
   * If we were previously not ready, then make
   * the transition:
   */

  if (!this.ready){
    this._ready = true;
  }

  /**
   * If there's one or more callbacks then invoke them:
   */

  if (this._onReady.length){
    for (var fn in this._onReady){
      fn();
    }
  }
};

Connection.prototype.on = function (event, callback){
  switch(event){
  case 'ready':
    this._onReady.push(callback);

    /**
     * It's possible that we've missed the transition to 'ready'; if so
     * invoke it now:
     */

    if (this._ready){
      callback();
    }
    break;
  }
};

Connection.prototype.exchange = function (name, options, openCallback){
  if (!openCallback){
    openCallback = options;
    options = {};
  }
  return new Exchange(name, options, openCallback);
};

Connection.prototype.publish = function (name, message, options, callback){
  if (!callback){
    callback = options;
    options = {};
  }

  function pub(exchange, message, options, callback){
    exchange.publish('', message, options, callback);
  }

  var self = this;

  if (!this._exchanges[name]){
    this.exchange(name, options, function (err, exchange){
      if (err){
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

Connection.prototype.queue = function (name, options, openCallback){
  if (!openCallback){
    openCallback = options;
    options = {};
  }
  return new Queue(name, options, openCallback);
};

exports.createConnection = function (options){
  return new Connection(options);
};
