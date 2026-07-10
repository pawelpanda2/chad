# Frequent Bugs & Known Issues

## PluginAdapter Request Logging Issue

### Problem
PluginAdapter GET requests show only response in dev panel, while BackendAdapter POST requests show both request body and response.

### Example from Dev Tools
```
REQUEST #5
2026-06-18 16:19:41.988
0 ms
GET
http://localhost:12026/openfolder/root
RESPONSE: 400 BadRequest
{"error":"Invalid address format. Expected: {UUID}-{local} or {32-hex-chars}-{local} or just {UUID} or {32-hex-chars}"}

REQUEST #3
2026-06-18 16:19:33.297
0 ms
POST
http://localhost:12024/invoke
REQUEST BODY:
["IRepoService","IItemWorker","GetItem","root",""]
RESPONSE: 200 OK
{...}
```

### Root Cause
This is expected behavior - GET requests don't have a request body, so the "REQUEST BODY:" section doesn't appear in the dev panel (the condition `!string.IsNullOrEmpty(entry.RequestBody)` prevents showing empty body).

BackendAdapter uses POST with a JSON body containing the arguments, while PluginAdapter uses GET requests without a body.

### Solution
If you want to see request details for GET requests, you could:
1. Log the endpoint/URL parameters in the RequestBody field for GET requests
2. Modify the DevErrorPanel to always show request method info
3. Accept this as expected behavior since GET requests inherently don't have bodies

---

## Plugin Address Format Error

### Problem
Plugin returns "Invalid address format" error when address doesn't match expected format.

### Expected Format
- `{UUID}-{local}` - Full GUID with local path
- `{32-hex-chars}-{local}` - 32 hex characters with local path  
- `{UUID}` - Just the GUID
- `{32-hex-chars}` - Just 32 hex characters

### Example Error
```json
{"error":"Invalid address format. Expected: {UUID}-{local} or {32-hex-chars}-{local} or just {UUID} or {32-hex-chars}"}
```

### Solution
Ensure the address is built correctly using `BuildAddress()` method in PluginAdapter which handles the format properly.