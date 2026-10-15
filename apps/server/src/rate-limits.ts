const ONE_HOUR_MS = 60 * 60 * 1000;

/** Sign-up: 5 per hour per IP address (08-m1-build Settings). */
export const SIGN_UP_RATE_LIMIT = { max: 5, timeWindow: ONE_HOUR_MS };
