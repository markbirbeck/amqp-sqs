amqp-sqs
========

A very light wrapper around Amazon's SQS which looks like AMQP.

The idea is not to fully implement AMQP, but rather to allow SQS to be used in a project and then switched out for something like RabbitMQ at a later date, if necessary.
