# Standing Gate

Standing Gate is the existing GitHub Action and CI client for Wheeler Hubbell Publishing's Decision Integrity services. It submits an examination, preserves the signed response, verifies the front-door record against the live issuer key, and records the workflow's separate reception decision.

## Know which service door you are using

The action defaults to `POST /v1/evaluate`. That is the ordinary-agent front door. Its signed `WHP-FRONTDOOR-EVALUATION-v1` record is not a sealed WHP Standing Mark, and a workflow's configured outcome allowlist is not evaluator authorization to deploy, merge, spend, or otherwise execute a consequential action.

The sealed Standing purchase is a distinct route, `POST /v1/evaluations`, described by the live contract. It accepts the structured `WHP-STANDING-STRUCTURED-PASSAGE` submission and can issue a signed Mark or Assessment after its separate authority, quote-binding, payment-finality, and verification requirements are met. This action's default front-door call does not perform that sealed purchase.

Read the live contract before relying on request fields, price, authentication, payment, keys, or verification procedures:

- Contract: <https://api.wheelerhubbellpublishing.com/v1/contract>
- Discovery: <https://api.wheelerhubbellpublishing.com/.well-known/whp-standing.json>
- Front-door description: <https://api.wheelerhubbellpublishing.com/v1/evaluate>
- Verification: <https://api.wheelerhubbellpublishing.com/v1/verification>

## Authentication and payment

For `/v1/evaluate`, provide an authorized WHP API key if one has been provisioned, or use the supported x402 payment flow. The live front-door challenge currently advertises 1 USDC on Base. A paid evaluation purchases an examination, not a favorable determination. Never put a wallet private key in a workflow file, repository, issue, or log; store authorized credentials only as GitHub Actions secrets and keep spending limits under the wallet owner's control.

The sealed `/v1/evaluations` route uses its own exact-quote-bound purchase protocol. Do not assume that a generic x402 client, a front-door payment, or a direct wallet transfer is interchangeable with that protocol.

## CI workflow

```yaml
name: Decision Integrity Gate
on: [pull_request, push]

jobs:
  integrity:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: wheelerhubbell/standing-gate@v0
        with:
          api_key: ${{ secrets.WHP_API_KEY }}
          subject: "${{ github.repository }}@${{ github.sha }}"
          claim: "Review the declared release claim against the submitted evidence and workflow provenance"
          provenance: ${{ github.server_url }}/${{ github.repository }}/commit/${{ github.sha }}
```

This example invokes the front door. Add a secret only after WHP has provisioned an API key, or configure an owner-approved x402 wallet/payment client. If neither is configured, a 402 response is expected and the action should fail closed; do not enable mock mode to make a live workflow appear paid or successful.

## Inputs and outputs

The action accepts `structured_input` as a complete JSON object for the live `/v1/evaluate` request. When it is absent, it builds the supported front-door request from `subject`, `claim`, and `provenance`. Optional predecessor fields are carried into the request; their presence alone does not establish authenticated continuity. Treat continuity as established only when the returned, verified evaluator record itself establishes it.

Outputs preserve the evaluator's returned record, its hash, signature status, and a distinct client reception event. The rendered report is based on the returned record; it does not manufacture evaluator dimensions or convert a client allowlist into authorization. Inspect the complete record and live verification procedure before making a consequential decision.

## Important boundaries

- Payment never buys a favorable result.
- A signed front-door evaluation is not a sealed Standing Mark.
- A valid signature establishes record integrity under the discovered key, not the truth of the submitted claims or external authority.
- A client-side workflow disposition is separate from the examination and does not mutate it.
- A prior hash or continuity object supplied by a caller is not, by itself, proof of lineage.
- Do not claim production deployment, a live paid examination, or independent verification based only on unit tests or mock fixtures.

## Development tests

Run the existing regression tests with the repository's declared dependencies installed:

```sh
node --test test/*.test.cjs
```

The tests exercise credential parsing, challenge validation, signing, response verification, structured-input pass-through, reception separation, and report formatting. Mocked tests are not production integration evidence.
