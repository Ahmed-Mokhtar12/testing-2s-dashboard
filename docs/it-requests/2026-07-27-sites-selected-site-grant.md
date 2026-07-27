# IT Request: Grant app access to the Two_Seasons_Training_Record SharePoint site

**App:** Two Seasons Insights Login Digitlab
**Client ID:** `a903ed32-cb50-4bce-bf4f-9c4e8c4d13f1`
**Tenant:** Two Seasons hotel (`2e9f09ed-8e4e-48d6-b37e-77b4bd4941a4`)
**Requested by:** Ahmed Mokhtar
**Date:** 2026-07-27 — **urgent: needed before your vacation starts**

## Background (30 seconds)

The app registration already has the **Sites.Selected** (Application) Microsoft
Graph permission with admin consent — that part is done, nothing to change in
Entra. However, `Sites.Selected` is a two-step model: the API permission only
allows the app to be *eligible* for site access. A separate, one-time,
**per-site grant** must be created on the specific SharePoint site. That grant
has never been made, so the app currently gets `accessDenied` from Graph when
reading list items (latest reproduction: request-id
`6170341b-c2ed-42a4-a334-ffad883402b9`, 2026-07-27 07:24 UTC).

Ahmed's account (Info@2seasonshotels.com) cannot perform this — Microsoft
requires a SharePoint Administrator / Global Administrator identity.

## The action (one API call — site ID already resolved)

Sign in to **Graph Explorer** (https://aka.ms/ge) with your admin account, then:

1. Method: **POST**, version **v1.0**, URL (paste exactly — the site ID is
   already included):

```
https://graph.microsoft.com/v1.0/sites/2seasonshotels.sharepoint.com,733ca41c-6645-42f0-9fd2-57987c3284b3,d07ac747-5f4a-4fa5-9026-4b85b2070d5f/permissions
```

2. In the **Request body** tab, paste:

```json
{
  "roles": ["write"],
  "grantedToIdentities": [{
    "application": {
      "id": "a903ed32-cb50-4bce-bf4f-9c4e8c4d13f1",
      "displayName": "Two Seasons Insights Login Digitlab"
    }
  }]
}
```

3. Click **Run query**. Expected response: **`201 Created`**.
   - If Graph Explorer itself returns 403: open its **Modify permissions**
     tab, **Consent** to `Sites.FullControl.All` (this consents the Graph
     Explorer tool for your session, not the app), and run the POST again.

### PowerShell alternative (if you prefer PnP)

```powershell
Grant-PnPAzureADAppSitePermission `
  -AppId "a903ed32-cb50-4bce-bf4f-9c4e8c4d13f1" `
  -DisplayName "Two Seasons Insights Login Digitlab" `
  -Site "https://2seasonshotels.sharepoint.com/sites/Two_Seasons_Training_Record" `
  -Permissions Write
```

## Why "write" and not "read"

The app both reads the colleague roster and writes training-session and
participant records to lists on this site. "write" covers both. **Scope is
limited by design:** `Sites.Selected` grants access ONLY to sites explicitly
granted this way — this action affects the Two_Seasons_Training_Record site
and nothing else in the tenant.

## Optional (2 extra minutes, recommended before your vacation)

While Ahmed's dashboard project continues during your absence, two small
extras would remove any chance he needs to reach you:

1. On the consent screen Ahmed triggered today ("Microsoft Graph Command Line
   Tools" requesting `Sites.FullControl.All` — delegated), grant **admin
   consent on behalf of the organization**, so Ahmed can verify/adjust site
   app-permissions himself if needed.
2. Or alternatively, assign **SharePoint Administrator** role to
   Info@2seasonshotels.com in Entra → Roles and administrators.

Both are optional — the POST above is the only thing actually required.

## Verification

After you run it, Ahmed will re-run the app's health check immediately.
Expected: the colleague roster loads (HTTP 200) instead of `accessDenied`.
He'll confirm back to you the same day so you can close this before leaving.
