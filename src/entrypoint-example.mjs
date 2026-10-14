/** EXAMPLE: requires integration with the actual ChatGPT Sites server runtime. */
import {handleSiteMcp} from './site-handler.mjs';
import personaDocs from './persona-docs.json' with {type:'json'};
import {HOST_RULES} from './host-rules.mjs';

/**
 * The Sites builder must supply the trusted authenticated session from its
 * own authentication middleware. The client cannot set session.userId.
 * Site hosting may expose D1 under a different binding name; adapt this file.
 * This example deliberately does not expose an unauthenticated default route.
 */
export async function siteRoute(request, env, verifiedSession) {
  return handleSiteMcp(request, {
    db: env.DB,
    owner: verifiedSession?.userId,
    authenticated: Boolean(verifiedSession?.userId && verifiedSession?.isVerified),
    personaDocs,
    hostRules:HOST_RULES,
    deploymentRevision:'elaina-sites-0.1.0',
  });
}
