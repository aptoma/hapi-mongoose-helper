'use strict';

const Hoek = require('@hapi/hoek');
const Boom = require('@hapi/boom');

/**
 * Check if the error is a duplicate key error and reply with a sensible error
 * @throws {Error} If the received error isnt a duplicate key error
 * @return {Function}
 */
function duplicateKeyError() {
	return function (err) {
		const dup = /^E11000.*index:((.*\$|\s+)?([^\s]+))/.exec(err.message);
		if (dup) {
			throw Boom.conflict('Duplicate key error: ' + dup[3]);
		}
		throw err;
	};
}

/**
 * If the result is empty or NotFoundException reply with NotFound else reply with the result
 * @param  {Hapi.Toolkit} h
 * @param {Integer} [code] http status code for success
 * @return {Function}
 */
function notFoundReply(h, code) {
	return (result) => {
		if (!result || result instanceof NotFoundException) {
			throw Boom.notFound();
		}

		if (code !== undefined) {
			h.response(result).code(code);
		}

		return result;
	};
}

/**
 * Reply with 400 Bad Request when validation fails
 * @param {Error} err
 */
function validationError(err) {
	if (!err.name || err.name !== 'ValidationError') {
		throw err;
	}

	const errors = Object.keys(err.errors).map((key) => {
		return {field: err.errors[key].path, message: err.errors[key].message};
	});

	throw Boom.badRequest('Validation failed: ' + errors[0].message, {_expose: errors});
}

function mongoError(err) {
	let message = 'Error saving to database';
	if (err.message.match(/must not start with/)) {
		message = err.message;
		throw Boom.badRequest(message);
	}

	if (err.code === 11000) {
		throw Boom.conflict('Duplicate key');
	}

	throw Boom.internal(message);
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

	// support mixed types of results
	let n;

	if (res.n !== undefined) {
		n = res.n;
	}

	if (res.result?.n !== undefined) {
		n = res.result.n;
	}

	if (res.matchedCount !== undefined) {
		n = res.matchedCount;
	}

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
	if (mongoose.connection.readyState === 1 || mongoose.connection.readyState === 2) {
		server.log(['mongoose', 'info'], 'Already connecting/connected..');
		return Promise.resolve();
	}

	if (options.dieConnectTimeout) {
		dieTimeoutId = dieIfNotConnected(options.dieConnectTimeout);
	}

	mongoose.connection.on('connected', () => {
		clearTimeout(dieTimeoutId);
		server.log(['mongoose', 'info', 'connected'], 'Connected to database.');
	});

	mongoose.connection.on('close', () => {
		server.log(['mongoose', 'info'], 'Disconnected from database.');
		if (options.dieConnectTimeout) {
			dieTimeoutId = dieIfNotConnected(options.dieConnectTimeout);
		}
	});

	mongoose.connection.on('error', (err) => server.log(['mongoose', 'error'], err));

	const events = ['disconnecting', 'connecting', 'open', 'reconnected'];
	events.forEach((event) => {
		mongoose.connection.on(event, () => server.log(['mongoose', 'info', event], `Mongoose connection event: ${event}`));
	});

	server.log(['mongoose', 'info'], 'Connecting to database..');
	return mongoose.connect(options.uri, options.options || {}).catch((err) => {
		server.log(['mongoose', 'error'], err);
		throw err;
	});

	function die() {
		throw new Error('Unable to establish connection with database');
	}

	function dieIfNotConnected(timeout) {
		return setTimeout(() => die(), timeout);
	}
}

exports.duplicateKeyError = duplicateKeyError;
exports.notFoundReply = notFoundReply;
exports.validationError = validationError;
exports.mongoError = mongoError;
exports.notFoundExceptionIfEmpty = notFoundExceptionIfEmpty;
exports.NotFoundException = NotFoundException;
exports.notFoundExceptionIfNoMatch = notFoundExceptionIfNoMatch;
exports.connect = connect;
