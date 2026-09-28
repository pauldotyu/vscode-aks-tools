import * as assert from "assert";
import sinon from "sinon";
import type { AuthenticationSession } from "vscode";
import { KickstartRepositoryLoader } from "../../commands/aksKickstart/kickstartRepositories";
import { asMessageSink, Message } from "../../webview-contract/messaging";
import {
    GitHubRepositoryPage,
    GitHubRepositoryRequest,
    ToWebViewMsgDef,
} from "../../webview-contract/webviewDefinitions/kickstartGuidedSetup";
import { stateUpdater } from "../../../webview-ui/src/KickstartGuidedSetup/helpers/state";

const session: AuthenticationSession = {
    id: "test-session",
    account: { id: "test-account", label: "sample-developer" },
    accessToken: "test-token-not-a-real-credential",
    scopes: ["repo"],
};
const request: GitHubRepositoryRequest = { prompt: false, scope: "owned", page: 1 };
const page: GitHubRepositoryPage = {
    repos: [
        {
            fullName: "sample-developer/app",
            description: null,
            cloneUrl: "https://github.com/sample-developer/app.git",
            private: true,
            defaultBranch: "develop",
            pushedAt: null,
        },
    ],
    nextPage: 2,
};
const context = { scope: request.scope, page: 1, signedInUser: session.account.label };

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((complete) => {
        resolve = complete;
    });
    return { promise, resolve };
}

function createWebview() {
    const messages: Message<ToWebViewMsgDef>[] = [];
    const sink = asMessageSink<ToWebViewMsgDef>((message) => messages.push(message), {
        errorNotification: null,
        gitHubReposLoading: null,
        gitHubAccountLoaded: null,
        gitHubReposLoaded: null,
        gitHubReposError: null,
    });
    return { messages, sink };
}

describe("Kickstart GitHub loading lifecycle", () => {
    let clock: sinon.SinonFakeTimers;
    const loaders: KickstartRepositoryLoader[] = [];
    beforeEach(() => {
        clock = sinon.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    });
    afterEach(() => {
        loaders.splice(0).forEach((loader) => loader.dispose());
        clock.restore();
    });

    it("reports the signed-in account before waiting for a repository page", async () => {
        const result = deferred<GitHubRepositoryPage>();
        const loader = new KickstartRepositoryLoader(
            async () => session,
            () => result.promise,
        );
        loaders.push(loader);
        const { sink, messages } = createWebview();
        const loading = loader.load(sink, request);
        await clock.tickAsync(0);
        assert.deepStrictEqual(messages, [
            { command: "gitHubReposLoading", parameters: request },
            { command: "gitHubAccountLoaded", parameters: context },
        ]);
        result.resolve(page);
        await loading;
        assert.deepStrictEqual(messages.at(-1), {
            command: "gitHubReposLoaded",
            parameters: { ...context, ...page },
        });
        assert.strictEqual(clock.countTimers(), 0);
        assert.ok(!JSON.stringify(messages).includes(session.accessToken));
    });

    it("lets explicit sign-in supersede a stalled passive check", async () => {
        const passive = deferred<AuthenticationSession | undefined>();
        const prompts: boolean[] = [];
        const loader = new KickstartRepositoryLoader(
            (prompt) => {
                prompts.push(prompt);
                return prompt ? Promise.resolve(session) : passive.promise;
            },
            async () => page,
        );
        loaders.push(loader);
        const { sink, messages } = createWebview();
        const oldRequest = loader.load(sink, request);
        await loader.load(sink, { ...request, prompt: true });
        const count = messages.length;
        passive.resolve(undefined);
        await oldRequest;
        assert.deepStrictEqual(prompts, [false, true]);
        assert.strictEqual(messages.length, count);
        assert.strictEqual(messages.at(-1)?.command, "gitHubReposLoaded");
        assert.strictEqual(clock.countTimers(), 0);
    });

    it("does not interrupt sign-in when the new session raises an account event", async () => {
        const signingIn = deferred<AuthenticationSession | undefined>();
        let sessionRequests = 0;
        const loader = new KickstartRepositoryLoader(
            () => {
                sessionRequests++;
                return signingIn.promise;
            },
            async () => page,
        );
        loaders.push(loader);
        const { sink, messages } = createWebview();
        const loading = loader.load(sink, { ...request, prompt: true });
        loader.refreshAccount(sink);
        assert.strictEqual(sessionRequests, 1);
        signingIn.resolve(session);
        await loading;
        assert.strictEqual(messages.at(-1)?.command, "gitHubReposLoaded");
    });

    it("ends a signed-out passive check without requesting repositories", async () => {
        const loader = new KickstartRepositoryLoader(
            async () => undefined,
            async () => {
                throw new Error("Must not list repos when signed out");
            },
        );
        loaders.push(loader);
        const { sink, messages } = createWebview();
        await loader.load(sink, request);
        assert.deepStrictEqual(messages.at(-1), {
            command: "gitHubReposLoaded",
            parameters: { ...context, signedInUser: null, repos: [], nextPage: null },
        });
    });

    it("aborts a timed-out page and returns a retryable error", async () => {
        let aborted = false;
        const loader = new KickstartRepositoryLoader(
            async () => session,
            (_session, _query, signal) => {
                signal.addEventListener("abort", () => {
                    aborted = true;
                });
                return new Promise(() => {});
            },
        );
        loaders.push(loader);
        const { sink, messages } = createWebview();
        const loading = loader.load(sink, request);
        await clock.tickAsync(30_000);
        await loading;
        const last = messages.at(-1);
        assert.strictEqual(last?.command, "gitHubReposError");
        assert.ok(last?.command === "gitHubReposError" && last.parameters.message.includes("too long"));
        assert.ok(aborted);
        assert.strictEqual(clock.countTimers(), 0);
    });

    it("bounds passive and interactive authentication waits", async () => {
        for (const [prompt, timeout] of [
            [false, 15_000],
            [true, 120_000],
        ] as const) {
            const loader = new KickstartRepositoryLoader(() => new Promise(() => {}));
            loaders.push(loader);
            const { sink, messages } = createWebview();
            const loading = loader.load(sink, { ...request, prompt });
            await clock.tickAsync(timeout);
            await loading;
            const last = messages.at(-1);
            assert.ok(
                last?.command === "gitHubReposError" &&
                    last.parameters.message.includes(prompt ? "sign-in did not finish" : "account check timed out"),
            );
            assert.strictEqual(clock.countTimers(), 0);
        }
    });

    it("surfaces sign-in cancellation and permits another attempt", async () => {
        let cancelled = true;
        const loader = new KickstartRepositoryLoader(
            async () => {
                if (cancelled) throw new Error("User cancelled sign-in.");
                return session;
            },
            async () => page,
        );
        loaders.push(loader);
        const { sink, messages } = createWebview();
        await loader.load(sink, { ...request, prompt: true });
        assert.strictEqual(messages.at(-1)?.command, "gitHubReposError");
        cancelled = false;
        await loader.load(sink, { ...request, prompt: true });
        assert.strictEqual(messages.at(-1)?.command, "gitHubReposLoaded");
    });

    it("aborts superseded requests and does not post after the panel closes", async () => {
        const signals: AbortSignal[] = [];
        const loader = new KickstartRepositoryLoader(
            async () => session,
            (_session, _query, signal) => {
                signals.push(signal);
                return new Promise(() => {});
            },
        );
        loaders.push(loader);
        const { sink, messages } = createWebview();
        const first = loader.load(sink, request);
        await clock.tickAsync(0);
        const second = loader.load(sink, { ...request, scope: "all" });
        await clock.tickAsync(0);
        assert.ok(signals[0].aborted);
        const count = messages.length;
        loader.dispose();
        await Promise.all([first, second]);
        assert.ok(signals[1].aborted);
        assert.strictEqual(messages.length, count);
        assert.strictEqual(clock.countTimers(), 0);
    });
});

describe("Kickstart repository UI state", () => {
    const initial = () => stateUpdater.createState({ samples: [], workspaceIsEmpty: true, workspaceName: null });

    it("does not block sign-in while a passive check is pending", () => {
        const state = stateUpdater.vscodeMessageHandler.gitHubReposLoading(initial(), request);
        assert.strictEqual(initial().githubReposLoading, false);
        assert.strictEqual(state.githubReposLoading, true);
        assert.strictEqual(state.githubSigningIn, false);
        assert.strictEqual(state.githubSignedInUser, null);
        const authenticated = stateUpdater.vscodeMessageHandler.gitHubAccountLoaded(state, context);
        assert.strictEqual(authenticated.githubSignedInUser, session.account.label);
        assert.strictEqual(authenticated.githubReposLoading, true);
    });

    it("keeps loaded options usable after a next-page failure and deduplicates retries", () => {
        const loaded = stateUpdater.vscodeMessageHandler.gitHubReposLoaded(initial(), { ...context, ...page });
        const loading = stateUpdater.eventHandler.setGitHubReposLoading(loaded, { ...request, page: 2 });
        assert.deepStrictEqual(loading.githubRepos, page.repos);
        const failed = stateUpdater.vscodeMessageHandler.gitHubReposError(loading, {
            ...context,
            page: 2,
            message: "Retry",
            needsSignIn: false,
        });
        assert.deepStrictEqual(failed.githubRepos, page.repos);
        assert.strictEqual(failed.githubReposNextPage, 2);
        assert.strictEqual(failed.githubReposLoading, false);
        const retried = stateUpdater.vscodeMessageHandler.gitHubReposLoaded(failed, {
            ...context,
            ...page,
            page: 2,
            nextPage: null,
        });
        assert.strictEqual(retried.githubRepos?.length, 1);
    });

    it("does not let an old scope response replace a new scope's results", () => {
        const state = stateUpdater.eventHandler.setGitHubReposLoading(initial(), { ...request, scope: "all" });
        const stale = stateUpdater.vscodeMessageHandler.gitHubReposLoaded(state, { ...context, ...page });
        assert.strictEqual(stale, state);
    });

    it("clears previous account results when authentication no longer returns a session", () => {
        const loaded = stateUpdater.vscodeMessageHandler.gitHubReposLoaded(initial(), { ...context, ...page });
        const signedOut = stateUpdater.vscodeMessageHandler.gitHubAccountLoaded(loaded, {
            ...context,
            signedInUser: null,
        });
        assert.strictEqual(signedOut.githubRepos, null);
        assert.strictEqual(signedOut.githubReposNextPage, null);
        assert.strictEqual(signedOut.githubSignedInUser, null);
    });
});
