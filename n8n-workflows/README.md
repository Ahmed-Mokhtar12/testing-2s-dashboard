# n8n Workflows

## Monitor - WhatsApp Live Two Scheduler

Import `monitor-whatsapp-live-two-scheduler.json` into n8n as a new workflow. It is intentionally separate from the existing `WhatsApp Live Two` workflow and only targets workflow ID `BcaOXV68sc9d3cTp` through the n8n API.

Before activating it, bind each HTTP Request node to an existing `httpHeaderAuth` credential named or configured as:

- Header name: `X-N8N-API-KEY`
- Header value: your n8n API key

Do not paste the API key into the workflow JSON.

After import, manually run the monitor once. If the target workflow has executed within the last 3 minutes, the monitor should only log a healthy status. If it is stalled, it will deactivate `BcaOXV68sc9d3cTp`, wait 5 seconds, activate it again, and log the result.
