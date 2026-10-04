import { RepositoryError, type RepositoryErrorCode } from '../repository';

type GraphQLError = { message?: string; errorType?: string | null };

// Cognito exception names (aws-amplify/auth errors carry them in `name`).
const AUTH_CODES: Record<string, RepositoryErrorCode> = {
  NotAuthorizedException: 'INVALID_CREDENTIALS',
  UserNotFoundException: 'INVALID_CREDENTIALS',
  UsernameExistsException: 'ACCOUNT_EXISTS',
  AliasExistsException: 'ACCOUNT_EXISTS',
  CodeMismatchException: 'INVALID_CODE',
  ExpiredCodeException: 'INVALID_CODE',
  InvalidPasswordException: 'INVALID_PASSWORD',
  InvalidParameterException: 'VALIDATION',
  LimitExceededException: 'RATE_LIMITED',
  TooManyRequestsException: 'RATE_LIMITED',
  TooManyFailedAttemptsException: 'RATE_LIMITED',
  CodeDeliveryFailureException: 'RATE_LIMITED',
  NetworkError: 'NETWORK',
};

// Codes thrown by amplify/functions/bookings and auth/pre-sign-up.
const SERVER_CODES: Record<string, RepositoryErrorCode> = {
  VALIDATION: 'VALIDATION',
  INVALID_BOOKING: 'INVALID_BOOKING',
  SLOT_TAKEN: 'SLOT_TAKEN',
  SLOT_UNAVAILABLE: 'SLOT_UNAVAILABLE',
  DUPLICATE_BOOKING: 'DUPLICATE_BOOKING',
  NOT_FOUND: 'NOT_FOUND',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  REVIEW_NOT_ELIGIBLE: 'REVIEW_NOT_ELIGIBLE',
  DUPLICATE_REVIEW: 'DUPLICATE_REVIEW',
  CONFLICT: 'CONFLICT',
  PHONE_EXISTS: 'ACCOUNT_EXISTS',
  FREEZE_LIMIT: 'FREEZE_LIMIT',
  FREEZE_NOT_ALLOWED: 'FREEZE_NOT_ALLOWED',
  ACCOUNT_EXISTS: 'ACCOUNT_EXISTS',
  SECTION_NOT_EMPTY: 'CONFLICT',
};

const NETWORK = /network|failed to fetch|network request failed|timeout|offline/i;
const EXPIRED = /no current user|no valid auth|token.*(expired|revoked)|refresh token/i;

function fromText(text: string): RepositoryErrorCode | null {
  const serverCode = Object.keys(SERVER_CODES).find((code) => new RegExp(`\\b${code}\\b`).test(text));
  if (serverCode) return SERVER_CODES[serverCode]!;
  if (EXPIRED.test(text)) return 'SESSION_EXPIRED';
  if (/not authorized|unauthorized/i.test(text)) return 'UNAUTHORIZED';
  if (NETWORK.test(text)) return 'NETWORK';
  return null;
}

// Maps Amplify / Cognito / AppSync failures to RepositoryError; unknown failures pass through (shown as generic).
export function toRepositoryError(e: unknown): unknown {
  if (e instanceof RepositoryError) return e;

  if (Array.isArray(e)) {
    const errors = e as GraphQLError[];
    const code = errors.map((err) => fromText(`${err.errorType ?? ''} ${err.message ?? ''}`)).find(Boolean);
    return code ? new RepositoryError(code, { cause: e }) : new Error(errors.map((err) => err.message).join('; '), { cause: e });
  }

  if (e instanceof Error) {
    if (e.name === 'UserLambdaValidationException') {
      return new RepositoryError(fromText(e.message) ?? 'VALIDATION', { cause: e });
    }
    const code = AUTH_CODES[e.name] ?? fromText(`${e.name} ${e.message}`);
    if (code) return new RepositoryError(code, { cause: e });
  }
  return e;
}
