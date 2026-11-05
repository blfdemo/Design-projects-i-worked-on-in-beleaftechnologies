// Admin login hash = sha256("v1|username|password"). To change credentials, ask Claude for a new hash
// or run in the browser console:  crypto.subtle.digest('SHA-256', new TextEncoder().encode('v1|USER|PASS'))
const AUTH_HASH = "3361552d00a21e747b784d0b02485fe496bb488597a3bff40635f1ca4dc78b24";
