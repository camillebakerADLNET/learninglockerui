import AWS from 'aws-sdk';
import sqsConsumer from 'sqs-consumer';
import highland from 'highland';
import {
  map,
  forEach,
  assign,
  merge,
  isString,
  get,
  has
} from 'lodash';
import logger from 'lib/logger';
import { Map } from 'immutable';
import { v4 as uuidv4 } from 'uuid';
import Promise, { promisify } from 'bluebird';

AWS.config.update({
  region: process.env.AWS_SQS_DEFAULT_REGION,
  accessKeyId: process.env.AWS_SQS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SQS_SECRET_ACCESS_KEY
});
export const sqs = new AWS.SQS();

let queueUrlPromises = new Map();
let publishStreams = new Map();

const sendBatch = ({ queueUrl, values }) => new Promise((resolve, reject) => {
  const entries = map(values, value => ({
    Id: uuidv4(),
    MessageBody: value
  }));
  sqs.sendMessageBatch({
    Entries: entries,
    QueueUrl: queueUrl
  }, (err, data) => {
    if (err) return reject(err);
    logger.debug('SUCCESSFULLY SENT', queueUrl, values);
    resolve(data);
  });
});

export const getQueueUrl = (queueName, done = () => {}, {
  deadLetter,
  retryDelay,
  visibilityTimeout
} = {}) => {
  if (queueUrlPromises.has(queueName)) {
    const queuePromise = queueUrlPromises.get(queueName);
    return queuePromise
      .then((queueUrl) => {
        done(null, queueUrl);
        return queueUrl;
      })
      .catch((err) => {
        done(err);
        return err;
      });
  }

  queueUrlPromises = queueUrlPromises
    .set(queueName, new Promise(async (resolve, reject) => {
      let existingQueueRequest;
      try {
        existingQueueRequest = await promisify(sqs.getQueueUrl, {
          context: sqs
        })({
          QueueName: queueName
        });
      } catch (err) {
        if (get(err, 'code') !== 'AWS.SimpleQueueService.NonExistentQueue') {
          throw err;
        }
      }
      const existingQueueUrl = get(existingQueueRequest, ['QueueUrl']);

      let sqsOptions = {
        QueueName: queueName
      };

      if (deadLetter) {
        let deadLetterFullName;
        if (isString(deadLetter)) {
          deadLetterFullName = deadLetter;
        } else {
          deadLetterFullName = `${queueName}_DEADLETTER`;
        }

        const deadLetterQueueUrl = await getQueueUrl(deadLetterFullName);

        const deadLetterQueueArn = await new Promise((resolve2, reject2) =>
          sqs.getQueueAttributes({
            QueueUrl: deadLetterQueueUrl,
            AttributeNames: ['QueueArn']
          }, (err, data) => {
            if (err) {
              return reject2(err);
            }
            return resolve2(data.Attributes.QueueArn);
          })
        );

        sqsOptions = assign(sqsOptions, {
          Attributes: {
            RedrivePolicy: JSON.stringify({
              maxReceiveCount: 1, // retries are handled internally.
              deadLetterTargetArn: deadLetterQueueArn
            })
          }
        });
      }

      if (retryDelay) {
        sqsOptions = merge(sqsOptions, {
          Attributes: {
            DelaySeconds: `${retryDelay}`
          }
        });
      }

      if (visibilityTimeout) {
        sqsOptions = merge(sqsOptions, {
          Attributes: {
            VisibilityTimeout: `${visibilityTimeout}`
          }
        });
      }

      if (existingQueueUrl && has(sqsOptions, 'Attributes')) {
        const params = {
          QueueUrl: existingQueueUrl,
          Attributes: get(sqsOptions, 'Attributes', {})
        };

        await promisify(sqs.setQueueAttributes, {
          context: sqs
        })(params);
      }


      sqs.createQueue(sqsOptions, (err, data) => {
        if (err) {
          return reject(err);
        }
        return resolve(data.QueueUrl);
      });
    })
  );
  const queuePromise = queueUrlPromises.get(queueName);

  return queuePromise
    .then((queueUrl) => {
      done(null, queueUrl);
      return queueUrl;
    })
    .catch((err) => {
      done(err);
      throw err;
    });
};

const getPublishStream = (queueUrl) => {
  if (!publishStreams.has(queueUrl)) {
    const newStream = highland();

    newStream
      .batchWithTimeOrCount(50, 10)
      .map((payloads) => {
        const values = map(payloads, 'value');

        const result = sendBatch({ queueUrl, values });

        result.then(() => {
          forEach(payloads, payload => payload.resolve());
        }).catch((err) => {
          forEach(payloads, payload => payload.reject(err));
        });

        return highland(result);
      })
      .errors((err) => {
        logger.error('SQS PUBLISH', err);
      })
      .resume();

    publishStreams = publishStreams.set(queueUrl, newStream);
  }
  return publishStreams.get(queueUrl);
};

export const publish = ({
  queueName,
  payload,
  deadLetter,
  retryDelay,
}, done) => {
  let stringPayload;
  try {
    stringPayload = JSON.stringify(payload);
  } catch (err) {
    return done(err);
  }

  getQueueUrl(queueName, undefined, {
    deadLetter,
    retryDelay,
  }).then((queueUrl) => {
    const stream = getPublishStream(queueUrl);

    const promise = new Promise((resolve, reject) => {
      stream.write({ value: stringPayload, resolve, reject });
    });
    promise.then(() => {
      done(null);
    });
    return promise;
  });
};

let sqsConsumers = [];

export const unsubscribeAll = async () => {
  forEach(sqsConsumers, (consumer) => {
    consumer.stop();
  });
  sqsConsumers = [];
};

export const subscribe = async ({
  queueName,
  handler,
  onProcessed = () => {},
  deadLetter,
  retryDelay,
  visibilityTimeout,
}, done) => {
  let queueUrl;
  try {
    queueUrl = await getQueueUrl(queueName, undefined, {
      deadLetter,
      retryDelay,
      visibilityTimeout
    });
  } catch (err) {
    done(err);
    return;
  }

  const wrappedHandler = (data, jobDone) => {
    let payload;
    try {
      payload = JSON.parse(data.Body);
    } catch (err) {
      logger.error(err);
      return jobDone(err);
    }

    // wrap the jobDone callback to check if an error was passed
    return handler(payload, (err) => {
      if (err) {
        logger.error(`SQS HANDLE JOB: ${queueName}`, payload, err);
      }
      return jobDone(err);
    });
  };

  const consumer = sqsConsumer.create({
    queueUrl,
    handleMessage: wrappedHandler,
    sqs
  })
  .on('error', (err) => {
    logger.error('SQS CREATE', err);
    process.exit();
  })
  .on('message_processed', onProcessed);

  sqsConsumers.push(consumer);

  consumer.start();

  done();
};
