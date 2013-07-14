amqp-sqs
========

A very light wrapper around Amazon's SQS which looks like AMQP.

The idea is not to fully implement AMQP, but rather to allow SQS to be used in a project to get it going quickly, but then to be able to switch out for something like RabbitMQ later, if necessary.

To run the tests, copy the `config/environment.yaml` file to something suitable, and then set your AWS keys. The name of the file you use should be set in the `NODE_ENV` environment variable. For example, if you create a file `config/test.yaml` to hold your keys then you can test as follows:

```shell
export NODE_ENV=test
mocha
```

For more information on why that works, see the magical [config module](https://npmjs.org/package/config).

## Rate Limiting

When subscribing to a queue it's possible to get the messages to arrive at specific rate. This is useful if the processing that should be done with each message should be rate limited. For example, if the data received in a message should be inserted into a database at a rate of 20 inserts a second, then the subscription to the queue can request that the messages are forwarded at that rate:

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
