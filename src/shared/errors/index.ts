export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 500,
    public readonly code: string = "INTERNAL_ERROR",
  ) {
    super(message);
    this.name = "AppError";
  }
}
export class NotFoundError extends AppError {
  constructor(m = "Not found") {
    super(m, 404, "NOT_FOUND");
  }
}
export class UnauthorizedError extends AppError {
  constructor(m = "Unauthorized") {
    super(m, 401, "UNAUTHORIZED");
  }
}
export class ForbiddenError extends AppError {
  constructor(m = "Forbidden") {
    super(m, 403, "FORBIDDEN");
  }
}
export class BadRequestError extends AppError {
  constructor(m = "Bad request") {
    super(m, 400, "BAD_REQUEST");
  }
}
export class RateLimitedError extends AppError {
  constructor(m = "Rate limited") {
    super(m, 429, "RATE_LIMITED");
  }
}
