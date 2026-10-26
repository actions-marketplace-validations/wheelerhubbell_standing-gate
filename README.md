# Standing Gate

> Epistemic circuit breaker and CI/CD enforcement layer for the Decision Integrity Protocol and the Standing Mark Service.

Standing Gate is the operational enforcement layer for the Decision Integrity Protocol. It evaluates claims, evidence, authority bounds, and provenance before autonomous pipelines, agent swarms, and CI/CD releases moving $100k–$1M+ in consequential value can execute.

The canonical architecture is:

- **Wheeler Hubbell Publishing (WHP)** — Public brand and research layer
- **Decision Integrity Protocol** — Governing framework and ruleset (*The Continuous Work*)
- **Unilateral Integrity** — Principle that a claim or action may never exceed the authority and provenance that justify it
- **Standing Mark Service** — Operational evaluation runtime (`https://api.wheelerhubbellpublishing.com`)
- **Standing Gate** — CI/CD and automated enforcement layer (`standing-gate@v0`)
- **Standing Mark / Standing Assessment** — Signed cryptographic outcome records (Ed25519)

---

## Ingress & Authentication Rails

1. **Commercial Subscription Rails (Developer Sentinel 49/mo [200 evaluations/mo], Team CI/CD Gateway 99/mo [1,000 evaluations/mo], Institutional Sovereign ,500/mo [6,000 evaluations/mo]):**
   - Provide your provisioned API key via `api_key: ${{ secrets.WHP_API_KEY }}` or environment `WHP_API_KEY`.
2. **Autonomous M2M Micropayment Rail (Agent-to-Agent):**
   - 1 Base USDC via x402 challenge and dynamic EIP-3009 transfer authorization.
   - Provide your Base wallet private key via `buyer_key: ${{ secrets.WHP_BUYER_KEY }}`.

---

## CI/CD Workflow Example

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
          claim: "Commit changes adhere strictly to declared authority and repository invariants"
          buyer_key: ${{ secrets.WHP_BUYER_KEY }}
        env:
          WHP_API_KEY: ${{ secrets.WHP_API_KEY }}
          WHP_BUYER_KEY: ${{ secrets.WHP_BUYER_KEY }}
```

---

## Action Inputs

| Input | Description | Required | Default |
|---|---|---|---|
| `api_key` | WHP Subscription API Key (Developer, Team, Institutional). Bypasses per-call x402 challenge. | No | `""` |
| `buyer_key` | Hex private key for autonomous EIP-3009 1 Base USDC signing on HTTP 402 challenge. | No | `""` |
| `subject` | Subject identifier or repository claim. | No | `${{ github.repository }}@${{ github.sha }}` |
| `claim` | Claim to verify or audit under Decision Integrity. | No | `"CI/CD pipeline release integrity verification"` |
| `service_url` | Standing Mark service base URL. | No | `https://api.wheelerhubbellpublishing.com` |
| `door` | Endpoint door to evaluate against. | No | `/v1/evaluate` |

---

## Action Outputs

- `determination`: Evaluation determination outcome (`ACCEPTED`, `ESTABLISHED`, `BOUNDED_DETERMINATION`, etc.)
- `record_hash`: Cryptographic SHA-256 hash of the signed evaluation record.

---

## Epistemic Decision Invariant

Payment purchases deterministic evaluation under published protocol rules, **never an unearned favorable outcome**. If submitted claims strip qualifiers, leak authority, commit coherent substitution, or drift from the governed object, the gate fails closed and halts execution.
