/**
 * Central configuration for the admin portal.
 *
 * Single source of truth for values that may change across releases.
 * Changing AUTH_DEFAULT_LANDING to "/dashboard" will redirect post-login
 * back to the dashboard once it is re-enabled — no other code changes needed.
 */

/** Route the user lands on after successful login. */
export const AUTH_DEFAULT_LANDING = "/patrols";
