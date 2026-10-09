# Standing Gate

A GitHub Action that checks standing-record integrity and blocks live execution when current standing or execution permission cannot be verified.

## Current limitation

Live mode currently blocks every execution attempt. The current-status endpoint has not shipped, and an ordinary signed record does not establish execution permission. Publishing this action does not remove that limitation. A future service endpoint alone will not enable execution without a reviewed action update.

Mock mode is a non-authorizing structural dry run. A passing mock result is not a live clearance or permission to deploy.

## Inputs

- `service_url`: Standing Witness service base URL.
- `door`: `/v1/evaluate`, `/v1/audit`, or `/v1/ping`.
- `subject`: subject or repository claim.
- `claim`: claim to check.
- `mock`: `true` for a structural dry run; defaults to `false`.
- `payment_signature`: optional payment authorization for a paid service door.

Paid doors can charge for an evaluation even when the gate blocks. Payment does not buy clearance. This action does not create a payment authorization for you.

## Output

A successful mock run reports `DRY_RUN_PASSED` without a record hash. Live mode currently exits unsuccessfully rather than issuing clearance.

Source: Wheeler Hubbell Publishing's fixed action at commit `5ef7c68484436c4d68d254142e0905314274217f`.
