# IT Request: Restrict the app's Mail.Send to the sera@ mailbox only

**App:** Two Seasons Insights Login Digitlab
**Client ID:** `a903ed32-cb50-4bce-bf4f-9c4e8c4d13f1`
**Tenant:** Two Seasons hotel (`2e9f09ed-8e4e-48d6-b37e-77b4bd4941a4`)
**Requested by:** Ahmed Mokhtar
**Date:** 2026-07-31
**Urgency:** not blocking — the feature works today; this closes a scope gap.

## Background (30 seconds)

This app registration already holds the **Mail.Send (Application)** Graph
permission with admin consent (confirmed 2026-07-30 by reading the `roles`
claim on an app-only token: `Sites.Selected`, `User.Read.All`, `Mail.Send`).

A new dashboard feature (monthly training report emails) is the first thing to
actually use it. It sends only as **sera@2seasonshotels.com**.

The gap: application-level `Mail.Send` is **tenant-wide by default**. Unless an
`ApplicationAccessPolicy` restricts it, the app's client secret can send mail
**as any mailbox in the tenant**, not just sera@. We would like it scoped down
to the one mailbox it needs.

## Step 1 — check whether a policy already exists

In **Exchange Online PowerShell** (`Connect-ExchangeOnline`), run:

```powershell
Get-ApplicationAccessPolicy | Where-Object { $_.AppId -eq 'a903ed32-cb50-4bce-bf4f-9c4e8c4d13f1' } | Format-List AppId,PolicyScopeGroupId,AccessRight,Description
```

- **If it returns a `RestrictAccess` policy scoped to sera@ (or to a group
  containing only sera@)** — nothing to do, we are already correctly scoped.
  Please just reply with the output.
- **If it returns nothing** — the app is tenant-wide today; please do Step 2.

## Step 2 — create the restriction (only if Step 1 returned nothing)

```powershell
New-ApplicationAccessPolicy `
  -AppId 'a903ed32-cb50-4bce-bf4f-9c4e8c4d13f1' `
  -PolicyScopeGroupId 'sera@2seasonshotels.com' `
  -AccessRight RestrictAccess `
  -Description 'Dashboard training-report function: send as sera@ only'
```

Then verify it took effect (allow a few minutes to propagate):

```powershell
Test-ApplicationAccessPolicy -Identity 'sera@2seasonshotels.com' -AppId 'a903ed32-cb50-4bce-bf4f-9c4e8c4d13f1'
# expect AccessCheckResult : Granted

Test-ApplicationAccessPolicy -Identity 'info@2seasonshotels.com' -AppId 'a903ed32-cb50-4bce-bf4f-9c4e8c4d13f1'
# expect AccessCheckResult : Denied   (proves the restriction is real)
```

If your tenant's policy requires a group rather than a bare mailbox for
`-PolicyScopeGroupId`, create a mail-enabled security group containing only
sera@2seasonshotels.com and pass that group's address instead.

## What breaks if this is done wrong

If the policy is scoped to the **wrong** mailbox (or to a group that does not
contain sera@), the training report emails will start failing with Graph
`ErrorAccessDenied`. That failure is visible to us — it is recorded in the
`report_runs` table and surfaced in the next successful report email — so it is
recoverable, but please run the two `Test-ApplicationAccessPolicy` commands
above so we catch it immediately rather than at the next scheduled send.

## Not affected by this request

The n8n workflows that send the daily reviews / info-email summaries use
**delegated** Outlook OAuth credentials, not this app registration. This change
cannot affect them.
