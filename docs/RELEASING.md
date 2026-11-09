# Releases

Use semantic versions in `Cargo.toml`, the root `tinytasks` package in `Cargo.lock`, and
`tauri.conf.json`. Keep all three identical. Use a patch release for fixes, a minor release
for features, and a major release for breaking compatibility once the project reaches 1.0.
Before 1.0, document any compatibility changes explicitly in each minor release.

Create an annotated `vMAJOR.MINOR.PATCH` tag at the exact clean commit used to build the assets.
Never move a published tag or replace published binaries: changed builds need a new version.
A missing platform may be added to an existing release when built from its exact unchanged
tagged commit. Keep existing binaries intact, extend `SHA256SUMS.txt` with the new artifacts,
and update release notes and download links to reflect the added platform.
The update check compares semantic version precedence against GitHub's latest stable release;
build metadata alone does not count as a newer version. Drafts and prereleases are ignored.

Publish only the platforms actually built and verified. When a release omits a platform,
link to its last available build in the notes and keep README download links accurate.
Do not rename or reupload an older platform binary as a new version.

## Windows releases

Use a clean checkout on Windows with the Rust MSVC toolchain and Tauri prerequisites installed.
Run the checks described in the README. Build the committed version with the pinned Tauri CLI:

```powershell
$env:CARGO_BUILD_JOBS = '2'
$env:CARGO_TARGET_DIR = Join-Path $PWD 'target'
npx --yes @tauri-apps/cli@2.12.4 build --ci --bundles nsis --target x86_64-pc-windows-msvc -- --locked
```

Use a separate target directory if the development app is running. The NSIS installer is under
`target/x86_64-pc-windows-msvc/release/bundle/nsis`. Also offer a portable ZIP containing the
release `tinytasks.exe`, the license, and brief installation/MCP instructions. The installer
downloads WebView2 when needed; portable users need the WebView2 runtime already installed.

Inspect executable architecture and version, exercise MCP against the exact packaged binary
with isolated state, and compare the executable extracted from the portable ZIP. Generate
`SHA256SUMS.txt` over the final installer and ZIP. Verify GitHub's uploaded asset digests match
before publishing the draft release. State whether binaries are signed and identify any native
desktop testing limitations. Never run the installer against the development installation as a test.

## Mac releases from a development Mac

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
```

Build the DMG from the **stapled app**, with a link to Applications. Sign and submit the DMG
separately, retaining its own submission receipt:

```sh
mkdir "dist/$VERSION/dmg-stage"
ditto "dist/$VERSION/TinyTasks.app" "dist/$VERSION/dmg-stage/TinyTasks.app"
ln -s /Applications "dist/$VERSION/dmg-stage/Applications"
hdiutil create -srcfolder "dist/$VERSION/dmg-stage" -volname TinyTasks -fs HFS+ -format UDZO \
  "dist/$VERSION/TinyTasks-$VERSION-universal-macos.dmg"
codesign --timestamp --sign "$SIGNING_IDENTITY" "dist/$VERSION/TinyTasks-$VERSION-universal-macos.dmg"
xcrun notarytool submit "dist/$VERSION/TinyTasks-$VERSION-universal-macos.dmg" \
  --keychain-profile "$NOTARY_PROFILE" --output-format json > "dist/$VERSION/dmg-submission.json"
```

Wait using the DMG submission ID, as above, and require **Accepted** before continuing:

```sh
xcrun stapler staple "dist/$VERSION/TinyTasks-$VERSION-universal-macos.dmg"
xcrun stapler validate "dist/$VERSION/TinyTasks-$VERSION-universal-macos.dmg"
codesign --verify --strict "dist/$VERSION/TinyTasks-$VERSION-universal-macos.dmg"
hdiutil verify "dist/$VERSION/TinyTasks-$VERSION-universal-macos.dmg"
spctl --assess --type open --context context:primary-signature --verbose=2 \
  "dist/$VERSION/TinyTasks-$VERSION-universal-macos.dmg"
(cd "dist/$VERSION" && shasum -a 256 "TinyTasks-$VERSION-universal-macos.zip" \
  "TinyTasks-$VERSION-universal-macos.dmg" > SHA256SUMS.txt)
```

Extract the final ZIP to a fresh directory, repeat signature, ticket, and Gatekeeper checks,
mount the DMG read-only to verify its app and Applications link, and launch the app for a visual smoke check. Intel compatibility is built into the universal
binary; report separately whether an Intel Mac was available for runtime testing.

Publish a GitHub Release tagged `v$VERSION` at the exact source commit, attaching only the
final DMG, ZIP, and `SHA256SUMS.txt`. Include installation instructions and any testing limitations
in its notes. Keep submission receipts locally; do not publish credentials or the upload ZIP.
