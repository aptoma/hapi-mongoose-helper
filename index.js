'use strict';

const Hoek = require('hoek');
const Boom = require('boom');

/**
 * Check if the error is a duplicate key error and reply with a sensible error
 * @param  {Function} reply    reply function
 * @throws {Error} If the received error isnt a duplicate key error
 * @return {Function}
 */
function duplicateKeyError(reply) {
	return function (err) {
		const dup = /^E11000.*index:((.*\$|\s+)?([^\s]+))/.exec(err.message);
		if (dup) {
			return reply(Boom.conflict('Duplicate key error: ' + dup[3]));
		}
		throw err;
	};
}

/**
 * If the result is empty or NotFoundException reply with NotFound else reply with the result
 * @param  {Function} reply reply function
 * @param {Integer} [code] http status code for success
 * @return {Function}
 */
function notFoundReply(reply, code) {
	return (result) => {
		if (!result || result instanceof NotFoundException) {
			return reply(Boom.notFound());
		}

		const r = reply(result);
		if (code !== undefined) {
			r.code(code);
		}
	};
}

/**
 * Reply with 400 Bad Request when validation fails
 * @param  {Function} reply reply function
 * @return {Function}
 */
function validationErrorReply(reply) {
	return function (err) {
		if (!err.name || err.name !== 'ValidationError') {
			throw err;
		}

		const errors = Object.keys(err.errors).map((key) => {
			return {field: err.errors[key].path, message: err.errors[key].message};
		});

		reply(Boom.badRequest('Validation failed: ' + errors[0].message, {_expose: errors}));
	};
}

function mongoErrorReply(reply) {
	return function (err) {
		let message = 'Error saving to database';
		if (err.message.match(/must not start with/)) {
			message = err.message;
			return reply(Boom.badRequest(message));
		}

		if (err.code === 11000) {
			return reply(Boom.conflict('Duplicate key'));
		}

		return reply(Boom.internal(message));
	};
}

/**
 * Throws NotFoundException if passed response has n < 1 or response is empty.
 * @param  {Object} res response from mongodb.update or Mongoose.remove
 * @return {Object} res
 */
function notFoundExceptionIfNoMatch(res) {
	if (!res) {
		throw new NotFoundException('Empty database result');
	}

	// support both update result and remove result
	const n = res.n !== undefined ? res.n : Hoek.reach(res, 'result.n');

	// n is the number of matched document
	// more info on response here https://docs.mongodb.org/manual/reference/command/update/#update-command-output
	if (n < 1) {
		throw new NotFoundException('No document matched for update');
	}
	return res;
}

/**
 * Throws NotFoundException if passed data is falsy or empty if its an array
 * @param  {Array|Object} data]
 * @throws {NotFoundException} If passed data is falsy or empty if its an array
 * @return {Array|Object} returns same data that was passed.
 */
function notFoundExceptionIfEmpty(data) {
	if (!data) {
		throw new NotFoundException('Empty data');
	}

	if (data instanceof Array && !data.length) {
		throw new NotFoundException('Empty data array');
	}
	return data;
}

function NotFoundException(message) {
	this.message = message;
	this.name = 'NotFoundException';
	Error.captureStackTrace(this, NotFoundException);
}
NotFoundException.prototype = Object.create(Error.prototype);
NotFoundException.prototype.constructor = NotFoundException;

function connect(mongoose, server, options) {
	Hoek.assert(typeof options.uri === 'string', 'Database service requires option uri.');
	let dieTimeoutId;

	// fix for running tests when connection isnt closed when watch and reruns tests.
	if (!mongoose.connection.db) {
		server.log(['mongoose', 'info'], 'Connecting to database..');

		mongoose.connection.on('connected', () => {
			clearTimeout(dieTimeoutId);
			server.log(['mongoose', 'info', 'connected'], 'Connected to database.');
		});

		mongoose.connection.on('close', () => {
			server.log(['mongoose', 'info'], 'Disconnected from database.');
			dieTimeoutId = dieIfNotConnected(options.dieConnectTimeout || 10000);
		});

		mongoose.connection.on('error', (err) => server.log(['mongoose', 'error'], err));

		const events = ['disconnecting', 'connecting', 'open', 'reconnected'];
		events.forEach((event) => {
			mongoose.connection.on(event, () => server.log(['mongoose', 'info', event], `Mongoose connection event: ${event}`));
		});

		return new Promise((resolve, reject) => {
			mongoose
				.connect(options.uri, options.options || {}, (err) => {
					if (err) {
						server.log(['mongoose', 'error'], err);
						return reject(err);
					}

					resolve();
				});
		});
	}

	server.log(['mongoose', 'info'], 'Connection already open..');
	return Promise.resolve();

	function die() {
		throw new Error('Unable to establish connection with database');
	}

	function dieIfNotConnected(timeout) {
		return setTimeout(() => die(), timeout);
	}
}

exports.duplicateKeyError = duplicateKeyError;
exports.notFoundReply = notFoundReply;
exports.validationErrorReply = validationErrorReply;
exports.mongoErrorReply = mongoErrorReply;
exports.notFoundExceptionIfEmpty = notFoundExceptionIfEmpty;
exports.NotFoundException = NotFoundException;
exports.notFoundExceptionIfNoMatch = notFoundExceptionIfNoMatch;
exports.connect = connect;
