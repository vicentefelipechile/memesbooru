// =========================================================================================================
// DOMAIN ERRORS (v2)
// =========================================================================================================
// Generic error hierarchy — services throw these, routes let them bubble to app.onError.
// =========================================================================================================

import type { ErrorDetails } from '../types';

export class DomainError extends Error {
	readonly status: number;
	readonly details?: ErrorDetails;
	constructor(message: string, status: number, details?: ErrorDetails) {
		super(message);
		this.name = this.constructor.name;
		this.status = status;
		this.details = details;
	}
}

export class NotFoundError extends DomainError {
	constructor(msg = 'Not found') {
		super(msg, 404);
	}
}

export class UnauthorizedError extends DomainError {
	constructor(msg = 'Unauthorized') {
		super(msg, 401);
	}
}

export class ForbiddenError extends DomainError {
	constructor(msg = 'Forbidden') {
		super(msg, 403);
	}
}

export class ValidationError extends DomainError {
	constructor(msg = 'Invalid input', details?: ErrorDetails) {
		super(msg, 400, details);
	}
}

export class ConflictError extends DomainError {
	constructor(msg = 'Conflict') {
		super(msg, 409);
	}
}

export class GoneError extends DomainError {
	constructor(msg = 'Gone') {
		super(msg, 410);
	}
}

export class RateLimitedError extends DomainError {
	constructor(msg = 'Rate limited') {
		super(msg, 429);
	}
}
