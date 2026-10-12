const { createHash, createPublicKey, verify } = require('node:crypto');
const fs = require('node:fs');

function canonical(v) {
  if (v === null || typeof v === 'boolean' || typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number' && Number.isSafeInteger(v) && !Object.is(v, -0)) return String(v);
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort((a,b) => {
      const x = Array.from(a, c => c.codePointAt(0)), y = Array.from(b, c => c.codePointAt(0));
      for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i] - y[i];
      return x.length - y.length;
    }).map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  }
  throw Error('Unsupported canonical value');
}

function decodeB64Url(v, size) {
  if (typeof v !== 'string' || !/^[A-Za-z0-9_-]+$/.test(v)) throw Error('Invalid signature encoding');
  const b = Buffer.from(v, 'base64url');
  if (size && b.length !== size) throw Error(`Expected signature length ${size}, got ${b.length}`);
  return b;
}

function parseSpki(pubKeyInput) {
  // Can be base64 DER SPKI, base64url raw 32-byte Ed25519, or hex
  if (typeof pubKeyInput !== 'string') throw Error('Invalid public key format');
  const trimmed = pubKeyInput.trim();
  if (trimmed.length === 64 && /^[0-9a-fA-F]+$/.test(trimmed)) {
    const raw = Buffer.from(trimmed, 'hex');
    return createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), raw]), format: 'der', type: 'spki' });
  }
  try {
    const rawB64 = Buffer.from(trimmed, 'base64');
    if (rawB64.length === 44 && rawB64[0] === 0x30) {
      return createPublicKey({ key: rawB64, format: 'der', type: 'spki' });
    }
  } catch {}
  try {
    const rawUrl = Buffer.from(trimmed, 'base64url');
    if (rawUrl.length === 32) {
      return createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), rawUrl]), format: 'der', type: 'spki' });
    }
  } catch {}
  throw Error('Unable to parse Ed25519 public key');
}

async function run() {
  const origin = new URL(process.env.WHP_URL || 'https://standing-guard-service.lovable.app');
  if (origin.protocol !== 'https:' && origin.hostname !== 'localhost' && origin.hostname !== '127.0.0.1') {
    throw Error('HTTPS service required');
  }
  const door = process.env.WHP_DOOR || '/v1/evaluate';
  const mock = process.env.WHP_MOCK === 'true';
  const input = {
    subject: process.env.WHP_SUBJECT || 'wheelerhubbell/standing-gate',
    claim: process.env.WHP_CLAIM || 'Release integrity verification',
    provenance: {
      source: 'github-actions',
      authority: 'repository-workflow',
      evidence: [{
        repository: process.env.WHP_REPOSITORY || 'wheelerhubbell/standing-gate',
        sha: process.env.WHP_SHA || 'head',
        ref: process.env.WHP_REF || 'refs/heads/main',
        actor: process.env.WHP_ACTOR || 'github-actions',
        timestamp: new Date().toISOString()
      }]
    }
  };

  const headers = {
    'User-Agent': 'Mozilla/5.0 (compatible; WHP-Standing-Gate/1.0)',
    'Content-Type': 'application/json'
  };
  if (mock) headers['X-Mock'] = 'true';
  if (process.env.WHP_PAYMENT) {
    headers['PAYMENT-SIGNATURE'] = process.env.WHP_PAYMENT;
    headers['Authorization'] = 'Bearer ' + process.env.WHP_PAYMENT;
  }

  const response = await fetch(new URL(door, origin), {
    method: 'POST',
    headers,
    body: JSON.stringify(input),
    redirect: 'error',
    signal: AbortSignal.timeout(20000)
  });

  if (response.status === 402 && !process.env.WHP_PAYMENT) {
    const terms = await response.json().catch(() => ({}));
    console.error('PAYMENT_REQUIRED: Paid door requires x402 payment authorization');
    if (terms.accepts) {
      console.error('Accepts:', JSON.stringify(terms.accepts, null, 2));
    }
    throw Error('Payment required (402)');
  }
  if (response.status !== 200) {
    throw Error(`HTTP ${response.status}: ${await response.text().catch(() => '')}`);
  }

  const data = await response.json();

  // Mock handling
  if (mock) {
    if ((data?.mock !== true && data?.not_a_determination !== true) || data.structurally_complete !== true) {
      throw Error('Malformed or failed requested mock check');
    }
    console.log('DRY_RUN_PASSED: non-authorizing structural check');
    if (process.env.GITHUB_OUTPUT) {
      fs.appendFileSync(process.env.GITHUB_OUTPUT, 'outcome=DRY_RUN_PASSED\nhash=\n');
    }
    return;
  }

  // Key discovery
  let signingKeyObj = null;
  const discResp = await fetch(new URL('/v1/evaluate', origin), {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    cache: 'no-store',
    signal: AbortSignal.timeout(20000)
  }).catch(() => null);

  if (discResp && discResp.status === 200) {
    const disc = await discResp.json().catch(() => ({}));
    if (disc?.signer?.public_key_b64url) {
      signingKeyObj = parseSpki(disc.signer.public_key_b64url);
    } else if (disc?.admission_url) {
      const admResp = await fetch(new URL(disc.admission_url, origin), {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        cache: 'no-store'
      }).catch(() => null);
      if (admResp && admResp.status === 200) {
        const adm = await admResp.json().catch(() => ({}));
        const pub = adm?.issuer_certificate?.payload?.public_key;
        if (pub) signingKeyObj = parseSpki(pub);
      }
    }
  }

  // Format 1: WHP-FRONTDOOR-EVALUATION-v1
  if (data.record && data.signature) {
    const { record, signature, record_hash } = data;
    if (record.type !== 'WHP-FRONTDOOR-EVALUATION-v1') throw Error('Unexpected record type: ' + record.type);
    if (record.mock === true || record.environment === 'TEST') throw Error('Mock/test record returned in live mode');

    const bytes = Buffer.from(canonical(record));
    const computedHash = createHash('sha256').update(bytes).digest('hex');
    if (computedHash !== record_hash) throw Error('Record hash mismatch');

    if (signingKeyObj) {
      const sigBytes = decodeB64Url(signature.value_b64url, 64);
      if (!verify(null, bytes, signingKeyObj, sigBytes)) {
        throw Error('Ed25519 signature verification failed');
      }
    }

    const outcome = record.determination?.outcome;
    if (!['RECOGNIZED WITH BOUNDARIES', 'ESTABLISHED'].includes(outcome)) {
      throw Error(`Non-positive determination: ${outcome}`);
    }

    console.log(`STANDING_ESTABLISHED: outcome=${outcome}`);
    console.log(`RECORD_HASH: ${record_hash}`);
    if (process.env.GITHUB_OUTPUT) {
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `outcome=${outcome}\nhash=${record_hash}\n`);
    }
    return;
  }

  // Format 2: Sealed WHP-STANDING-MARK-v2 / WHP-STANDING-RESULT-v2
  if (data.protected && data.payload && data.signature) {
    const envelope = data;
    const kind = envelope.protected.type;
    const bytes = Buffer.from(canonical({ protected: envelope.protected, payload: envelope.payload }));

    if (signingKeyObj) {
      const sigBytes = Buffer.from(envelope.signature, 'base64');
      if (!verify(null, bytes, signingKeyObj, sigBytes)) {
        throw Error('Sealed Mark Ed25519 signature verification failed');
      }
    }

    const outcome = envelope.payload.decision_record?.outcome;
    const refHash = envelope.payload.decision_record_ref || createHash('sha256').update(bytes).digest('hex');

    if (outcome !== 'ESTABLISHED') {
      throw Error(`Standing outcome not established: ${outcome}`);
    }

    console.log(`STANDING_ESTABLISHED: ${kind} outcome=${outcome}`);
    console.log(`RECORD_REF: ${refHash}`);
    if (process.env.GITHUB_OUTPUT) {
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `outcome=${outcome}\nhash=${refHash}\n`);
    }
    return;
  }

  throw Error('Unrecognized response format: expected signed front-door record or sealed Standing Mark');
}

run().catch(err => {
  console.error('BLOCKED:', err.message);
  process.exitCode = 1;
});
