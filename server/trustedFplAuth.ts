/** Trusted, request-scoped FPL session reader registration.
 *
 * No default provider: there is no FPL OAuth delegation for VORTEX and it
 * would be unsafe to accept user cookies or passwords in a public endpoint.
 *
 * A future authorized first-party connection may register ONE read-only
 * resolver at application boot. It must independently authenticate the
 * requesting VORTEX user and bind that user's FPL session to the request.
 * The resolver returns ONLY a GET-only reader, not credentials. The joint
 * endpoint then verifies /me/ identity against the exact requested entry.
 *
 * No credential bytes, cookie names, email addresses or private /me/
 * payload are stored or returned by this module. Callers may not provide
 * a reader through JSON, query parameters or a browser header.
 */
import type { Request } from 'express';
import type { AuthenticatedFplRead } from './authenticatedCurrentTeam.ts';

export type TrustedFplReadResolver = (
  req:Request,
) => Promise<AuthenticatedFplRead | null>;

let resolver:TrustedFplReadResolver | null=null;

export function registerTrustedFplReadResolver(
  provider:TrustedFplReadResolver,
):void {
  if (typeof provider!=='function' || resolver)
    throw new Error('A trusted, request-scoped FPL read provider was already registered or invalid.');
  resolver=provider;
}

export async function getTrustedFplReadForRequest(
  req:Request,
):Promise<AuthenticatedFplRead | null> {
  // No global cookie/session and no opaque current-account state is reused
  // across users or requests. An unavailable provider fails closed.
  return resolver ? (await resolver(req)) : null;
}
