import { MessageHandler, MessageSink } from "../../../src/webview-contract/messaging";
import {
    GitHubRepo,
    InitialState,
    ToVsCodeMsgDef,
    ToWebViewMsgDef,
} from "../../../src/webview-contract/webviewDefinitions/kickstartGuidedSetup";
import { KickstartGuidedSetup } from "../KickstartGuidedSetup/KickstartGuidedSetup";
import { stateUpdater } from "../KickstartGuidedSetup/helpers/state";
import { Scenario } from "../utilities/manualTest";
import { delay } from "../utilities/time";

/** Relative so the preview always shows a sensible "2d ago" regardless of when it runs. */
function daysAgo(days: number): string {
    return new Date(Date.now() - days * 86_400_000).toISOString();
}

// Ordered most-recently-pushed first, matching what the extension host sends.
const repositories: GitHubRepo[] = [
    {
        fullName: "sample-org/orders-api",
        description: "An existing orders service with a Dockerfile and Kubernetes manifests.",
        cloneUrl: "https://github.com/sample-org/orders-api.git",
        private: true,
        defaultBranch: "main",
        pushedAt: daysAgo(0),
    },
    {
        fullName: "sample-developer/inventory-service",
        description: "A Go service for tracking inventory.",
        cloneUrl: "https://github.com/sample-developer/inventory-service.git",
        private: true,
        defaultBranch: "develop",
        pushedAt: daysAgo(4),
    },
    {
        fullName: "sample-org/storefront",
        description: "A public storefront application.",
        cloneUrl: "https://github.com/sample-org/storefront.git",
        private: false,
        defaultBranch: "main",
        pushedAt: daysAgo(95),
    },
];

const initialState: InitialState = {
    workspaceName: "preview-workspace",
    workspaceIsEmpty: false,
    samples: [
        {
            label: "AKS Store Demo",
            stack: "Node.js, Python, Go",
            description: "A sample application for the legacy starting point.",
            repoUrl: "https://github.com/Azure-Samples/aks-store-demo.git",
        },
    ],
};

type PreviewState =
    | "ready"
    | "signed out"
    | "loading"
    | "error"
    | "empty"
    | "many repositories"
    | "slow sign-in check"
    | "pagination"
    | "pagination retry";

export function getKickstartGuidedSetupScenarios(): Scenario[] {
    return (
        [
            "ready",
            "signed out",
            "loading",
            "error",
            "empty",
            "many repositories",
            "slow sign-in check",
            "pagination",
            "pagination retry",
        ] satisfies PreviewState[]
    ).map((previewState) =>
        Scenario.create(
            "kickstartGuidedSetup",
            previewState === "ready" ? "" : previewState,
            () => (
                <>
                    <p role="note">
                        Browser preview: sample account and repositories. Use the Extension Development Host to pick
                        your own GitHub repositories. No external actions run here.
                    </p>
                    <KickstartGuidedSetup {...initialState} />
                </>
            ),
            (webview) => getMessageHandler(webview, previewState),
            stateUpdater.vscodeMessageHandler,
        ),
    );
}

function getMessageHandler(
    webview: MessageSink<ToWebViewMsgDef>,
    previewState: PreviewState,
): MessageHandler<ToVsCodeMsgDef> {
    let requestId = 0;
    let signedIn = previewState !== "signed out";
    let failNextPage = previewState === "pagination retry";
    return {
        finishRequest: (selections) => {
            alert(`Browser preview: legacy chat handoff. No actions run here.\n${JSON.stringify(selections, null, 2)}`);
        },
        listGitHubReposRequest: async (request) => {
            const id = ++requestId;
            const { prompt, scope, page } = request;
            const context = { scope, page };
            webview.postGitHubReposLoading(request);
            await delay(previewState === "slow sign-in check" && !prompt ? 4000 : 100);
            if (id !== requestId) return;
            if (prompt) signedIn = true;
            const signedInUser = signedIn ? "sample-developer" : null;
            webview.postGitHubAccountLoaded({ ...context, signedInUser });
            if (!signedIn) {
                webview.postGitHubReposLoaded({ ...context, repos: [], nextPage: null, signedInUser });
                return;
            }
            await delay(previewState === "loading" ? 5000 : 400);
            if (id !== requestId) return;
            if (previewState === "error" && !prompt) {
                webview.postGitHubReposError({
                    ...context,
                    message: "Sample error: GitHub could not be reached. Refresh to retry, or paste a repository URL.",
                    signedInUser,
                    needsSignIn: false,
                });
            } else if (page > 1 && failNextPage) {
                failNextPage = false;
                webview.postGitHubReposError({
                    ...context,
                    message:
                        "Sample error: the next page failed. Your loaded repositories are still available. Retry loading more.",
                    signedInUser,
                    needsSignIn: false,
                });
            } else {
                const paginated = previewState === "pagination" || previewState === "pagination retry";
                const availableRepositories =
                    previewState === "many repositories" || paginated
                        ? Array.from({ length: paginated ? 205 : 35 }, (_, index): GitHubRepo => {
                              const name = `service-${String(index + 1).padStart(3, "0")}`;
                              return {
                                  fullName: `sample-developer/${name}`,
                                  description: "Sample repository for testing scrolling and keyboard selection.",
                                  cloneUrl: `https://github.com/sample-developer/${name}.git`,
                                  private: true,
                                  defaultBranch: "main",
                                  pushedAt: daysAgo(1),
                              };
                          })
                        : repositories.filter(
                              (repo) => scope === "all" || repo.fullName.startsWith("sample-developer/"),
                          );
                webview.postGitHubReposLoaded({
                    ...context,
                    repos: previewState === "empty" ? [] : availableRepositories.slice((page - 1) * 100, page * 100),
                    nextPage: previewState !== "empty" && availableRepositories.length > page * 100 ? page + 1 : null,
                    signedInUser,
                });
            }
        },
    };
}
