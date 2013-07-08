/**
 * A wrapper around SQS that looks like AMQP.
 */

var CONFIG = require('config')
  , AMQP_CONFIG = CONFIG.amqp
  , sqs = require('./sqs')
  , _ = require('underscore');

function Queue (name, options, openCallback){
  if (!openCallback){
    openCallback = options;
    options = {};
  }

  var self = this;

  this._name = name;

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

  var self = this
    , interval = AMQP_CONFIG.subscribe.pollInterval * 1000 * 60
    , fn = function X(){
        sqs.receiveMessage(self._name, function (err, res){
          if (err){
            console.log(err);
          } else {
            _.forEach(res, function (message){
              if (!_.isEmpty(message)){
                //try...except
                listener(message.Body, function (done){
                  sqs.deleteMessage(self._name, message.ReceiptHandle,
                      function (err){
                    if (err){
                      console.log('Failed to delete message: ', err);
                    }
                    if (done){
                      done(err);

                    }
                  });
                });
              }
            });
          }
          setTimeout(fn, interval);
        });
      };

  fn();
};


/**
 * Connection
 */

function Connection (options){
  this._ready = false;

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
