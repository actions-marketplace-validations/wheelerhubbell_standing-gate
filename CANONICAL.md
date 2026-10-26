# Standing Gate Canonical Machine

## Whole-system reading rule

Standing Gate is one enforcement component, not the WHP service by itself. Read this repository with the governing text, *Decision Integrity: The Continuous Work*, the other three canonical repositories, and the current live contract at `https://api.wheelerhubbellpublishing.com/v1/contract`. Repository code/configuration and live responses establish implementation; this document defines scope, not proof that every end-to-end path has run.

The gate currently defaults to `/v1/evaluate` (`gate-check.cjs`). Do not conflate that ordinary-agent structural evaluation record with the separate sealed WHP Standing flow at `/v1/evaluations`. A successful gate result does not by itself prove a sealed Standing Mark issuance, finalized payment, subscription entitlement, or end-to-end settlement. Verify the exact path and evidence before making those claims.

This repository is not a general-purpose archive. It is the live enforcement layer for the Wheeler Hubbell Publishing decision-integrity system.

The live canonical machine is exactly this:

- Wheeler Hubbell Publishing
- Decision Integrity Protocol
- Unilateral Integrity
- Standing Mark Service
- Standing Gate
- Standing Mark
- Standing Assessment

## Rule

A leaf cannot define the whole.

The system is defined by the canonical root, not by a single helper file, test artifact, or legacy note.

If a file does not directly serve the live canonical machine, it belongs under `archive/` and must not be treated as current system identity.

## Scope

This repo's live scope is limited to:

- the enforcement gate itself
- the protocol interface contract
- CI/CD integration and automation
- claim evaluation flow
- live and structural evaluation outcomes

## Archive rule

Any historical or exploratory material not connected to the current enforcement path belongs under the archive and must not be mistaken for the canonical system.

## Enforcement

No assistant, workflow, or contributor should treat a single helper script, test note, or legacy artifact as the whole of Standing Gate.

The live canonical machine above is the only authoritative definition of the current system.
