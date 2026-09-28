import {
    GitHubRepo,
    GitHubRepositoryRequest,
    GitHubRepositoryScope,
    InitialState,
} from "../../../../src/webview-contract/webviewDefinitions/kickstartGuidedSetup";
import type { WebviewStateUpdater } from "../../utilities/state";

export enum Stage {
    CollectingInput,
    Finishing,
}

export type KickstartGuidedSetupState = InitialState & {
    stage: Stage;
    errorMessage: string | null;
    githubRepos: GitHubRepo[] | null;
    githubReposLoading: boolean;
    githubReposError: string | null;
    githubSignedInUser: string | null;
    githubSigningIn: boolean;
    /** True when listing failed purely because no GitHub session is available. */
    githubNeedsSignIn: boolean;
    githubReposScope: GitHubRepositoryScope;
    githubReposPage: number;
    githubReposNextPage: number | null;
};

export type EventDef = {
    setFinishing: void;
    setGitHubReposLoading: GitHubRepositoryRequest;
};

export const stateUpdater: WebviewStateUpdater<"kickstartGuidedSetup", EventDef, KickstartGuidedSetupState> = {
    createState: (initialState) => ({
        ...initialState,
        stage: Stage.CollectingInput,
        errorMessage: null,
        githubRepos: null,
        githubReposLoading: false,
        githubReposError: null,
        githubSignedInUser: null,
        githubSigningIn: false,
        githubNeedsSignIn: false,
        githubReposScope: "owned",
        githubReposPage: 1,
        githubReposNextPage: null,
    }),
    vscodeMessageHandler: {
        errorNotification: (state, args) => ({
            ...state,
            errorMessage: args.message,
            stage: Stage.CollectingInput,
        }),
        gitHubReposLoading: setRepositoriesLoading,
        gitHubAccountLoaded: (state, args) =>
            args.scope !== state.githubReposScope
                ? state
                : {
                      ...state,
                      githubSigningIn: false,
                      githubSignedInUser: args.signedInUser,
                      githubNeedsSignIn: args.signedInUser === null,
                      githubRepos: args.signedInUser ? state.githubRepos : null,
                      githubReposNextPage: args.signedInUser ? state.githubReposNextPage : null,
                  },
        gitHubReposLoaded: (state, args) =>
            args.scope !== state.githubReposScope || args.page !== state.githubReposPage
                ? state
                : {
                      ...state,
                      githubRepos:
                          args.page === 1 || !args.signedInUser
                              ? args.repos
                              : Array.from(
                                    new Map(
                                        [...(state.githubRepos ?? []), ...args.repos].map((repo) => [
                                            repo.fullName,
                                            repo,
                                        ]),
                                    ).values(),
                                ),
                      githubReposLoading: false,
                      githubSigningIn: false,
                      githubReposError: null,
                      githubSignedInUser: args.signedInUser,
                      githubNeedsSignIn: args.signedInUser === null,
                      githubReposNextPage: args.nextPage,
                  },
        gitHubReposError: (state, args) =>
            args.scope !== state.githubReposScope || args.page !== state.githubReposPage
                ? state
                : {
                      ...state,
                      githubReposLoading: false,
                      githubSigningIn: false,
                      githubReposError: args.message,
                      githubSignedInUser: args.signedInUser,
                      githubNeedsSignIn: args.needsSignIn,
                  },
    },
    eventHandler: {
        setFinishing: (state) => ({ ...state, stage: Stage.Finishing }),
        setGitHubReposLoading: setRepositoriesLoading,
    },
};

function setRepositoriesLoading(
    state: KickstartGuidedSetupState,
    request: GitHubRepositoryRequest,
): KickstartGuidedSetupState {
    return {
        ...state,
        githubRepos: request.page === 1 ? null : state.githubRepos,
        githubReposNextPage: request.page === 1 ? null : state.githubReposNextPage,
        githubReposLoading: true,
        githubSigningIn: request.prompt,
        githubReposError: null,
        githubReposScope: request.scope,
        githubReposPage: request.page,
    };
}
