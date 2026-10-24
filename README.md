# Standing Gate

> Enforcement layer for the Decision Integrity Protocol and the Standing Mark Service.

Standing Gate is the enforcement layer for the Decision Integrity Protocol. It is not the protocol itself and it is not the public brand. It is the operational gate that checks claims, evidence, scope, and provenance before automated systems proceed.

The canonical architecture is:

- Wheeler Hubbell Publishing — the public brand and research layer
- Decision Integrity Protocol — the governing framework and ruleset
- Unilateral Integrity — the principle that a claim or action may not exceed the authority and provenance that justify it
- Standing Mark Service — the operational evaluation runtime
- Standing Gate — the CI/CD and automated enforcement layer
- Standing Mark / Standing Assessment — the issued outcomes

Standing Gate integrates directly with the Standing Mark Service and applies the protocol in release workflows, CI/CD pipelines, GitHub Actions, and autonomous execution paths.

## What It Does

Standing Gate submits a claim and evaluation context to the protocol and waits for a determination from the Standing Mark Service.

- If the claim is grounded, the protocol can issue a Standing Mark
- If the claim is unsupported, the workflow fails closed with a Standing Assessment
- If the payload is only being structurally validated, the system may use a Structural Dry Run

## Canonical Terminology

Use the following names consistently:

- Brand: Wheeler Hubbell Publishing
- Framework: Decision Integrity Protocol
- Principle: Unilateral Integrity
- Runtime: Standing Mark Service
- Enforcement layer: Standing Gate
- Positive result: Standing Mark
- Negative result: Standing Assessment
- Free validation: Structural Dry Run
- Paid evaluation: Live Evaluation

## Why It Exists

In autonomous systems and machine-driven pipelines, unchecked assertions create unsafe compounding errors. Standing Gate enforces epistemic discipline by requiring a grounded claim before irreversible execution proceeds.

## Pricing and Policy

Payment buys evaluation under published rules. It does not buy a favorable outcome.

A Standing Mark is issued only when the claim is genuinely established under the protocol. A Standing Assessment is issued when the claim exceeds its supporting authority, evidence, or scope.

## Protocol Interfaces

Standing Gate connects to the live Standing Mark Service over the published interfaces of the Decision Integrity Protocol.

## Archive and Canonical Boundary

The live canonical machine is:

- Wheeler Hubbell Publishing
- Decision Integrity Protocol
- Unilateral Integrity
- Standing Mark Service
- Standing Gate
- Standing Mark / Standing Assessment

Any material not directly connected to this live machine is archival context, not the canonical system.

## Example Usage

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
          subject: "${{ github.repository }}@${{ github.sha }}"
          claim: "Commit changes adhere strictly to repository invariants"
```

## Summary

Standing Gate is the automated enforcement layer for the Decision Integrity Protocol. It ensures that the protocol is operationalized in the real world without allowing ungrounded claims, authority drift, or irreversible action on weak assertions.
