var amqp = require('../lib/amqp-sqs')
  , connection = amqp.createConnection({ })
  , should = require('should');


describe('connection:', function (){
  it('should be created', function (done){
    connection.on('ready', function (err){
      should.not.exist(err);
      done();
    });
  });
});

describe('queue:', function (){
  it('should be created', function (done){
    connection.on('ready', function (err){
      should.not.exist(err);

      var queueName = 'test-amqp-queue-1';

      connection.queue(queueName, function(err, q){
        should.not.exist(err);
        should.exist(q);
        q.should.have.property('_name', queueName);
        done();
      });
    });
  });

  it('should subscribe', function (done){
    connection.on('ready', function (err){
      should.not.exist(err);

      var queueName = 'test-amqp-queue-2';

      connection.queue(queueName, function(err, q){
        should.not.exist(err);
        should.exist(q);
        q.subscribe(function (message, whenDone){
          should.exist(message);
          should.exist(whenDone);
          whenDone(done);
        });
      });
    });
  });
});
