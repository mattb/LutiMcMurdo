# LutiMcMurdo Code Walkthrough

This app is a React Native wrapper around an offline copy of the Life Under The Ice website. The core idea is simple: get a ZIP file containing a static build of the site plus its media assets, unpack it into the app's writable documents area, start a tiny local HTTP server pointed at that directory, and then render the site inside a `WebView`. Almost everything in the codebase exists to support that pipeline.

## 1. Entry and top-level shape

Runtime starts in `index.js`, which does the standard React Native registration of a single root component. There is no custom bootstrap logic there. `App.tsx` is also thin. Its `App` component wraps the tree in `SafeAreaProvider` and immediately renders `Luti`. `Luti` hides the status bar, installs one more `SafeAreaView`, and then nests `Webserver` inside `AssetUpdater`.

That nesting is the architectural center of the app. `AssetUpdater` is responsible for answering one question: "What directory should the app serve?" Until it can answer that, `Webserver` is not useful. Once it does answer that, `Webserver` can assume it has a valid filesystem path and move on to serving and rendering the site.

## 2. What `AssetUpdater` really does

`AssetUpdater.tsx` is the main application module. It owns the only real state machine in the app: loading content, importing content, downloading content, estimating progress, and exposing the selected asset directory to the rest of the tree. It creates a React context for the asset path and exports `useAssetPath()` so `Webserver` can consume that path without prop-drilling.

Internally it tracks four pieces of state: numeric progress, a progress message, the selected `assetPath`, and a human-readable estimated time remaining string. If `assetPath` is empty, the component renders a control screen. If `assetPath` is populated, it stops rendering its own UI and instead returns an `AssetContext.Provider` around its children.

That means `AssetUpdater` has two completely different roles depending on state:

- Before a dataset is available, it behaves like an operator console.
- After a dataset is available, it becomes a silent provider and gets out of the way.

## 3. First-run behavior and the `admin_mode` flag

The app's startup decision is implemented in `getLatestAssetDirectory()`. This function checks `Settings.get("admin_mode")` and uses that value as both a first-run marker and a mode switch.

The code assumes three cases:

1. If `admin_mode` is `undefined`, this is the first run.
2. If `admin_mode` is anything other than `0`, the app is in admin mode and should not automatically choose a dataset.
3. If `admin_mode` is `0`, the app should scan the documents directory for previously unpacked `luti-*` folders and use the newest one.

The first-run path is important because it makes the app usable immediately. Instead of forcing the user to download or sideload content, it unpacks a bundled `tiny-luti-2024-05-12T11-03.zip` archive from the application bundle into the documents directory and returns that unpacked path.

This is why the app can come up with an offline demo on a clean install: the website payload is treated as bundled content on first run, then as mutable content afterward.

One subtle consequence of this design is that "admin mode" is not its own screen or feature flag in the React UI. It is implemented indirectly. If `admin_mode` is not `0`, `getLatestAssetDirectory()` throws an `"Admin Mode"` error, the effect in `AssetUpdater` catches and logs it, and `assetPath` stays empty. The result is that the update/download UI remains visible instead of automatically launching the site.

## 4. The three ways content enters the app

All content acquisition paths converge on the same validator and unpacker, `unzipLuti()`. That is a good design choice because the app has only one definition of "valid LUTI dataset": a ZIP that unpacks successfully and contains `asset-manifest.json` at the top level of the unpacked output.

There are three routes into that shared flow.

### 4.1. Bundled tiny ZIP on first run

On the first run, `getLatestAssetDirectory()` constructs a `file://` URL pointing at the bundled tiny ZIP under `MainBundlePath` and sends that into `unzipLuti()`. This creates the initial offline demo experience with no network dependency.

### 4.2. Manual ZIP import

The "Update from zip file" button calls `onUpdate()`, which opens `react-native-document-picker` and restricts selection to a ZIP archive. The picker returns a URI, and that URI is passed directly to `unzipLuti()`.

This is the manual update path for a USB drive or locally supplied archive. The app does not inspect the contents before extraction; it always unpacks first and then validates based on `asset-manifest.json`.

### 4.3. Remote download

The other two buttons download either a tiny test archive or a full archive from hard-coded S3 URLs. `downloadLuti()` writes the downloaded file into the documents directory with a timestamp-based `luti-*` name, then hands the resulting local file URL to `unzipLuti()`.

This means the app's remote and local update paths deliberately meet at the same boundary: "produce a local ZIP file, then unpack and validate it."

## 5. Unpacking, validation, and progress reporting

`unzipLuti()` does several things in a compact block:

- It subscribes to ZIP extraction progress from `react-native-zip-archive`.
- It resets the progress UI and sets the message to "Unpacking LUTI from file".
- It strips the leading `file://` from the incoming URI.
- It creates a unique target directory under `DocumentDirectoryPath` named `luti-${Date.now()}`.
- It unpacks into that directory.
- It checks for `asset-manifest.json`.

If that manifest exists, the import is accepted. At that point the function also calls `Settings.set({ admin_mode: 0 })`, which is significant. Any successful import forces the app back into normal auto-selection mode on later launches.

If the manifest is missing, the function clears the progress message and throws an error saying it did not find a LUTI website in the ZIP file.

The download path layers a richer progress model on top of this. `downloadLuti()` now does a small amount of work before the actual transfer starts:

- It tries an HTTP `HEAD` request first so it can read an accurate `Content-Length` from S3.
- If that fails, it falls back to the content length reported by the native downloader.
- If even that is unavailable, it falls back to a hard-coded expected size for the known tiny and full dataset URLs.

During the actual transfer, the app still receives native progress events continuously, but it turns them into a calmer UI:

- Progress is tracked in 1 MB increments rather than 1% steps.
- The UI shows `downloaded MB / total MB`.
- It also shows a smoothed transfer rate in `KB/s` or `MB/s`.
- Estimated time remaining is based on a smoothed bytes-per-second rate rather than a short average of raw ETA guesses.
- The visible React updates are throttled so the display does not twitch excessively on fast connections.

So the current progress screen is still lightweight, but it is significantly more informative and more stable than the original version.

## 6. The empty-state screen is really an operations screen

If `assetPath` is still empty after the startup effect runs, `AssetUpdater` renders a centered text-and-buttons screen. That screen tells the user that Life Under The Ice needs a dataset to run and offers three actions:

- Update from a ZIP file.
- Download a 20 MB test version.
- Download a 3.4 GB full version.

While download or unzip progress is active, the buttons are disabled. The screen then shows a progress bar and the estimated remaining time. So the "loading" state is not just a placeholder; it is the full control surface for dataset management.

The helper component `Spacer.tsx` is only used for layout gaps on this screen. It is a minimal wrapper around `View` that toggles width versus height based on a `horizontal` prop. The calling code passes `vertical`, which `Spacer` ignores, but because `horizontal` defaults to `false`, the current usage still creates vertical spacing. It works, but only because the unused prop happens to line up with the default behavior.

## 7. The handoff from updater to web runtime

Once `assetPath` is set, `AssetUpdater` stops rendering the controls and returns its children inside the asset-path context. At that point `Webserver` mounts.

This handoff is the core transition in the app:

- Before it, the app is a content installer and selector.
- After it, the app is a single-purpose local browser for the selected site build.

Because `Webserver` reads the path from context, there is a clean one-way dependency: the updater decides what to serve, and the server/browser stack decides how to serve and display it.

## 8. How `Webserver` turns a directory into the app

`Webserver` lives in `App.tsx`. It pulls `assetPath` from `useAssetPath()`, stores a local `origin` state string, and keeps a `watchDogTimer` ref containing the last touch timestamp.

Its main `useEffect` creates an instance of `@dr.pogodin/react-native-static-server` configured like this:

- `fileDir` points at the selected asset directory.
- `port` is fixed at `50050`.
- `stopInBackground` is enabled.
- `errorLog` is disabled so the embedded server does not append to a persistent file in app storage.
- `extraConfig` injects custom Lighttpd configuration.

That extra server config is where the app's website-specific assumptions live.

First, it enables `mod_setenv` and adds `Access-Control-Allow-Origin: *` on requests under `/videos`. That is there to make HLS video playback work from the embedded local server into the WebView. The README and the custom patch file both make this intent explicit.

Second, it enables `mod_rewrite` and rewrites `/about` and `/thanks` to `/index.html`. That tells you something important about the shipped website: it behaves like a single-page app with at least a couple of deep links that need to fall back to the root HTML file.

After constructing the server, the effect starts it asynchronously. When `server.start()` resolves, the returned origin is stored in state. That `origin` is the switch that determines whether `Webserver` still shows a loading placeholder or renders the actual `WebView`.

## 9. The inactivity watchdog

`Webserver` also implements a kiosk-style watchdog. `TOUCH_TIMEOUT` is set to ten minutes. On every touch inside the `WebView`, the code stores the current timestamp in `watchDogTimer.current`.

Separately, a recurring function scheduled through `InteractionManager.runAfterInteractions()` checks every ten seconds whether the app has been untouched longer than the timeout. If it has, the code:

- Logs that the app has been unused.
- Resets the stored timestamp.
- Stops the static server.
- Calls `RNRestart.restart()` to relaunch the app.

This makes sense for a museum or exhibition setting. The code is trying to force the experience back to a clean starting point if a visitor abandons the app midway through.

The cleanup function for the effect also stops the server on unmount and clears the `origin` state. So both timeout-based restart and normal component teardown try to leave the embedded server in a clean state.

Separately, `App.tsx` proactively deletes any existing static-server `ERROR_LOG_FILE` on startup. That is defensive cleanup for older builds or debugging sessions that may have left on-disk Lighttpd logs behind.

## 10. How the `WebView` is configured

When `origin` is available, `Webserver` renders a `SafeAreaView` containing a `WebView` pointed at:

`origin + "/?offline=1"`

That query parameter is the only explicit contract between the native wrapper and the web app. It strongly suggests that the site build knows how to alter behavior when embedded offline.

The `WebView` configuration is tuned for a kiosk/media experience:

- Inline media playback is allowed.
- Media playback does not require a user action.
- Mixed content mode is `"always"`.
- The origin whitelist is unrestricted.
- Scroll indicators are hidden.
- Text interaction is disabled.
- WebView debugging is disabled.
- Touch events are used to reset the inactivity timer.

This is not a general-purpose browser configuration. It is a locked-down presentation shell designed to show one specific site as smoothly as possible.

## 11. Native iOS and Android responsibilities

The native projects are mostly stock React Native wrappers, but a few details matter.

On iOS:

- `Info.plist` enables local networking under App Transport Security and creates exceptions for `localhost`, including the static-server port `50050`.
- `Settings.bundle/Root.plist` defines the `admin_mode` toggle surfaced through the iOS Settings app.
- The Xcode project bundles `tiny-luti-2024-05-12T11-03.zip` as an app resource so first-run unpacking can work.
- `AppDelegate.mm` is otherwise mostly standard and does not contain extra application logic.

On Android:

- The manifest requests `INTERNET` permission, which the WebView and any remote downloads need.
- `MainActivity` and `MainApplication` are standard React Native boilerplate.
- The app still includes Android project files, but the README frames the product primarily as an iOS container for offline use.

That last point matters for understanding priorities. The React Native code is cross-platform, but the operational assumptions, bundled resource path, and Settings integration are clearly more polished on iOS.

## 12. Why the static-server patch exists

The app depends on Lighttpd's `mod_setenv` module so it can attach `Access-Control-Allow-Origin: *` on `/videos`. The upstream `@dr.pogodin/react-native-static-server` package did not originally compile that module into its statically linked plugin set, so this app carries a local patch that adds it.

That patch is no longer a manually applied repo file. It now lives under `patches/` and is reapplied automatically by `patch-package` during `npm install`. The runtime purpose is the same: without the patch, the `extraConfig` block in `Webserver` could not enable the response-header behavior the embedded site expects.

## 13. Test coverage and what it implies

The Jest suite is minimal. The only test renders `<App />` and asserts that it does not crash during render. There are no tests for:

- first-run asset bootstrapping,
- ZIP validation,
- admin-mode behavior,
- download progress,
- server startup,
- WebView configuration, or
- watchdog restart logic.

That tells you this project is closer to a purpose-built wrapper app than a heavily engineered product platform. The logic is compact enough to read end-to-end, but most confidence probably comes from device testing rather than automated coverage.

## 14. The simplest accurate mental model

If you want one linear model of the whole app, it is this:

1. React Native starts and mounts `App`.
2. `App` mounts `Luti`.
3. `Luti` mounts `AssetUpdater`.
4. `AssetUpdater` tries to find or create a valid unzipped LUTI dataset.
5. If it cannot, it shows controls for importing or downloading one.
6. Once it has a dataset path, it publishes that path through context.
7. `Webserver` reads the path, starts a local Lighttpd server on port `50050`, and waits for an origin URL.
8. The app loads that origin into a `WebView` with offline and media-friendly settings.
9. Touches keep the experience alive; ten minutes of inactivity stop the server and restart the app.

Everything else in the repository exists to support one of those nine steps.
