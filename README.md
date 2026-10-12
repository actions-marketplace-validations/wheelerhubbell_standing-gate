# Standing Gate

A GitHub Action that performs cryptographic claim evaluation and standing verification against Wheeler Hubbell Publishing's Standing Witness service.

## Verification & Execution Policy

- **Mock mode (`mock: 'true'`)**: Performs a free structural dry-run verifying request shape without financial settlement or execution authority. A passing mock check outputs `outcome=DRY_RUN_PASSED`.
- **Live mode (`mock: 'false'`)**: Evaluates the claim against the Standing service, cryptographically verifies the issuer's Ed25519 signature and SHA-256 record hash, confirms the evaluation outcome, and sets GitHub Action step outputs (`outcome` and `record_hash`).

## Inputs

- `service_url`: Standing Witness service base URL (default: `https://standing-guard-service.lovable.app`).
- `door`: Service door to evaluate against (default: `/v1/evaluate`).
- `subject`: Subject identifier or repository claim (default: `${{ github.repository }}@${{ github.sha }}`).
- `claim`: Claim to verify or audit (default: `CI/CD pipeline release integrity verification`).
- `mock`: Set to `'true'` for a free dry-run structural verification; defaults to `'false'`.
- `payment_signature`: Optional x402 payment authorization header for live evaluations.

## Outputs

- `determination`: The evaluation outcome (`DRY_RUN_PASSED`, `ESTABLISHED`, or `RECOGNIZED WITH BOUNDARIES`).
- `record_hash`: Cryptographic SHA-256 hash or reference of the signed record.

## Example Workflows

### Structural Dry Run (Free)

```yaml
name: Standing Gate Check
on: [push, pull_request]

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - name: Verify Standing Structure
        id: gate
        uses: wheelerhubbell/standing-gate@main
        with:
          mock: 'true'
          claim: 'Commit and build artifacts conform to integrity requirements'
```

### Live Standing Verification

```yaml
name: Production Release Gate
on:
  release:
    types: [published]

jobs:
  gate:
    runs-on: ubuntu-latest
    steps:
      - name: Verify Standing
        id: gate
        uses: wheelerhubbell/standing-gate@main
        with:
          mock: 'false'
          payment_signature: ${{ secrets.WHP_PAYMENT_SIGNATURE }}
          claim: 'Release candidate verified for production distribution'
      - name: Deploy
        run: echo "Standing established with record hash ${{ steps.gate.outputs.record_hash }}"
```
