const encoder = new TextEncoder();

function base64Url(value: Uint8Array | string): string {
  const bytes = typeof value === 'string' ? encoder.encode(value) : value;
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function derLength(length: number): Uint8Array {
  if (length < 128) return new Uint8Array([length]);
  const bytes: number[] = [];
  let remaining = length;
  while (remaining > 0) {
    bytes.unshift(remaining & 0xff);
    remaining >>>= 8;
  }
  return new Uint8Array([0x80 | bytes.length, ...bytes]);
}

function sequence(...parts: Uint8Array[]): Uint8Array {
  const contentLength = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(1 + derLength(contentLength).length + contentLength);
  output[0] = 0x30;
  const length = derLength(contentLength);
  output.set(length, 1);
  let offset = 1 + length.length;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function pkcs1ToPkcs8(pkcs1: Uint8Array): Uint8Array {
  const rsaAlgorithmIdentifier = new Uint8Array([
    0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00,
  ]);
  const version = new Uint8Array([0x02, 0x01, 0x00]);
  const octetLength = derLength(pkcs1.length);
  const privateKey = new Uint8Array(1 + octetLength.length + pkcs1.length);
  privateKey[0] = 0x04;
  privateKey.set(octetLength, 1);
  privateKey.set(pkcs1, 1 + octetLength.length);
  return sequence(version, rsaAlgorithmIdentifier, privateKey);
}

function parsePrivateKey(pem: string): ArrayBuffer {
  const isPkcs1 = pem.includes('BEGIN RSA PRIVATE KEY');
  const base64 = pem.replace(/-----BEGIN [^-]+-----|-----END [^-]+-----|\s/g, '');
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  const result = isPkcs1 ? pkcs1ToPkcs8(bytes) : bytes;
  return result.buffer.slice(result.byteOffset, result.byteOffset + result.byteLength) as ArrayBuffer;
}

export async function createGitHubAppJwt(appId: string, privateKey: string, now = Date.now()): Promise<string> {
  const issuedAt = Math.floor(now / 1000) - 60;
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64Url(JSON.stringify({ iat: issuedAt, exp: issuedAt + 600, iss: appId }));
  const unsigned = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    'pkcs8', parsePrivateKey(privateKey),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'],
  );
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encoder.encode(unsigned));
  return `${unsigned}.${base64Url(new Uint8Array(signature))}`;
}

export async function createInstallationToken(
  appId: string,
  privateKey: string,
  installationId: number,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const jwt = await createGitHubAppJwt(appId, privateKey);
  const response = await fetcher(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
    method: 'POST',
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${jwt}`,
      'user-agent': 'spark-observability',
      'x-github-api-version': '2026-03-10',
    },
  });
  if (!response.ok) throw new Error(`GitHub installation authentication failed (${response.status})`);
  const body = await response.json() as { token?: string };
  if (!body.token) throw new Error('GitHub installation authentication returned no token');
  return body.token;
}
