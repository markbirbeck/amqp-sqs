require('dotenv').load();

describe('amqp:', function() {
  var amqp = require('../lib/amqp-sqs');
  var connection = amqp.createConnection({});
  var should = require('should');

  describe('connection:', function() {
    it('should be created', function(done) {
      connection.on('ready', function(err) {
        should.not.exist(err);
        done();
      });
    });

    it('should publish', function(done) {
      connection.on('ready', function(err) {
        should.not.exist(err);

        var queueName = 'test-amqp-send-queue-1';
        var testMessage = {hello: 'world!'};

        connection.publish(
          queueName , testMessage , {batchSize: 1} , function() {
          connection.queue(queueName, function(err, q) {
            q.subscribe({fireImmediately: true}, function L(message, whenDone) {
              testMessage.should.eql(message);
              whenDone(done);
            });
          });
        });
      });
    });
  });

  describe('exchange:', function() {
    it('should publish', function(done) {
      connection.on('ready', function(err) {
        should.not.exist(err);

        var queueName = 'test-amqp-send-queue-2';
        var testMessage = {hello: 'world!'};

        connection.exchange(queueName, {batchSize: 1}, function(err, exchange) {
          should.not.exist(err);
          should.exist(exchange);

          exchange.publish(
            '' , testMessage , function() {
            connection.queue(queueName, function(err, q) {
              q.subscribe({fireImmediately: true},
                  function L(message, whenDone) {
                testMessage.should.eql(message);
                whenDone(done);
              });
            });
          });
        });
      });
    });
  });

  describe('queue:', function() {
    it('should be created', function(done) {
      connection.on('ready', function(err) {
        should.not.exist(err);

        var queueName = 'test-amqp-queue-1';

        connection.queue(queueName, function(err, q) {
          should.not.exist(err);
          should.exist(q);
          q.should.have.property('_name', queueName);
          done();
        });
      });
    });

    it('#getMessageCount()', function(done) {
      connection.on('ready', function(err) {
        should.not.exist(err);

        var queueName = 'test-amqp-send-queue-2';
        var testMessage = {hello: 'world!'};

        connection.exchange(queueName, {batchSize: 1}, function(err, exchange) {
          should.not.exist(err);
          should.exist(exchange);

          exchange.publish(
            '' , testMessage , function() {
            connection.queue(queueName, function(err, q) {
              q.getMessageCount(function(err, count) {
                should.not.exist(err);

                count.should.equal(1);
                q.subscribe({fireImmediately: true},
                    function L(message, whenDone) {
                  testMessage.should.eql(message);
                  whenDone(done);
                });
              });
            });
          });
        });
      });
    });

    describe.skip('subscribe:', function() {
      it('with fireImmediately', function(done) {
        connection.on('ready', function(err) {
          should.not.exist(err);

          var queueName = 'test-amqp-queue-2';
          var count = 100;

          connection.queue(queueName, function(err, q) {
            should.not.exist(err);
            should.exist(q);
            q.subscribe({fireImmediately: true}, function L(message, whenDone) {
              should.exist(message);
              should.exist(whenDone);

              --count;

              whenDone(function(err, remainingMessages) {
                should.not.exist(err);
                remainingMessages.should.equal(count);

                /**
                 * If we're finished then trigger the callback:
                 */

                if (!remainingMessages) {
                  done();
                }
              });
            });
          });
        });
      });

      describe('with rate limit', function() {
        it('use defaults from default.yaml of 10 messages per second',
            function(done) {
          connection.on('ready', function(err) {
            should.not.exist(err);

            var queueName = 'test-amqp-queue-2';
            var numMessages = 100;
            var count = numMessages;
            var rate = 10;

            connection.queue(queueName, function(err, q) {
              should.not.exist(err);
              should.exist(q);
              var start = new Date();

              q.subscribe(function L(message, whenDone) {
                should.exist(message);
                should.exist(whenDone);

                --count;

                whenDone(function(err, remainingMessages) {
                  should.not.exist(err);
                  remainingMessages.should.equal(count);

                  /**
                   * If we're finished then trigger the callback:
                   */

                  if (!remainingMessages) {
                    var elapsed = (new Date() - start) / 1000;
                    var actualRate = numMessages / elapsed;

                    /**
                     * Allow a 10% deviation from the desired rate:
                     */

                    actualRate.should.be.within(rate * 0.85, rate * 1.15);
                    done();
                  }
                });
              });
            });
          });
        });

        it('use override values of 20 messages per second', function(done) {
          connection.on('ready', function(err) {
            should.not.exist(err);

            var queueName = 'test-amqp-queue-2';
            var numMessages = 100;
            var count = numMessages;
            var rate = 20;

            connection.queue(queueName, function(err, q) {
              should.not.exist(err);
              should.exist(q);
              var start = new Date();

              q.subscribe({tokensPerInterval: rate, interval: 'second'},
                  function L(message, whenDone) {
                should.exist(message);
                should.exist(whenDone);

                --count;

                whenDone(function(err, remainingMessages) {
                  should.not.exist(err);
                  remainingMessages.should.equal(count);

                  /**
                   * If we're finished then trigger the callback:
                   */

                  if (!remainingMessages) {
                    var elapsed = (new Date() - start) / 1000;
                    var actualRate = numMessages / elapsed;

                    /**
                     * Allow a 10% deviation from the desired rate:
                     */

                    actualRate.should.be.within(rate * 0.85, rate * 1.15);
                    done();
                  }
                });
              });
            });
          });
        });
      });
    });
  });
});
