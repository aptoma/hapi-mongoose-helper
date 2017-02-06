# Hapi Mongoose Helper

Utility functions for using mongoose with hapi.

## Installation

This module is installed via npm:

	$ npm install @aptoma/hapi-mongoose-helper

## Example

	const mongooseHelper = require('@aptoma/hapi-mongoose-helper');
	const mongoose = require('mongoose');
	const server = new Hapi.Server();
	server.connection();

	mongooseHelper
		.connect(mongoose, server, config.database)
		.then(() => server.start())
		.then(() => {
			server.log('info', pkgInfo.name + ' v' + pkgInfo.version + ' started at: ' + server.info.uri);
		})
		.catch((err) => {
			console.error('Error starting server', err);
			process.exit(1);
		});
