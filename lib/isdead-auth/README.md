# isdead-auth

Shared sign-in for every IsDead app on yourappisdead.com: Firebase Authentication (email/password + Google).

- `config.ts`: env → Firebase web config; cookie name/options (`isdead_session`, path `/`).
- `server.ts`: firebase-admin; `createSessionFromIdToken`, `verifySessionCookie`, demo cookie signing.
- `client.ts`: browser helpers (sign up, sign in, reset password, Google popup) that POST the ID token to the app's session endpoint.

Each app exposes `POST <basePath>/api/session` that calls `createSessionFromIdToken`, maps the Firebase uid to its own users table, and sets the cookie. Because the cookie has path `/` on yourappisdead.com, one sign-in covers every app; each app verifies the same cookie with the same Firebase project.

Env: `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`, `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`, `FIREBASE_SERVICE_ACCOUNT_JSON` (and optional `ISDEAD_COOKIE_DOMAIN`). Without them, `firebaseConfigured()` is false and apps show "Sign-in not configured".
