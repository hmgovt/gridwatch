# Test signing key

`test.keystore` signs the APKs we hand out for testing, so each new test build
installs over the last one. **It is public on purpose** (password
`everybodyhz-test`): anyone can sign an APK with it, so a test build proves
nothing about who made it. Only install test builds you got from us directly.

Never use it for Google Play. Store builds are signed with an upload key kept
out of the repository and passed in through the `EHZ_UPLOAD_*` environment
variables (see `app/build.gradle`), with Play App Signing holding the app key.
