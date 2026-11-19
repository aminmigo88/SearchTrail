# Validation — SearchTrail 0.1.0

19 November 2026

## Completed

- JavaScript syntax checks for every extension script.
- Manifest parsing and required resource existence checks.
- 15 automated tests passed, covering URL validation, search identity, simultaneous searches, safe return/reopen behavior, repeated visits and branching, parallel writes, local-log persistence across background recreation, private tabs, pause/exclusions, deleted records, tab-ID reuse, quota errors, idempotent retry after state-write failure, and opener inheritance.
- Bash syntax check for the macOS build script.
- Python syntax compilation for scheme selection and IPA packaging.

The behavior tests execute the actual background source with simulated WebExtension APIs. They are useful logic checks, not an iOS runtime test.

## Not completed

- Xcode generation/compilation: this environment is Linux and has no macOS runner connected.
- Native IPA signing/install: no user's certificate was requested or used.
- Safari/iPhone integration, permissions, navigation, persistence across an actual browser restart, and UI/device tests.
- Visual browser smoke test: local Chromium could not launch in the execution environment.
- Large-history performance, device export/save behavior, and signer-specific extension provisioning.

The release is source-only. Run the included cloud-Mac workflow, then follow the device acceptance checklist in README.md before relying on it.
