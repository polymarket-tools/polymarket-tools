/**
 * Polymarket Builder Signer -- Cloudflare Worker
 *
 * Signs CLOB requests with builder HMAC headers for volume attribution.
 * Builder credentials (key/secret/passphrase) are stored as Worker secrets,
 * never exposed to clients.
 *
 * The n8n node calls this endpoint at trade time. The response contains
 * the 4 POLY_BUILDER_* headers that get attached to the CLOB request.
 */

interface Env {
  BUILDER_KEY: string;
  BUILDER_SECRET: string;
  BUILDER_PASSPHRASE: string;
}

interface SignRequest {
  method: string;
  path: string;
  body?: string;
}

/**
 * Build HMAC-SHA256 signature matching @polymarket/builder-signing-sdk.
 * Signature = HMAC-SHA256(secret, timestamp + method + path + body)
 */
async function buildHmacSignature(
  secret: string,
  timestamp: string,
  method: string,
  path: string,
  body: string,
): Promise<string> {
  const message = timestamp + method + path + body;
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    if (request.method !== 'POST') {
      return Response.json({ error: 'POST required' }, { status: 405 });
    }

    // Validate secrets are configured
    if (!env.BUILDER_KEY || !env.BUILDER_SECRET || !env.BUILDER_PASSPHRASE) {
      return Response.json({ error: 'Builder credentials not configured' }, { status: 500 });
    }

    let payload: SignRequest;
    try {
      payload = await request.json();
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    if (!payload.method || !payload.path) {
      return Response.json({ error: 'method and path are required' }, { status: 400 });
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = await buildHmacSignature(
      env.BUILDER_SECRET,
      timestamp,
      payload.method.toUpperCase(),
      payload.path,
      payload.body ?? '',
    );

    return Response.json({
      POLY_BUILDER_API_KEY: env.BUILDER_KEY,
      POLY_BUILDER_PASSPHRASE: env.BUILDER_PASSPHRASE,
      POLY_BUILDER_SIGNATURE: signature,
      POLY_BUILDER_TIMESTAMP: timestamp,
    }, {
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
    });
  },
};
