/**
 * Set the default configuration values:
 */

var CONFIG = require('config');

CONFIG.util.setModuleDefaults('amqp', {
  publish: {

    /**
     * The mumber of messages that should be accumulated into a batch
     * before publishing the whole batch:
     */

    batchSize: 500,

    /**
     * How long (in milliseconds) to wait before flushing messages, even
     * if batchSize hasn't been reached:
     */

    flushTimeout: 500
  },
  subscribe: {

    /**
     * How often (in minutes) to check for messages in subscribe():
     */

    pollInterval: 5,
    rateLimit: {

      /**
       * When true, don't rate limit but send messages immediately:
       */

      fireImmediately: false,

      /**
       * When rate limiting, the number of items per unit of time that should
       * be passed through:
       */

      tokensPerInterval: 10,

      /**
       * When rate limiting, the unit of time that the tokensPerInterval value
       * will operate over:
       */

      interval: 'seconds'
    }
  }
});

CONFIG.util.setModuleDefaults('aws', {

  /**
   * Region, which must be one of:
   *
   *  us-east-1, us-west-1, us-west-2, eu-west-1, ap-southeast-1, ap-northeast-1
   */

  region: 'eu-west-1',
  sqs: {
    visibilityTimeout: 120
  }
});
