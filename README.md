amqp-sqs
========

A very light wrapper around Amazon's SQS which looks like AMQP.

The idea is not to fully implement AMQP, but rather to allow SQS to be used in a project to get it going quickly, whilst retaining the ability to be able to switch out for something like RabbitMQ later, if necessary.

Since SQS can handle quite large payloads it's often cheaper to batch up a number of application messages into a single SQS message. When subscribing to the messages the library will split apart the messages and make them appear as if they are separate.

To run the tests ensure that your AWS keys are available. This is usually done through the [environment variables set for the AWS CLI tools](http://docs.aws.amazon.com/cli/latest/userguide/cli-chap-getting-started.html#cli-environment), so if the following environment variables are set then there is nothing else needed:

```
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_DEFAULT_REGION
```

Alternatively, the values can be provided via a config file. A template is provided at `config/environment.yaml` which can be copied and then filled in with your AWS keys. The name of the file you use should be set in the `NODE_ENV` environment variable. For example, if you create a file `config/test.yaml` to hold your keys then you can test as follows:

```shell
export NODE_ENV=test
mocha
```

For more information on why that works, see the magical [config module](https://npmjs.org/package/config).

NOTE: The `queue.subscribe` tests are being skipped since they require lots of messages to be already present in the SQS queue. Rather than providing the messages manually, the tests should be updated to provide the necessary messages.

## Using the library

### Publishing and Subscribing Using the Connection

To create a connection, use the `createConnection` method and wait for the `ready` event:

```javascript
var amqp = require('amqp-sqs')
  , connection = amqp.createConnection({ });

connection.on('ready', function (err){
  // Do stuff
});
```

When the connection is ready it can be used to publish a message to a named queue, using the `publish` method (in AMQP parlance this is using the default exchange):

```javascript
var queueName = 'my-amqp-send-queue'
  , message = {hello: 'world!'};

connection.on('ready', function (err){
  connection.publish(
    queueName
  , message
  , { batchSize: 1 }
  , function (){
    console.log('Message sent')
  });
});
```

The `batchSize` parameter indicates how many application messages can be sent in a single SQS message. Setting it to one indicates that the message will be sent immediately, i.e., one application message is equivalent to one SQS message. The default batch size is actually 500 application messages. This means that application messages will be queued up locally and not pushed to SQS until there are 500 of them. However, just in case there are too few messages, the local queue is flushed every 500ms.

To listen for messages on the queue, another app would create a queue object with the same name, and subscribe to it:

```javascript
connection.queue(queueName, function(err, q){
  q.subscribe({fireImmediately: true}, function L(message, whenDone){
    // Do stuff
    // Make sure to call whenDone() to indicate that we've processed the
    //   the message and it can be deleted.
    whenDone(function(err, count){
      // If count === 0 then we're all finished
    });
  });
});
```

Setting `fireImmediately` to `true` means that we want to pull messages off the queue as fast as we can. To limit how quickly the messages are read, see the next section on _Rate Limiting_.

#### Rate Limiting

When subscribing to a queue it's possible to get the messages to arrive at a specific rate. This is useful if the processing that should be done with each message doesn't take place as quickly as the messages arrive. For example, if the data received in a message should be inserted into a datastore that is also serving queries then it may be desirable to limit inserts to no more than 20 a second. By specifying that in the subscription step we save the need to create any local buffers, and can instead leave the messages within SQS until they are needed:

```javascript
connection.queue(queueName, function(err, q){
  q.subscribe(
      {tokensPerInterval: 20, interval: 'second'}
    , function L(message, whenDone){
      // Insert record into database
    }
  );
});
```

### Publishing and Subscribing Using a Named Exchange

It's also possible to publish to a named exchange:

```javascript
connection.exchange('my-exchange', { batchSize: 1 }, function(err, exchange){
  exchange.publish('', {msg: 'Hello!'}, function (){
    // Do stuff
  });
});
```

The first parameter to the `publish` method is the routing key, which is not yet implemented (see issue #3).
