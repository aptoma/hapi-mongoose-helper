'use strict';

const Hapi = require('@hapi/hapi');
const mongoose = require('mongoose');
const domain = require('domain');
const db = require('../');
const assert = require('chai').assert;

describe('Database Service', () => {

	describe('connect', () => {

		beforeEach((done) => {
			mongoose.connection.removeAllListeners();
			mongoose.connection.close(true, done);
		});

		it('should throw error if unable to reconnect ', (done) => {
			const server = new Hapi.Server();
			const testDomain = domain.create();

			testDomain.on('error', (err) => {
				try {
					assert.equal(err.message, 'Unable to establish connection with database');
					done();
				} catch (e) {
					done(e);
				}
			});

			testDomain.run(() => {
				db
					.connect(mongoose, server, {uri: 'mongodb://localhost/foobar', dieConnectTimeout: 1, options: {useNewUrlParser: true}})
					.then(testDomain.bind(() => {
						mongoose.connection.close();
					}));
			});
		});

		it('should resolve on connect', () => {
			const server = new Hapi.Server();
			return db.connect(mongoose, server, {uri: 'mongodb://localhost/foobar', options: {useNewUrlParser: true}});
		});

		it('should reject on connect fail', (done) => {
			const server = new Hapi.Server();

			db
				.connect(mongoose, server, {options: {reconnectTries: 0, useNewUrlParser: true}, uri: 'mongodb://localhost:1233/foobar'})
				.catch((err) => {
					assert.match(err.message, /failed to connect to server/);
					done();
				});
		});

	});

	describe('duplicateKeyError()', () => {

		it('should match old dup key error message', () => {
			const err = new Error('E11000 duplicate key error index: dredition-test.editions.$name_1_product_1 dup key: { : "morning-edition", : ObjectId(\'555c3e9843825487310041a7\') }');

			assert.throws(db.duplicateKeyError().bind(null, err), 'Duplicate key error: name_1_product_1');
		});

		it('should match new dup key error message', () => {
			const err = new Error('E11000 duplicate key error collection: dredition-test.editions index: name_1_product_1 dup key: { : "morning-edition", : ObjectId(\'555c3e9843825487310041a7\') }');

			assert.throws(db.duplicateKeyError().bind(null, err), 'Duplicate key error: name_1_product_1');
		});
	});


	describe('validationError()', () => {

		it('should rethrow error if not an ValidationError', () => {
			return new Promise(() => {
				throw new Error('crap');
			})
				.catch(db.validationError)
				.catch((e) => {
					assert.equal(e.message, 'crap');
				});
		});

		it('should handle ValidationError', () => {
			return new Promise(() => {
				const e = new Error('crap');
				e.name = 'ValidationError';
				e.errors = {
					items: {
						message: 'Failed to validate item: should have required property \'title\'',
						name: 'ValidatorError',
						path: 'items',
						value: undefined
					}
				};
				throw e;
			})
				.catch(db.validationError)
				.catch((err) => {
					assert.deepEqual(err.output.payload, {
						statusCode: 400,
						error: 'Bad Request',
						message: 'Validation failed: Failed to validate item: should have required property \'title\''
					});
				});
		});

	});
});
