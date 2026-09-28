# Webview Development

For commands that require a webview (see [guidance](https://code.visualstudio.com/api/extension-guides/webview#should-i-use-a-webview) on where this is appropriate), the [`webview-ui`](../../../../webview-ui/) project provides the necessary tooling to develop the front end.

## Initial Setup

Run `npm run install:all` to install package dependencies for both the extension and webview project.

## Development/Debugging

### File structure

- Webview source files are under `/webview-ui/src`.
- When built, bundled/minified webview assets are output to `/webview-ui/dist`.

When the extension is run (both in development and production), the webview assets are read from `/webview-ui/dist`.

### Developing the UI

If you like to use your browser development tools for debugging, or you wish to open the web application in an existing browser window:
1. Run `npm run dev:webview` to start the development server.
2. Navigate to `http://localhost:3000` in your browser.

Alternatively, if you are developing in VS Code and wish to use the inbuilt debugging functionality:
1. Hit `F5` to launch the `Webview UI` debug profile in a new browser window. This will automatically run the development server and attach a debugger.

### Kickstart existing-app Connect screen

For the first-screen browser preview, run `npm run dev:webview` and open
[`http://localhost:3000/?scenario=kickstartGuidedSetup&standalone=1`](http://localhost:3000/?scenario=kickstartGuidedSetup&standalone=1).
This renders the same component used by the extension, with clearly labeled sample repositories.
No GitHub credentials, Azure account, or local deployment tools are needed for this browser preview.

The scenario selector at `http://localhost:3000` also includes signed-out, loading, error/retry,
empty-account, long-list, slow sign-in check, and pagination/retry scenarios.
In the ready scenario, search by repository name, owner, or description;
use the arrow keys and Enter to select a result. Selection prefills the workspace name, GitHub's
default branch, and a `kickstart/<workspace>` working branch. A manually edited working branch
stays unchanged when the workspace name is edited. Pasted URLs require a base branch unless
the repository is also present in the loaded list.

To pick **your own GitHub repositories**, use the **Extension** debug profile:

1. Open this checkout in VS Code and press `F5` with **Extension** selected.
2. In the Extension Development Host, enable `"aks.kickstartEnabledPreview": true`.
3. Run **AKS: Launch Kickstart Agent** from the Command Palette.
4. Select **Sign in to GitHub** if needed and approve the existing `repo` access scope.
   **My repositories** lists the repositories you own, including private repositories.
   Choose **All accessible repositories** to include organization and collaborator repositories.
   Each request loads up to 100 repositories. Use **Load more repositories** for additional pages;
   search filters the loaded results. A URL can be pasted without loading every page.

Opening the screen does not prompt for sign-in. The explicit sign-in/refresh button can request
access, and account changes refresh the list. A passive account check does not disable sign-in,
and the account is displayed before its repository page finishes loading.
Requests that time out show a retryable error instead of leaving the screen busy indefinitely.
Previously loaded results remain usable while loading another page or retrying it.
Tokens stay in the extension host, not in the webview.

After changing extension-host code, stop the existing debug session and launch **Extension** with
`F5` again. A webview refresh alone does not reload the extension's message handlers.

This increment ends at repository selection and editable connection fields. **Connect and inspect**
and application-folder selection are deliberately disabled. It does not clone, create/check out a
branch, inspect files, hand the existing app to Copilot, or change Azure resources. Configure,
Review, Deploy, and expandable panels are not implemented here. **Other ways to start** retains the
existing new-app, sample, and current-workspace chat flows.

### Developing the VS Code commands that launch the UI

> **Prerequisite:** Run `npm run install:all` at least once before debugging (see [Initial Setup](#initial-setup)). A plain `npm install` does **not** install the `webview-ui` dependencies, so the webview build produces no assets and panels render blank.

To debug the extension itself, hit `F5` to launch the `Extension` debug profile in a new VS Code Window. This will automatically build the `webview-ui` project (via `npm run build:webview`) and bundle the extension, so the assets in `/webview-ui/dist` are always present.

The extension will not automatically update itself in response to code changes as you are debugging, so the best workflow here is to stop debugging, make changes, and launch the debugger again.

If the Problems panel retains old webpack errors after a successful rebuild, run **Tasks: Terminate Task**
and stop **webpack-dev**, then start the **Extension** debug profile again. Stopping debugging alone can
leave its background build task running with the old task definition.

The development task uses webpack CLI build-start messages to reset diagnostics on each rebuild.
Its TypeScript matcher reads the file, line, column, error code, and message instead of treating the
`(line,column)` suffix as part of the filename. Webview TypeScript and ESLint errors are also captured.
The watcher regression test is available through `npm run test:scripts`.

### Custom UI Elements

Most input components have been intentionally designed to be theme-aware by default, inheriting VS Code's global design tokens to stay in sync with the user's selected theme. This includes buttons (which can be styled using our `secondary-button` and `icon-button` classes), anchor tags, `<option>` elements, and common input types like `radio`, `checkbox`, and `text`.

To keep things consistent while avoiding unnecessary dependencies, we also include a small set of custom components:

- `<CustomDropdown>` and `<CustomDropdownOption>` provide a theme-integrated dropdown experience.
- `<ProgressRing>` is a simple, consistent loading indicator that fits right in with VS Code’s UI.

These components help us maintain a clean, unified look without relying on external UI libraries — and give us more control over the details when we need it.



## Building for release

The process for this is unaffected by the webview setup. The `npm run webpack` and `vsce package` commands will ensure the `webview-ui` project is built and bundled.
