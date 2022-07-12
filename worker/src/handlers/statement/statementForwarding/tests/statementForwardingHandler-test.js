import StatementForwarding from 'lib/models/statementForwarding';
import Statement from 'lib/models/statement';
import async from 'async';
import axios from 'axios';
import AxiosMockAdapter from 'axios-mock-adapter';
import { expect } from 'chai';
import { STATEMENT_FORWARDING_REQUEST_QUEUE } from 'lib/constants/statements';
import statementWorker from 'worker/handlers/statement';
import { unsubscribeAll } from 'lib/services/queue';
import statementForwardingHandler from '../statementForwardingHandler';
import { purgeQueues } from './utils';
import btoa from 'btoa';

describe('Statement Forwarding handler', () => {
  it('Should take a statement and put it in a queue for each statmentForwarder', () => {
    const statementId = '561a679c0c5d017e4004714e';
    const organisationId = '561a679c0c5d017e4004715a';
    const lrsId = '560a679c0c5d017e4004714f';

    const mockQueue = resolve => ({
      publish: (data) => {
        expect(data.queueName).to.equal(STATEMENT_FORWARDING_REQUEST_QUEUE);
        expect(data.payload.status).to.equal(STATEMENT_FORWARDING_REQUEST_QUEUE);

        expect(data.payload.statement._id.toString()).to.equal(statementId);
        expect(data.payload.statementForwarding._id.toString()).to.equal('59438cabedcedb70146337eb');
        resolve();
      }
    });

    const cleanUp = () => new Promise(reslove =>
      async.forEach(
        [StatementForwarding, Statement],
        (model, doneDeleting) => {
          model.deleteMany({}, doneDeleting);
        },
        reslove
      )
    );

    // Setup db with a statement
    return new Promise((resolve, reject) => {

      async.parallel({
        statementForwarding: insertDone => StatementForwarding.create({
          _id: '59438cabedcedb70146337eb',
          lrs_id: lrsId,
          organisation: organisationId,
          active: true,
          configuration: {
            url: 'localhost:3101/',
            method: 'POST'
          }
        }, insertDone),
        statement: insertDone => Statement.create({
          active: true,
          _id: statementId,
          lrs_id: lrsId,
          organisation: organisationId,
          statement: {
            test: 'test'
          },
          processingQueues: [],
          completedQueues: []
        }, insertDone)
      }, (err) => {
        if (err) reject(err);
        resolve();
      });
    })
    .then((params) => { // Do the stuff
      const promise = new Promise(resolve =>
        statementForwardingHandler({ statementId }, () => {
          resolve(params);
        }, {
          queue: mockQueue(resolve)
        })
      );
      return promise;
    })
    .then(() => cleanUp(), () => cleanUp())
  }).timeout(5000);

  // TODO: REVISIT

  it('Should work completely from LRS reception to the forwarding request', async () => {

    const statementId = '561a679c0c5d017e4004714f';
    const organisationId = '561a679c0c5d017e4004715a';
    const lrsId = '560a679c0c5d017e4004714f';
    const dummyUsername = 'theBasicUsername';
    const dummyPassword = 'theBasicPassword';

    await new Promise((resolve) => {
      async.parallel({
        statementForwarding: insertDone => StatementForwarding.create({
          _id: '59438cabedcedb70146337eb',
          lrs_id: lrsId,
          organisation: organisationId,
          active: true,
          configuration: {
            protocol: 'http',
            url: 'localhost:3102/',
            method: 'POST',
            authType: 'basic auth',
            basicUsername: dummyUsername,
            basicPassword: dummyPassword
          }
        }, insertDone),
        statement: insertDone => Statement.create({
          active: true,
          _id: statementId,
          organisation: organisationId,
          lrs_id: lrsId,
          statement: {
            test: 'test'
          },
          processingQueues: [],
          completedQueues: [ // We're only interested in STATEMENT_FORWARDING_REQUEST_QUEUE
            'STATEMENT_PERSON_QUEUE',
            'STATEMENT_QUERYBUILDERCACHE_QUEUE'
          ]
        }, insertDone)
      }, resolve);
    });

    await purgeQueues();

    const forwardingResolutionPromise = new Promise((resolve) => {
      const statementHandlerProcessed = (message) => {
        expect(JSON.parse(message.Body).statementId).to.equal(statementId);
        resolve();
      };

      statementWorker({
        statementHandlerProcessed
      });
    });

    const mock = new AxiosMockAdapter(axios);

    let mockPath = 'http://localhost:3102/';
    let mockBody = { test: 'test' };
    let mockHeaders = {
      Authorization: `Basic ${btoa(dummyUsername + ":" + dummyPassword)}`
    };

    mock.onPost(mockPath, mockBody, mockHeaders).reply(200, {
      _id: '1',
      _rev: '1',
      success: true
    });

    await new Promise(resolve =>
      statementForwardingHandler({ statementId }, () => {
        resolve();
      })
    );

    /*
    We want to wait for message to be propagated back through the
    statement queue before we test request has been called
    and before we clean up the db. Otherwise, processing
    of the queues will fail and leave messages in it.
    */
    await forwardingResolutionPromise;

    expect(mock.history.post.length).to.equal(1);

    await unsubscribeAll();

    await Promise.all([
      StatementForwarding.deleteMany({}),
      Statement.deleteMany({})
    ]);
  })
    .timeout(10000);
});
