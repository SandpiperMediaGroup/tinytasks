# Mac releases from a development Mac

Use a clean, committed checkout with matching versions in `Cargo.toml`, `Cargo.lock`, and
`tauri.conf.json`. Install Xcode, Rust, Tauri CLI 2, and both `aarch64-apple-darwin` and
`x86_64-apple-darwin` Rust targets. The login keychain must contain a Developer ID Application
certificate and an existing `notarytool` credential profile for the same developer team.
The profile name is local: it does not determine the app's identity.

Run the Rust, MCP, and UI checks described in the README before preparing a release.
Build from the commit that will be tagged:

```sh
cargo tauri build --target universal-apple-darwin --bundles app --ci -- --offline
```

Set `SIGNING_IDENTITY` to your Developer ID Application identity and `NOTARY_PROFILE` to
your existing Keychain profile. Never put passwords or private keys in the repository.
Set `VERSION` to the app version and use a new `dist/$VERSION` directory for each release:

```sh
mkdir -p "dist/$VERSION"
ditto target/universal-apple-darwin/release/bundle/macos/TinyTasks.app "dist/$VERSION/TinyTasks.app"
codesign --force --options runtime --timestamp --sign "$SIGNING_IDENTITY" "dist/$VERSION/TinyTasks.app"
codesign --verify --deep --strict "dist/$VERSION/TinyTasks.app"
codesign -dv --verbose=4 "dist/$VERSION/TinyTasks.app"
lipo -archs "dist/$VERSION/TinyTasks.app/Contents/MacOS/tinytasks"
ditto -c -k --keepParent "dist/$VERSION/TinyTasks.app" "dist/$VERSION/notary-upload.zip"
xcrun notarytool submit "dist/$VERSION/notary-upload.zip" --keychain-profile "$NOTARY_PROFILE" \
  --output-format json > "dist/$VERSION/submission.json"
```

Keep the submission receipt. Read its `id` into `SUBMISSION_ID`, then wait for that submission;
if interrupted, resume waiting for the same ID rather than submitting again:

```sh
xcrun notarytool wait "$SUBMISSION_ID" --keychain-profile "$NOTARY_PROFILE" \
  --output-format json > "dist/$VERSION/result.json"
```

Proceed only when the status is **Accepted**. For a rejection, use `notarytool log` with
the submission ID to investigate. Staple Apple's ticket to the app, validate it, and create
the final download from that stapled app:

```sh
xcrun stapler staple "dist/$VERSION/TinyTasks.app"
xcrun stapler validate "dist/$VERSION/TinyTasks.app"
codesign --verify --deep --strict "dist/$VERSION/TinyTasks.app"
spctl --assess --type execute --verbose=2 "dist/$VERSION/TinyTasks.app"
ditto -c -k --keepParent "dist/$VERSION/TinyTasks.app" "dist/$VERSION/TinyTasks-$VERSION-universal-macos.zip"
(cd "dist/$VERSION" && shasum -a 256 "TinyTasks-$VERSION-universal-macos.zip" > SHA256SUMS.txt)
```

Extract the final ZIP to a fresh directory, repeat signature, ticket, and Gatekeeper checks,
and launch the app for a visual smoke check. Intel compatibility is built into the universal
binary; report separately whether an Intel Mac was available for runtime testing.

Publish a GitHub Release tagged `v$VERSION` at the exact source commit, attaching only the
final ZIP and `SHA256SUMS.txt`. Include installation instructions and any testing limitations
in its notes. Keep submission receipts locally; do not publish credentials or the upload ZIP.
