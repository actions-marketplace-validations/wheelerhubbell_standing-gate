const { createHash, createPublicKey, randomBytes, verify } = require('node:crypto');
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

function parseChainId(network) {
  if (typeof network === 'string' && network.startsWith('eip155:')) {
    return parseInt(network.slice(7), 10);
  }
  if (typeof network === 'number') return network;
  return 8453; // Base default
}

function parseTerms(response, responseBody) {
  const reqHeader = response.headers.get('payment-required');
  if (reqHeader) {
    try {
      const decoded = Buffer.from(reqHeader, 'base64').toString('utf8');
      return JSON.parse(decoded);
    } catch {}
  }
  if (responseBody && typeof responseBody === 'object') {
    return responseBody;
  }
  return {};
}

function validateChallenge(terms) {
  const reqs = terms.payment_requirements || terms.requirements || terms.accepted || (Array.isArray(terms.accepts) ? terms.accepts[0] : null);
  if (!reqs) {
    throw Error('Invalid 402 challenge: missing payment requirements');
  }
  if (!reqs.payTo || !/^0x[0-9a-fA-F]{40}$/.test(reqs.payTo)) {
    throw Error('Invalid 402 challenge: invalid or missing payTo address');
  }
  if (!reqs.asset || !/^0x[0-9a-fA-F]{40}$/.test(reqs.asset)) {
    throw Error('Invalid 402 challenge: invalid or missing asset address');
  }
  if (!reqs.amount || !/^[0-9]+$/.test(String(reqs.amount))) {
    throw Error('Invalid 402 challenge: invalid or missing amount');
  }
  if (reqs.network && !/^eip155:[0-9]+$/.test(reqs.network)) {
    throw Error('Invalid 402 challenge: unsupported network: ' + reqs.network);
  }
  return { requirements: reqs, resource: terms.resource || {} };
}

function generateRandomNonce() {
  return '0x' + randomBytes(32).toString('hex');
}

function deriveStandingNonce(quotePayload) {
  const preimage = canonical({
    domain: 'WHP-STANDING-PURCHASE-BINDING-v1',
    quote: quotePayload,
  });
  return '0x' + createHash('sha256').update(preimage).digest('hex');
}

function prepareAutonomousPayment(terms, payerAddress, options = {}) {
  const { requirements: reqs, resource } = validateChallenge(terms);
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const buffer = options.timeoutBufferSeconds ?? Math.min(reqs.maxTimeoutSeconds || 300, 300);

  let nonce;
  if (reqs.nonce && /^0x[0-9a-fA-F]{64}$/.test(reqs.nonce)) {
    nonce = reqs.nonce.toLowerCase();
  } else if (terms.quote?.payload) {
    nonce = deriveStandingNonce(terms.quote.payload);
  } else {
    nonce = generateRandomNonce();
  }

  const validAfter = String(Math.max(0, now - 60));
  const validBefore = String(terms.expires_at ? Math.min(terms.expires_at, now + buffer) : now + buffer);

  const authorization = {
    from: payerAddress.toLowerCase(),
    to: reqs.payTo.toLowerCase(),
    value: String(reqs.amount),
    validAfter,
    validBefore,
    nonce,
  };

  const domain = {
    name: reqs.extra?.name || 'USD Coin',
    version: reqs.extra?.version || '2',
    chainId: parseChainId(reqs.network),
    verifyingContract: reqs.asset.toLowerCase(),
  };

  const types = {
    TransferWithAuthorization: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' },
    ],
  };

  const typedData = {
    domain,
    types,
    primaryType: 'TransferWithAuthorization',
    message: authorization,
  };

  const completePayment = (signature) => ({
    x402Version: 2,
    resource,
    accepted: reqs,
    payload: {
      signature,
      authorization,
    },
  });

  return {
    typedData,
    authorization,
    requirements: reqs,
    resource,
    completePayment,
  };
}

function formatPaymentSignatureHeader(submission) {
  return Buffer.from(JSON.stringify(submission)).toString('base64');
}

function resolveCredential(env = process.env) {
  let buyerKey = (env.WHP_BUYER_KEY || '').trim();
  let staticCreditToken = '';
  let staticPaymentSignature = '';

  const rawPayment = (env.WHP_PAYMENT || env.WHP_PAYMENT_KEY || '').trim();
  if (rawPayment) {
    if (/^whp_[0-9a-fA-F]{64}$/.test(rawPayment)) {
      staticCreditToken = rawPayment;
    } else if (rawPayment.startsWith('{') || isBase64JsonPayload(rawPayment)) {
      staticPaymentSignature = rawPayment;
    } else if (/^(0x)?[0-9a-fA-F]{64}$/.test(rawPayment)) {
      if (!buyerKey) {
        buyerKey = rawPayment;
      }
    } else {
      throw Error('Unrecognized credential format in WHP_PAYMENT / WHP_PAYMENT_KEY. Expected prepaid credit token (whp_...), x402 payment signature payload, or 32-byte hex private key.');
    }
  }

  if (buyerKey && !/^(0x)?[0-9a-fA-F]{64}$/.test(buyerKey)) {
    throw Error('Invalid WHP_BUYER_KEY: must be a 32-byte hex private key.');
  }

  return { buyerKey, staticCreditToken, staticPaymentSignature };
}

function isBase64JsonPayload(str) {
  try {
    const dec = Buffer.from(str, 'base64').toString('utf8');
    if (!dec.startsWith('{')) return false;
    const parsed = JSON.parse(dec);
    return !!(parsed && (parsed.x402Version || parsed.payload || parsed.signature));
  } catch {
    return false;
  }
}

async function signTypedDataPayload(signerOrKey, prep) {
  // If an external/simulated signer object is provided
  if (signerOrKey && typeof signerOrKey === 'object') {
    if (typeof signerOrKey.signTypedData === 'function') {
      const from = (signerOrKey.address || prep.authorization.from).toLowerCase();
      prep.authorization.from = from;
      prep.typedData.message.from = from;
      const sig = await signerOrKey.signTypedData(prep.typedData);
      return typeof sig === 'string' ? sig : sig.signature;
    }
    if (typeof signerOrKey.request === 'function') {
      // EIP-1193 provider
      const from = (signerOrKey.address || prep.authorization.from).toLowerCase();
      prep.authorization.from = from;
      prep.typedData.message.from = from;
      return signerOrKey.request({
        method: 'eth_signTypedData_v4',
        params: [from, JSON.stringify(prep.typedData)],
      });
    }
  }

  // If a private key string is provided
  if (typeof signerOrKey === 'string' && /^(0x)?[0-9a-fA-F]{64}$/.test(signerOrKey)) {
    const key = signerOrKey.startsWith('0x') ? signerOrKey : '0x' + signerOrKey;
    let viemAccounts;
    try {
      viemAccounts = await import('viem/accounts');
    } catch (e) {
      throw Error('Dynamic EIP-3009 signing with WHP_BUYER_KEY requires viem dependency: ' + e.message);
    }
    const acct = viemAccounts.privateKeyToAccount(key);
    prep.authorization.from = acct.address.toLowerCase();
    prep.typedData.message.from = acct.address.toLowerCase();
    return acct.signTypedData({
      domain: prep.typedData.domain,
      types: prep.typedData.types,
      primaryType: prep.typedData.primaryType,
      message: {
        ...prep.authorization,
        value: BigInt(prep.authorization.value),
        validAfter: BigInt(prep.authorization.validAfter),
        validBefore: BigInt(prep.authorization.validBefore),
      },
    });
  }

  throw Error('No supported signer available to sign EIP-3009 TransferWithAuthorization');
}

async function run(options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const customSigner = options.signer || null;

  const origin = new URL(env.WHP_URL || 'https://api.wheelerhubbellpublishing.com');
  if (origin.protocol !== 'https:' && origin.hostname !== 'localhost' && origin.hostname !== '127.0.0.1') {
    throw Error('HTTPS service required');
  }
  const door = env.WHP_DOOR || '/v1/evaluate';
  const mock = env.WHP_MOCK === 'true';
  const input = options.input || {
    subject: env.WHP_SUBJECT || 'wheelerhubbell/standing-gate',
    claim: env.WHP_CLAIM || 'Release integrity verification',
    provenance: {
      source: 'github-actions',
      authority: 'repository-workflow',
      evidence: [{
        repository: env.WHP_REPOSITORY || 'wheelerhubbell/standing-gate',
        sha: env.WHP_SHA || 'head',
        ref: env.WHP_REF || 'refs/heads/main',
        actor: env.WHP_ACTOR || 'github-actions',
        timestamp: new Date().toISOString()
      }]
    }
  };

  const { buyerKey, staticCreditToken, staticPaymentSignature } = resolveCredential(env);
  const activeSigner = customSigner || buyerKey;

  const headers = {
    'User-Agent': 'Mozilla/5.0 (compatible; WHP-Standing-Gate/1.0)',
    'Content-Type': 'application/json'
  };
  if (mock) headers['X-Mock'] = 'true';

  // Apply pre-formed static credentials if provided
  if (staticCreditToken) {
    headers['Authorization'] = 'Bearer ' + staticCreditToken;
    headers['PAYMENT-SIGNATURE'] = staticCreditToken;
  } else if (staticPaymentSignature) {
    headers['PAYMENT-SIGNATURE'] = staticPaymentSignature;
  }

  const postUrl = new URL(door, origin);
  let response = await fetchImpl(postUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(input),
    redirect: 'error',
    signal: AbortSignal.timeout(20000)
  });

  // Handle 402 challenge
  if (response.status === 402) {
    const rawBody = await response.text().catch(() => '');
    let bodyJson = null;
    try { bodyJson = JSON.parse(rawBody); } catch {}

    if (staticCreditToken || staticPaymentSignature) {
      console.error('Static payment credential refused by service (402):', bodyJson?.error || rawBody);
      throw Error('Payment required (402): static credential rejected (' + (bodyJson?.error || 'INVALID') + ')');
    }

    if (!activeSigner) {
      console.error('PAYMENT_REQUIRED: Paid door requires x402 payment authorization (1 USDC on Base or prepaid developer credits)');
      if (bodyJson?.accepts) {
        console.error('Accepts:', JSON.stringify(bodyJson.accepts, null, 2));
      }
      if (mock) {
        console.error('NOTE: Mock/dry-run bypass is discontinued in production in accordance with Decision Integrity Protocol v1.0. Supply WHP_BUYER_KEY or payment_signature for live evaluation.');
      }
      throw Error('Payment required (402)');
    }

    // Dynamic x402 Handshake
    const terms = parseTerms(response, bodyJson);
    const payerAddress = (typeof activeSigner === 'object' && activeSigner.address)
      ? activeSigner.address
      : (buyerKey ? (await import('viem/accounts')).privateKeyToAccount(buyerKey.startsWith('0x') ? buyerKey : '0x' + buyerKey).address : '0x0000000000000000000000000000000000000000');

    const prep = prepareAutonomousPayment(terms, payerAddress, options);
    const signature = await signTypedDataPayload(activeSigner, prep);
    const submission = prep.completePayment(signature);
    const paymentHeader = formatPaymentSignatureHeader(submission);

    const retryHeaders = {
      ...headers,
      'PAYMENT-SIGNATURE': paymentHeader,
    };

    response = await fetchImpl(postUrl, {
      method: 'POST',
      headers: retryHeaders,
      body: JSON.stringify(input),
      redirect: 'error',
      signal: AbortSignal.timeout(20000)
    });

    if (response.status !== 200) {
      const errText = await response.text().catch(() => '');
      throw Error(`Payment authorization refused (HTTP ${response.status}): ${errText}`);
    }
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
    if (env.GITHUB_OUTPUT) {
      fs.appendFileSync(env.GITHUB_OUTPUT, 'outcome=DRY_RUN_PASSED\nhash=\n');
    }
    return { outcome: 'DRY_RUN_PASSED', hash: '' };
  }

  // Key discovery
  let signingKeyObj = null;
  const discResp = await fetchImpl(new URL('/v1/evaluate', origin), {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    cache: 'no-store',
    signal: AbortSignal.timeout(20000)
  }).catch(() => null);

  if (discResp && discResp.status === 200) {
    const disc = await discResp.json().catch(() => ({}));
    if (disc?.signer?.public_key_b64url) {
      signingKeyObj = parseSpki(disc.signer.public_key_b64url);
    } else if (disc?.admission_url) {
      const admResp = await fetchImpl(new URL(disc.admission_url, origin), {
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
    if (env.GITHUB_OUTPUT) {
      fs.appendFileSync(env.GITHUB_OUTPUT, `outcome=${outcome}\nhash=${record_hash}\n`);
    }
    return { outcome, hash: record_hash, record };
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
    if (env.GITHUB_OUTPUT) {
      fs.appendFileSync(env.GITHUB_OUTPUT, `outcome=${outcome}\nhash=${refHash}\n`);
    }
    return { outcome, hash: refHash, mark: envelope };
  }

  throw Error('Unrecognized response format: expected signed front-door record or sealed Standing Mark');
}

if (require.main === module) {
  run().catch(err => {
    console.error('BLOCKED:', err.message);
    process.exitCode = 1;
  });
}

module.exports = {
  canonical,
  decodeB64Url,
  parseSpki,
  parseChainId,
  parseTerms,
  validateChallenge,
  prepareAutonomousPayment,
  formatPaymentSignatureHeader,
  resolveCredential,
  signTypedDataPayload,
  run
};
