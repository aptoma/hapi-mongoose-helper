'use strict';
const db = require('../');

const assert = require('chai').assert;

describe('Database Service', () => {


	describe('duplicateKeyError()', () => {

		it('should match old dup key error message', () => {
			const err = new Error('E11000 duplicate key error index: dredition-test.editions.$name_1_product_1 dup key: { : "morning-edition", : ObjectId(\'555c3e9843825487310041a7\') }');

			db.duplicateKeyError((err) => {
				assert.equal(err.message, 'Duplicate key error: name_1_product_1');
			})(err);
		});

		it('should match new dup key error message', () => {
			const err = new Error('E11000 duplicate key error collection: dredition-test.editions index: name_1_product_1 dup key: { : "morning-edition", : ObjectId(\'555c3e9843825487310041a7\') }');

			db.duplicateKeyError((err) => {
				assert.equal(err.message, 'Duplicate key error: name_1_product_1');
			})(err);
		});
	});


	describe('validateErrorReply()', () => {

		it('should rethrow error if not an ValidationError', () => {
			return new Promise(() => {
				throw new Error('crap');
			})
			.catch(db.validationErrorReply())
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
			.catch(db.validationErrorReply((err) => {
				assert.deepEqual(err.output.payload, {
					statusCode: 400,
					error: 'Bad Request',
					message: 'Validation failed: Failed to validate item: should have required property \'title\''
				});
			}));
		});

	});
});
