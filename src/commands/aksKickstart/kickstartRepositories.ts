import { Octokit } from "@octokit/rest";
import * as l10n from "@vscode/l10n";
import type { AuthenticationSession } from "vscode";
import { MessageSink } from "../../webview-contract/messaging";
import {
    GitHubRepositoryPage,
    GitHubRepositoryRequest,
    GitHubRepositoryScope,
    ToWebViewMsgDef,
} from "../../webview-contract/webviewDefinitions/kickstartGuidedSetup";

type RepositoryQuery = Pick<GitHubRepositoryRequest, "scope" | "page">;
type GetSession = (prompt: boolean) => PromiseLike<AuthenticationSession | undefined>;
type LoadPage = (
    session: AuthenticationSession,
    query: RepositoryQuery,
    signal: AbortSignal,
) => Promise<GitHubRepositoryPage>;

export async function listKickstartRepositories(
    octokit: Octokit,
    { scope, page }: RepositoryQuery,
): Promise<GitHubRepositoryPage> {
    if (!Number.isSafeInteger(page) || page < 1 || (scope !== "owned" && scope !== "all")) {
        throw new Error(l10n.t("Invalid repository scope or page. Refresh the repository list."));
    }

    const { data, headers } = await octokit.rest.repos.listForAuthenticatedUser({
        per_page: 100,
        page,
        // `pushed`, not `updated`: GitHub bumps `updated_at` on any repo-record change (stars,
        // description edits, renames), so an `updated` sort reads as random. `pushed` tracks commits.
        sort: "pushed",
        direction: "desc",
        affiliation: scope === "owned" ? "owner" : "owner,collaborator,organization_member",
    });

    return {
        // Deliberately not re-sorted: the caller renders GitHub's last-pushed order so the
        // repositories someone is actually working in surface first.
        repos: data.map((repository) => ({
            fullName: repository.full_name,
            description: repository.description,
            cloneUrl: repository.clone_url,
            private: repository.private,
            defaultBranch: repository.default_branch,
            pushedAt: repository.pushed_at ?? null,
        })),
        nextPage: /;\s*rel="next"/.test(headers.link ?? "") ? page + 1 : null,
    };
}

export class KickstartRepositoryLoader {
    private requestId = 0;
    private controller: AbortController | undefined;
    private scope: GitHubRepositoryScope = "owned";
    private signingIn = false;
    private disposed = false;

    constructor(
        private readonly getSession: GetSession,
        private readonly loadPage: LoadPage = (session, query, signal) =>
            listKickstartRepositories(new Octokit({ auth: session.accessToken, request: { signal } }), query),
    ) {}

    dispose(): void {
        this.disposed = true;
        this.requestId++;
        this.controller?.abort();
    }

    refreshAccount(webview: MessageSink<ToWebViewMsgDef>): void {
        // A successful sign-in also raises an account event. Let the explicit request finish consent.
        if (this.disposed || this.signingIn) return;
        webview.postGitHubAccountLoaded({ scope: this.scope, page: 1, signedInUser: null });
        void this.load(webview, { prompt: false, scope: this.scope, page: 1 });
    }

    async load(webview: MessageSink<ToWebViewMsgDef>, request: GitHubRepositoryRequest): Promise<void> {
        if (this.disposed) return;
        const requestId = ++this.requestId;
        this.controller?.abort();
        const controller = new AbortController();
        this.controller = controller;
        this.scope = request.scope;
        this.signingIn = request.prompt;
        let signedInUser: string | null = null;
        let timedOut = false;
        let timeoutMessage = request.prompt
            ? l10n.t("GitHub sign-in did not finish. Complete or cancel the VS Code sign-in prompt, then try again.")
            : l10n.t("The GitHub account check timed out. Select Sign in to GitHub to try again.");

        const startTimeout = (milliseconds: number) =>
            setTimeout(() => {
                timedOut = true;
                controller.abort();
            }, milliseconds);
        let timeout = startTimeout(request.prompt ? 120_000 : 15_000);
        const context = { scope: request.scope, page: request.page };
        webview.postGitHubReposLoading(request);

        try {
            const session = await untilAborted(this.getSession(request.prompt), controller.signal);
            if (requestId !== this.requestId) return;
            clearTimeout(timeout);
            this.signingIn = false;
            signedInUser = session?.account.label ?? null;
            webview.postGitHubAccountLoaded({ ...context, signedInUser });

            if (!session) {
                webview.postGitHubReposLoaded({ ...context, repos: [], nextPage: null, signedInUser });
                return;
            }

            timeout = startTimeout(30_000);
            timeoutMessage = l10n.t(
                "GitHub took too long to return repositories. Retry the request or paste a repository URL.",
            );
            const result = await untilAborted(this.loadPage(session, request, controller.signal), controller.signal);
            if (requestId !== this.requestId) return;
            webview.postGitHubReposLoaded({ ...context, ...result, signedInUser });
        } catch (error) {
            if (requestId !== this.requestId) return;
            webview.postGitHubReposError({
                ...context,
                signedInUser,
                // A failure before any session was obtained is a sign-in problem, not an API one.
                needsSignIn: signedInUser === null,
                message: timedOut
                    ? timeoutMessage
                    : l10n.t(
                          "Could not load your GitHub repositories. Try again or paste a repository URL. {0}",
                          error instanceof Error ? error.message : String(error),
                      ),
            });
        } finally {
            clearTimeout(timeout);
            if (requestId === this.requestId) {
                this.signingIn = false;
                this.controller = undefined;
            }
        }
    }
}

function untilAborted<T>(operation: PromiseLike<T>, signal: AbortSignal): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const abort = () => reject(signal.reason);
        if (signal.aborted) {
            abort();
            return;
        }
        signal.addEventListener("abort", abort, { once: true });
        Promise.resolve(operation).then(
            (result) => {
                signal.removeEventListener("abort", abort);
                resolve(result);
            },
            (error: unknown) => {
                signal.removeEventListener("abort", abort);
                reject(error);
            },
        );
    });
}
