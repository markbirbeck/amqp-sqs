var should = require('should')
  , sqs = require('../lib/sqs');

describe('queue:', function (){
  var queue = 'test-queue-1';

  it('should be created', function (done){
    sqs.createQueue(queue, function (err){
      should.not.exist(err);
      done();
    });
  });

  it('should be deleted', function (done){
    sqs.deleteQueue(queue, function (err){
      should.not.exist(err);
      done();
    });
  });
});


describe('message: ', function (){
  var queue = 'test-queue-2'
    , testMessage = 'Some data to send...enchanté.'
    , message;

  before(function(done){
    sqs.createQueue(queue, function (err){
      should.not.exist(err);
      done();
    });
  });

  after(function(done){
    sqs.deleteQueue(queue, function (err){
      should.not.exist(err);
      done();
    });
  });

  it('should be sent', function (done){
    sqs.sendMessage(queue, testMessage, function (err){
      should.not.exist(err);
      done();
    });
  });

  it('should be in queue', function (done){
    sqs.countMessages(queue, function (err, res){
      should.not.exist(err);
      res.should.eql({ 'count': 1, 'in_progress': 0 });
      done();
    });
  });

  it('should be received', function (done){
    sqs.receiveMessage(queue, function (err, res){
      should.not.exist(err);
      res.should.have.length(1);

      message = res[0];
      message.should.have.property('Body');
      message.Body.should.equal(testMessage);
      done();
    });
  });

  it('should be in progress', function (done){

    /**
     * Add a short delay to allow AWS to sort itself out:
     */

    setTimeout(function (){
      sqs.countMessages(queue, function (err, res){
        should.not.exist(err);
        res.should.eql({ 'count': 0, 'in_progress': 1 });
        done();
      });
    }, 10000);
  });

  it('should be deleted', function (done){
    should.exist(message);
    message.should.have.property('ReceiptHandle');

    sqs.deleteMessage(queue, message.ReceiptHandle, function (err){
      should.not.exist(err);
      done();
    });
  });

  it('should be removed from queue', function (done){
    setTimeout(function (){
      sqs.countMessages(queue, function (err, res){
        should.not.exist(err);
        res.should.eql({ 'count': 0, 'in_progress': 0 });
        done();
      });
    }, 10000);
  });
});
