# Standing Gate

> **Autonomous Epistemic Evaluation & Decision Integrity Circuit Breaker**  
> Direct integration with Wheeler Hubbell Publishing's machine-verifiable Standing Witness protocol.

[![GitHub Marketplace](https://img.shields.io/badge/Marketplace-Standing%20Gate-blue?logo=github)](https://github.com/marketplace/actions/standing-gate)
[![x402 Payment](https://img.shields.io/badge/x402-USDC%20on%20Base-green)](https://standing-guard-service.lovable.app/v1/contract)
[![MCP Compatible](https://img.shields.io/badge/MCP-Compatible-blue)](https://standing-guard-service.lovable.app/mcp)

Standing Gate is **not a static notary or signature stamp**. It is an active epistemic evaluation pipeline designed for autonomous agents, automated workflows, and release gates. 

Where traditional CI gates only check binary tool exit codes or static checksums, Standing Gate submits claims, evidence, authority bounds, and provenance to Wheeler Hubbell Publishing's reasoning environment (`/v1/evaluate`). The engine deterministically evaluates whether the asserted state is grounded in truth and authorized by admitted warrants—issuing an Ed25519-signed **Standing Mark** (`ESTABLISHED`) or a fail-closed **Standing Assessment** (`NOT_ESTABLISHED`) with explicit blocking unknowns.

---

## Why Epistemic Grounding?

In autonomous systems and agent-to-agent (A2A) pipelines, unverified claims cause catastrophic cascading failures, hallucinations, and epistemic trespassing. 

- **Authority over Assertion**: A claim is never admitted simply because an agent or script asserts it. Evidence, qualifiers, and authority are evaluated simultaneously under formal epistemic bounds (*The Elemental Properties of True*).
- **Fail-Closed by Design**: If provenance is broken, qualifiers are omitted, or evidence is insufficient, evaluation fails closed to `NOT_ESTABLISHED`. Unknowns remain explicitly unknown.
- **Independent Machine Verification**: Results are cryptographically signed using Ed25519 and verifiable offline against canonical root admission and admission schemas.
- **Autonomous Settlement**: Uses the **x402** protocol (gasless EIP-3009 micro-settlements in USDC on Base) for autonomous machine-to-machine evaluation, or prepaid developer tokens.

---

## Evaluation Outcomes & Policy

| Outcome | Meaning | Action Behavior |
| :--- | :--- | :--- |
| **`ESTABLISHED`** | Standing Mark issued. The claim is warranted, bounded, and verified against admitted authority. | Step succeeds (`outcome=ESTABLISHED`). Downstream actions/deployments proceed. |
| **`NOT_ESTABLISHED`** | Standing Assessment issued. The claim lacks sufficient grounding, exceeds bounds, or contains blocking unknowns. | Step fails closed (`outcome=NOT_ESTABLISHED`), halting downstream execution. |
| **`DRY_RUN_PASSED`** | Free structural dry-run (`mock: 'true'`). Validates payload shape and schema without financial settlement or execution authority. | Step succeeds for schema verification (`outcome=DRY_RUN_PASSED`). |

---

## Inputs

| Input | Description | Default |
| :--- | :--- | :--- |
| `service_url` | Base URL of the Standing Witness service | `https://standing-guard-service.lovable.app` |
| `door` | Service evaluation endpoint | `/v1/evaluate` |
| `subject` | Subject identifier, repository, or agent actor | `${{ github.repository }}@${{ github.sha }}` |
| `claim` | Concrete factual claim to evaluate against admitted evidence | `CI/CD pipeline release integrity verification` |
| `mock` | Set to `'true'` for free structural dry-run (zero-cost schema testing) | `'false'` |
| `payment_signature` | x402 payment authorization header or prepaid bearer token (`whp_...`) for live evaluation | `''` |

## Outputs

| Output | Description |
| :--- | :--- |
| `determination` | The evaluation outcome (`ESTABLISHED`, `NOT_ESTABLISHED`, or `DRY_RUN_PASSED`) |
| `record_hash` | Cryptographic SHA-256 hash or reference of the signed evaluation record |

---

## Example Workflows

### 1. Epistemic Circuit Breaker for Production Releases (Live)

Enforce that a release candidate or autonomous decision has established epistemic standing before publishing artifacts or triggering deployments:

```yaml
name: Epistemic Decision Gate
on:
  release:
    types: [published]

jobs:
  verify-standing:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Evaluate Release Decision Integrity
        id: gate
        uses: wheelerhubbell/standing-gate@v0
        with:
          mock: 'false'
          claim: 'Production release artifact commit hash matches signed integrity attestation'
          payment_signature: ${{ secrets.WHP_PAYMENT_SIGNATURE }}

      - name: Proceed with Distribution
        run: |
          echo "Standing successfully established!"
          echo "Decision Record Hash: ${{ steps.gate.outputs.record_hash }}"
```

### 2. Free Structural & Schema Check (Mock / Zero-Cost)

Verify that your pipeline's claim structure, subject identity, and provenance payload conform to WHP intake schemas without incurring settlement fees:

```yaml
name: Pull Request Integrity Check
on: [pull_request]

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - name: Verify Submission Structure
        id: gate
        uses: wheelerhubbell/standing-gate@v0
        with:
          mock: 'true'
          claim: 'Pull request submission conforms to repository provenance bounds'
```

---

## Independent Verification & Protocol Details

- **Protocol Specification**: `WHP-STANDING-ORDINARY-INTAKE/1.0.0`
- **Canonical Admission & Schemas**: `https://standing-guard-service.lovable.app/v1/ordinary/contract.json`
- **Root Verifier**: `https://standing-guard-service.lovable.app/v1/ordinary/verify_ordinary.mjs`
- **Documentation & Research**: [Wheeler Hubbell Publishing](https://github.com/wheelerhubbell/wheelerhubbell.github.io)
