import { WebviewDefinition } from "../webviewTypes";

export interface KickstartSample {
    label: string;
    stack: string;
    description: string;
    repoUrl: string;
}

export type AppSourceKind = "repo" | "new" | "sample" | "workspace";

export type ProjectType = "frontend" | "backend" | "fullstack" | "agentic";

export type AppSource =
    | { kind: "repo"; repoUrl: string }
    | { kind: "new"; projectType: ProjectType; language: string; projectIdea?: string }
    | { kind: "sample"; sampleLabel: string; sampleRepoUrl: string }
    | { kind: "workspace" };

export interface GuidedSetupSelections {
    appSource: AppSource;
}

export interface GitHubRepo {
    fullName: string;
    description: string | null;
    cloneUrl: string;
    private: boolean;
    defaultBranch: string;
    /** ISO timestamp of the last push, or null if GitHub didn't report one. */
    pushedAt: string | null;
}

export type GitHubRepositoryScope = "owned" | "all";

export interface GitHubRepositoryRequest {
    /** Gates the interactive sign-in/consent dialog; background loads pass false. */
    prompt: boolean;
    scope: GitHubRepositoryScope;
    page: number;
}

export interface GitHubRepositoryPage {
    repos: GitHubRepo[];
    /** Next page number, or null when the last page has been reached. */
    nextPage: number | null;
}

export interface GitHubRepositoryResponseContext {
    scope: GitHubRepositoryScope;
    page: number;
    signedInUser: string | null;
}

export interface InitialState {
    samples: KickstartSample[];
    workspaceIsEmpty: boolean;
    workspaceName: string | null;
}

export type ToVsCodeMsgDef = {
    finishRequest: GuidedSetupSelections;
    listGitHubReposRequest: GitHubRepositoryRequest;
};

export type ToWebViewMsgDef = {
    errorNotification: { message: string };
    gitHubReposLoading: GitHubRepositoryRequest;
    gitHubAccountLoaded: GitHubRepositoryResponseContext;
    gitHubReposLoaded: GitHubRepositoryPage & GitHubRepositoryResponseContext;
    gitHubReposError: { message: string; needsSignIn: boolean } & GitHubRepositoryResponseContext;
};

export type KickstartGuidedSetupDefinition = WebviewDefinition<InitialState, ToVsCodeMsgDef, ToWebViewMsgDef>;
