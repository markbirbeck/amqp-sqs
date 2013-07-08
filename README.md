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
