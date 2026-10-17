const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {
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
} = require('../gate-check.cjs');

test('x402 standing-gate unit & regression test suite', async (t) => {
  const payTo = '0x1050eddd8282623b0c263ed6bdbd42370bbc28d3';
  const asset = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';

  await t.test('1. Credential Resolution & Disambiguation', () => {
    // 1a. Prepaid credit token
    const credToken = 'whp_' + 'ab'.repeat(32);
    const r1 = resolveCredential({ WHP_PAYMENT: credToken });
    assert.equal(r1.staticCreditToken, credToken);
    assert.equal(r1.staticPaymentSignature, '');
    assert.equal(r1.buyerKey, '');

    // 1b. Static payment payload (base64 JSON)
    const payloadJson = JSON.stringify({ x402Version: 2, payload: { signature: '0x123' } });
    const b64Payload = Buffer.from(payloadJson).toString('base64');
    const r2 = resolveCredential({ WHP_PAYMENT: b64Payload });
    assert.equal(r2.staticPaymentSignature, b64Payload);
    assert.equal(r2.staticCreditToken, '');
    assert.equal(r2.buyerKey, '');

    // 1c. Buyer key in WHP_BUYER_KEY
    const privKey = '0x' + '1234567890abcdef'.repeat(4);
    const r3 = resolveCredential({ WHP_BUYER_KEY: privKey });
    assert.equal(r3.buyerKey, privKey);
    assert.equal(r3.staticCreditToken, '');
    assert.equal(r3.staticPaymentSignature, '');

    // 1d. Private key in WHP_PAYMENT_KEY
    const r4 = resolveCredential({ WHP_PAYMENT_KEY: privKey });
    assert.equal(r4.buyerKey, privKey);
    assert.equal(r4.staticCreditToken, '');
    assert.equal(r4.staticPaymentSignature, '');

    // 1e. Reject invalid ambiguous credentials
    assert.throws(() => resolveCredential({ WHP_PAYMENT: 'invalid-secret-token' }), /Unrecognized credential format/);
    assert.throws(() => resolveCredential({ WHP_BUYER_KEY: 'not-a-private-key' }), /Invalid WHP_BUYER_KEY/);
  });

  await t.test('2. 402 Challenge Parsing & Validation', () => {
    const rawTerms = {
      x402Version: 2,
      resource: { url: 'https://api.wheelerhubbellpublishing.com/v1/evaluate' },
      accepts: [{
        scheme: 'exact',
        network: 'eip155:8453',
        amount: '1000000',
        asset,
        payTo,
        maxTimeoutSeconds: 300,
        extra: { name: 'USD Coin', version: '2' }
      }]
    };

    // Header parse
    const mockHeaders = new Map([
      ['payment-required', Buffer.from(JSON.stringify(rawTerms)).toString('base64')]
    ]);
    const mockResp = { headers: mockHeaders };
    const parsed = parseTerms(mockResp, null);
    assert.deepEqual(parsed.accepts, rawTerms.accepts);

    // Validation
    const { requirements } = validateChallenge(parsed);
    assert.equal(requirements.payTo, payTo);
    assert.equal(requirements.asset, asset);
    assert.equal(requirements.amount, '1000000');
    assert.equal(parseChainId(requirements.network), 8453);

    // Rejection on invalid challenge
    assert.throws(() => validateChallenge({}), /missing payment requirements/);
    assert.throws(() => validateChallenge({ accepts: [{ payTo: 'invalid', asset, amount: '100' }] }), /invalid or missing payTo/);
    assert.throws(() => validateChallenge({ accepts: [{ payTo, asset: 'invalid', amount: '100' }] }), /invalid or missing asset/);
    assert.throws(() => validateChallenge({ accepts: [{ payTo, asset, amount: '' }] }), /invalid or missing amount/);
  });

  await t.test('3. EIP-3009 Authorization Preparation & x402 Packaging', () => {
    const payer = '0x2222222222222222222222222222222222222222';
    const terms = {
      x402Version: 2,
      resource: { url: 'https://api.wheelerhubbellpublishing.com/v1/evaluate' },
      accepts: [{
        scheme: 'exact',
        network: 'eip155:8453',
        amount: '1000000',
        asset,
        payTo,
        maxTimeoutSeconds: 300,
        extra: { name: 'USD Coin', version: '2' }
      }]
    };

    const prep = prepareAutonomousPayment(terms, payer, { nowSeconds: 2000 });
    assert.equal(prep.authorization.from, payer.toLowerCase());
    assert.equal(prep.authorization.to, payTo.toLowerCase());
    assert.equal(prep.authorization.value, '1000000');
    assert.equal(prep.authorization.validAfter, '1940');
    assert.equal(prep.authorization.validBefore, '2300');
    assert.match(prep.authorization.nonce, /^0x[0-9a-fA-F]{64}$/);

    assert.equal(prep.typedData.domain.chainId, 8453);
    assert.equal(prep.typedData.domain.verifyingContract, asset.toLowerCase());
    assert.equal(prep.typedData.domain.name, 'USD Coin');
    assert.equal(prep.typedData.domain.version, '2');

    const dummySig = '0x' + 'aa'.repeat(64) + '1c';
    const submission = prep.completePayment(dummySig);
    assert.equal(submission.x402Version, 2);
    assert.equal(submission.payload.signature, dummySig);
    assert.equal(submission.payload.authorization.nonce, prep.authorization.nonce);

    const header = formatPaymentSignatureHeader(submission);
    const decoded = JSON.parse(Buffer.from(header, 'base64').toString('utf8'));
    assert.equal(decoded.x402Version, 2);
    assert.equal(decoded.payload.signature, dummySig);
  });

  await t.test('4. Signing with Simulated Signer (EIP-712 message verification)', async () => {
    const payer = '0x3333333333333333333333333333333333333333';
    let signedMessage = null;
    const simulatedSigner = {
      address: payer,
      signTypedData: async (typedData) => {
        signedMessage = typedData;
        return '0x' + '99'.repeat(64) + '1b';
      }
    };

    const terms = {
      accepts: [{
        network: 'eip155:8453',
        amount: '1000000',
        asset,
        payTo,
        extra: { name: 'USD Coin', version: '2' }
      }]
    };
    const prep = prepareAutonomousPayment(terms, payer, { nowSeconds: 1500 });
    const sig = await signTypedDataPayload(simulatedSigner, prep);

    assert.equal(sig, '0x' + '99'.repeat(64) + '1b');
    assert.ok(signedMessage);
    assert.equal(signedMessage.domain.chainId, 8453);
    assert.equal(signedMessage.message.from, payer.toLowerCase());
    assert.equal(signedMessage.message.to, payTo.toLowerCase());
    assert.equal(signedMessage.message.value, '1000000');
  });

  await t.test('5. Signing with viem privateKeyToAccount', async () => {
    const privKey = '0x4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a0f367417';
    const terms = {
      accepts: [{
        network: 'eip155:8453',
        amount: '1000000',
        asset,
        payTo,
        extra: { name: 'USD Coin', version: '2' }
      }]
    };
    const prep = prepareAutonomousPayment(terms, '0x0000000000000000000000000000000000000000', { nowSeconds: 1000 });
    const sig = await signTypedDataPayload(privKey, prep);

    assert.equal(sig.length, 132); // 0x + 64 bytes r,s + 1 byte v
    assert.match(sig, /^0x[0-9a-fA-F]{130}$/);
    assert.equal(prep.authorization.from, '0xe215d9513420c3ff852c7f4ec957991de62a6ed4');
  });

  await t.test('6. End-to-end simulated 402 handshake -> retry -> signed result', async () => {
    // Generate Ed25519 keypair for service signature
    const { privateKey: edPriv, publicKey: edPub } = crypto.generateKeyPairSync('ed25519');
    const edPubDer = edPub.export({ format: 'der', type: 'spki' });
    const edPubRaw = edPubDer.subarray(edPubDer.length - 32);
    const edPubB64Url = edPubRaw.toString('base64url');

    const expectedRecord = {
      type: 'WHP-FRONTDOOR-EVALUATION-v1',
      issuer: 'Wheeler Hubbell Publishing — WHP Standing front door',
      not_sealed_mark: true,
      input: { subject: 'test-subject', claim: 'test-claim' },
      determination: { outcome: 'ESTABLISHED', required_missing: [] }
    };
    const recordBytes = Buffer.from(canonical(expectedRecord));
    const recordHash = crypto.createHash('sha256').update(recordBytes).digest('hex');
    const sigBytes = crypto.sign(null, recordBytes, edPriv);
    const sigB64Url = sigBytes.toString('base64url');

    const signedResponse = {
      record: expectedRecord,
      record_hash: recordHash,
      signature: { alg: 'Ed25519', public_key_b64url: edPubB64Url, value_b64url: sigB64Url }
    };

    let step = 0;
    let paymentSignatureHeader = null;

    const mockFetch = async (url, opts = {}) => {
      const urlStr = url.toString();
      // Discovery GET
      if (opts.method === 'GET' || !opts.method) {
        return {
          status: 200,
          json: async () => ({
            signer: { alg: 'Ed25519', public_key_b64url: edPubB64Url }
          })
        };
      }

      step++;
      if (step === 1) {
        // Initial POST -> return 402 with challenge
        const terms = {
          x402Version: 2,
          resource: { url: 'https://api.wheelerhubbellpublishing.com/v1/evaluate' },
          accepts: [{
            scheme: 'exact',
            network: 'eip155:8453',
            amount: '1000000',
            asset,
            payTo,
            maxTimeoutSeconds: 300,
            extra: { name: 'USD Coin', version: '2' }
          }]
        };
        const b64 = Buffer.from(JSON.stringify(terms)).toString('base64');
        return {
          status: 402,
          headers: new Map([['payment-required', b64]]),
          text: async () => JSON.stringify(terms),
          json: async () => terms
        };
      }

      if (step === 2) {
        // Retry POST -> check payment header
        paymentSignatureHeader = opts.headers['PAYMENT-SIGNATURE'];
        assert.ok(paymentSignatureHeader, 'Retry must include PAYMENT-SIGNATURE');
        const decoded = JSON.parse(Buffer.from(paymentSignatureHeader, 'base64').toString('utf8'));
        assert.equal(decoded.x402Version, 2);
        assert.equal(decoded.accepted.payTo, payTo);
        assert.equal(decoded.payload.authorization.to, payTo.toLowerCase());
        assert.equal(decoded.payload.signature, '0x' + '77'.repeat(64) + '1b');

        return {
          status: 200,
          text: async () => JSON.stringify(signedResponse),
          json: async () => signedResponse
        };
      }

      throw Error('Unexpected fetch call');
    };

    const simulatedSigner = {
      address: '0x4444444444444444444444444444444444444444',
      signTypedData: async () => '0x' + '77'.repeat(64) + '1b'
    };

    const result = await run({
      env: {
        WHP_URL: 'https://api.wheelerhubbellpublishing.com',
        WHP_DOOR: '/v1/evaluate'
      },
      proactive: false,
      signer: simulatedSigner,
      fetchImpl: mockFetch
    });

    assert.equal(result.outcome, 'ESTABLISHED');
    assert.equal(result.hash, recordHash);
    assert.equal(step, 2);
    assert.ok(paymentSignatureHeader);
  });

  await t.test('8. Proactive Zero-Handshake M2M (single-roundtrip call #1)', async () => {
    const { privateKey: edPriv, publicKey: edPub } = crypto.generateKeyPairSync('ed25519');
    const edPubDer = edPub.export({ format: 'der', type: 'spki' });
    const edPubRaw = edPubDer.subarray(edPubDer.length - 32);
    const edPubB64Url = edPubRaw.toString('base64url');

    const expectedRecord = {
      type: 'WHP-FRONTDOOR-EVALUATION-v1',
      issuer: 'Wheeler Hubbell Publishing — WHP Standing front door',
      not_sealed_mark: true,
      input: { subject: 'test-subject', claim: 'test-claim' },
      determination: { outcome: 'ESTABLISHED', required_missing: [] }
    };
    const recordBytes = Buffer.from(canonical(expectedRecord));
    const recordHash = crypto.createHash('sha256').update(recordBytes).digest('hex');
    const sigBytes = crypto.sign(null, recordBytes, edPriv);
    const sigB64Url = sigBytes.toString('base64url');

    const signedResponse = {
      record: expectedRecord,
      record_hash: recordHash,
      signature: { alg: 'Ed25519', public_key_b64url: edPubB64Url, value_b64url: sigB64Url }
    };

    let postCallCount = 0;
    let firstCallHeaders = null;

    const mockFetch = async (url, opts = {}) => {
      if (opts.method === 'GET' || !opts.method) {
        return {
          status: 200,
          json: async () => ({ signer: { alg: 'Ed25519', public_key_b64url: edPubB64Url } })
        };
      }
      postCallCount++;
      firstCallHeaders = opts.headers;
      
      return {
        status: 200,
        text: async () => JSON.stringify(signedResponse),
        json: async () => signedResponse
      };
    };

    const dummySigner = {
      address: '0x4444444444444444444444444444444444444444',
      signTypedData: async () => '0x' + '77'.repeat(64) + '1b'
    };

    const res = await run({
      env: {
        WHP_ORIGIN: 'https://api.wheelerhubbellpublishing.com',
        WHP_DOOR: '/v1/evaluate'
      },
      signer: dummySigner,
      fetchImpl: mockFetch
    });

    assert.equal(postCallCount, 1, 'Should complete in exactly 1 POST call with zero retries');
    assert.ok(firstCallHeaders['PAYMENT-SIGNATURE'], 'First call must include PAYMENT-SIGNATURE');
    assert.equal(res.outcome, 'ESTABLISHED');
    assert.equal(res.hash, recordHash);
  });

  await t.test('7. Rejection paths', async () => {
    // 7a. 402 when no signer provided
    const mockFetch402 = async () => ({
      status: 402,
      headers: new Map(),
      text: async () => JSON.stringify({ error: 'Payment required' }),
      json: async () => ({ error: 'Payment required' })
    });
    await assert.rejects(
      () => run({ env: { WHP_URL: 'https://api.wheelerhubbellpublishing.com' }, fetchImpl: mockFetch402 }),
      /Payment required \(402\)/
    );

    // 7b. 402 retry rejected by server
    let count = 0;
    const mockFetchReject = async (url, opts) => {
      count++;
      if (count === 1) {
        return {
          status: 402,
          headers: new Map(),
          text: async () => JSON.stringify({
            accepts: [{ network: 'eip155:8453', amount: '1000000', asset, payTo }]
          }),
          json: async () => ({
            accepts: [{ network: 'eip155:8453', amount: '1000000', asset, payTo }]
          })
        };
      }
      return {
        status: 402,
        text: async () => 'PAYMENT_SETTLEMENT_FAILED: insufficient balance'
      };
    };

    const simulatedSigner = {
      address: '0x5555555555555555555555555555555555555555',
      signTypedData: async () => '0x' + '88'.repeat(64) + '1b'
    };

    await assert.rejects(
      () => run({
        env: { WHP_URL: 'https://api.wheelerhubbellpublishing.com' },
        signer: simulatedSigner,
        fetchImpl: mockFetchReject
      }),
      /Payment authorization refused \(HTTP 402\)/
    );
  });
});
