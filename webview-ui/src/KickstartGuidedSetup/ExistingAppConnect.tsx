import { faArrowLeft, faCircleInfo, faRotateRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import * as l10n from "@vscode/l10n";
import { useState } from "react";
import {
    GitHubRepo,
    GitHubRepositoryRequest,
    GitHubRepositoryScope,
} from "../../../src/webview-contract/webviewDefinitions/kickstartGuidedSetup";
import {
    getBranchNameError,
    getWorkspaceNameError,
    parseGitHubRepository,
    suggestWorkingBranch,
} from "./helpers/connectForm";
import { RepositoryPicker } from "./RepositoryPicker";
import styles from "./ExistingAppConnect.module.css";

interface ExistingAppConnectProps {
    workspaceName: string | null;
    repositories: GitHubRepo[] | null;
    repositoriesLoading: boolean;
    repositoriesError: string | null;
    signedInUser: string | null;
    signingIn: boolean;
    /** True when listing failed purely because no GitHub session is available. */
    needsSignIn: boolean;
    repositoryScope: GitHubRepositoryScope;
    nextPage: number | null;
    onLoadRepositories: (request: GitHubRepositoryRequest) => void;
    onOtherSources: () => void;
}

type Field = "repository" | "workspace" | "baseBranch" | "workingBranch";

export function ExistingAppConnect(props: ExistingAppConnectProps) {
    const [repositoryInput, setRepositoryInput] = useState("");
    const [selectedRepository, setSelectedRepository] = useState<GitHubRepo | null>(null);
    const [workspaceOverride, setWorkspaceOverride] = useState<string | null>(null);
    const [baseBranchOverride, setBaseBranchOverride] = useState<string | null>(null);
    const [workingBranchOverride, setWorkingBranchOverride] = useState<string | null>(null);
    const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});

    const repository = parseGitHubRepository(repositoryInput);
    const repositoryMetadata =
        props.repositories?.find((item) => item.fullName.toLowerCase() === repository?.fullName.toLowerCase()) ??
        (selectedRepository?.fullName.toLowerCase() === repository?.fullName.toLowerCase() ? selectedRepository : null);
    const workspaceName = workspaceOverride ?? repository?.name ?? "";
    const baseBranch = baseBranchOverride ?? repositoryMetadata?.defaultBranch ?? "";
    const workingBranch = workingBranchOverride ?? suggestWorkingBranch(workspaceName);
    const errors: Record<Field, string | null> = {
        repository: repository
            ? null
            : l10n.t("Select a repository or enter a URL such as https://github.com/owner/repo."),
        workspace: getWorkspaceNameError(workspaceName),
        baseBranch: getBranchNameError(baseBranch),
        workingBranch:
            getBranchNameError(workingBranch) ??
            (workingBranch === baseBranch
                ? l10n.t("Use a working branch that is different from the base branch.")
                : null),
    };
    const fieldsValid = Object.values(errors).every((error) => error === null);
    const showRepositoryStatus =
        props.repositoriesLoading ||
        !!props.repositoriesError ||
        !props.signedInUser ||
        props.repositories?.length === 0;

    function touch(field: Field) {
        setTouched((previous) => ({ ...previous, [field]: true }));
    }

    function fieldError(field: Field) {
        return touched[field] ? errors[field] : null;
    }

    function renderError(field: Field) {
        const error = fieldError(field);
        return error ? (
            <p id={`kickstart-${field}-error`} className={styles.fieldError} role="alert">
                {error}
            </p>
        ) : null;
    }

    function changeRepository(value: string, selected: GitHubRepo | null = null) {
        setRepositoryInput(value);
        setSelectedRepository(selected);
        setWorkspaceOverride(null);
        setBaseBranchOverride(null);
        setWorkingBranchOverride(null);
        setTouched({});
    }

    return (
        <main className={styles.page}>
            <div className={styles.context}>
                <span>
                    {props.workspaceName
                        ? l10n.t("Current workspace: {0}", props.workspaceName)
                        : l10n.t("No workspace folder open")}
                </span>
                <span>{l10n.t("No working branch created")}</span>
            </div>

            <ol className={styles.stages} aria-label={l10n.t("Deployment stages")}>
                {[l10n.t("Connect"), l10n.t("Configure"), l10n.t("Review"), l10n.t("Deploy")].map((stage, index) => (
                    <li key={stage} aria-current={index === 0 ? "step" : undefined}>
                        <span className={styles.stageNumber}>{index + 1}</span>
                        {stage}
                    </li>
                ))}
            </ol>

            <header className={styles.heading}>
                <h1>{l10n.t("Connect your repository")}</h1>
                <p>{l10n.t("Choose a GitHub app and a base branch. Inspect assets before making changes.")}</p>
            </header>

            <form className={styles.form} onSubmit={(event) => event.preventDefault()}>
                <div
                    className={styles.field}
                    onBlur={(event) => {
                        if (!event.currentTarget.contains(event.relatedTarget)) touch("repository");
                    }}
                >
                    <div className={styles.repositoryHeading}>
                        <div className={styles.repositorySource}>
                            <label htmlFor="kickstart-repository">{l10n.t("Repository")}</label>
                            <select
                                aria-label={l10n.t("Repository scope")}
                                value={props.repositoryScope}
                                disabled={props.signingIn}
                                onChange={(event) => {
                                    const scope = event.currentTarget.value;
                                    if (scope === "owned" || scope === "all") {
                                        props.onLoadRepositories({ prompt: false, scope, page: 1 });
                                    }
                                }}
                            >
                                <option value="owned">{l10n.t("My repositories")}</option>
                                <option value="all">{l10n.t("All accessible repositories")}</option>
                            </select>
                        </div>
                        <div className={styles.account}>
                            {props.signedInUser && <span>{l10n.t("Signed in as {0}", props.signedInUser)}</span>}
                            <button
                                type="button"
                                className="secondary-button"
                                disabled={props.signingIn || (props.repositoriesLoading && !!props.signedInUser)}
                                onClick={() =>
                                    props.onLoadRepositories({ prompt: true, scope: props.repositoryScope, page: 1 })
                                }
                            >
                                {props.signingIn ? (
                                    l10n.t("Signing in...")
                                ) : props.signedInUser ? (
                                    <>
                                        <FontAwesomeIcon icon={faRotateRight} aria-hidden="true" />
                                        {l10n.t("Refresh")}
                                    </>
                                ) : (
                                    l10n.t("Sign in to GitHub")
                                )}
                            </button>
                        </div>
                    </div>
                    <RepositoryPicker
                        value={repositoryInput}
                        repositories={props.repositories ?? []}
                        loading={props.repositoriesLoading}
                        hasMore={props.nextPage !== null}
                        error={fieldError("repository")}
                        onChange={(value) => changeRepository(value)}
                        onSelect={(selected) => changeRepository(selected.cloneUrl.replace(/\.git$/, ""), selected)}
                    />
                    <p id="kickstart-repository-help" className={styles.hint}>
                        {l10n.t(
                            "Search loaded repositories by owner, name, or description, most recently pushed first. You can also paste a repository URL.",
                        )}
                    </p>
                    {renderError("repository")}
                    <div className={styles.repositoryStatus} aria-live="polite" hidden={!showRepositoryStatus}>
                        {props.repositoriesLoading ? (
                            <>
                                <div className={styles.loadingBar} aria-hidden="true" />
                                <span>
                                    {props.signingIn
                                        ? l10n.t("Complete the GitHub sign-in prompt in VS Code.")
                                        : props.signedInUser
                                          ? l10n.t("Loading your GitHub repositories...")
                                          : l10n.t("Checking your GitHub sign-in...")}
                                </span>
                            </>
                        ) : props.repositoriesError ? (
                            <p
                                className={props.needsSignIn ? undefined : styles.fieldError}
                                role={props.needsSignIn ? undefined : "alert"}
                            >
                                {props.repositoriesError}
                            </p>
                        ) : !props.signedInUser ? (
                            <p>{l10n.t("Sign in to browse your repositories, or paste a URL to prepare the form.")}</p>
                        ) : props.repositories?.length === 0 ? (
                            <p>
                                {l10n.t(
                                    "No repositories were found for this account. Refresh, check your GitHub access, or paste a URL.",
                                )}
                            </p>
                        ) : null}
                    </div>
                    {props.nextPage !== null && (
                        <div className={styles.repositoryPagination}>
                            <span className={styles.hint}>
                                {l10n.t(
                                    "{0} repositories loaded. More are available to search.",
                                    props.repositories?.length ?? 0,
                                )}
                            </span>
                            <button
                                type="button"
                                className="secondary-button"
                                disabled={props.repositoriesLoading}
                                onClick={() => {
                                    if (props.nextPage !== null) {
                                        props.onLoadRepositories({
                                            prompt: false,
                                            scope: props.repositoryScope,
                                            page: props.nextPage,
                                        });
                                    }
                                }}
                            >
                                {props.repositoriesError
                                    ? l10n.t("Retry loading more")
                                    : l10n.t("Load more repositories")}
                            </button>
                        </div>
                    )}
                </div>

                <div className={styles.field}>
                    <label htmlFor="kickstart-workspace">{l10n.t("Workspace name")}</label>
                    <input
                        id="kickstart-workspace"
                        type="text"
                        autoComplete="off"
                        value={workspaceName}
                        placeholder={l10n.t("Prefilled from the repository name")}
                        onChange={(event) => setWorkspaceOverride(event.currentTarget.value)}
                        onBlur={() => touch("workspace")}
                        aria-invalid={!!fieldError("workspace")}
                        aria-describedby={`kickstart-workspace-help${fieldError("workspace") ? " kickstart-workspace-error" : ""}`}
                    />
                    <p id="kickstart-workspace-help" className={styles.hint}>
                        {l10n.t("A name for the application's working folder. Your current workspace is not renamed.")}
                    </p>
                    {renderError("workspace")}
                </div>

                <div className={styles.branches}>
                    <div className={styles.field}>
                        <label htmlFor="kickstart-baseBranch">{l10n.t("Base branch")}</label>
                        <input
                            id="kickstart-baseBranch"
                            type="text"
                            autoComplete="off"
                            spellCheck={false}
                            placeholder={l10n.t("e.g. main")}
                            value={baseBranch}
                            onChange={(event) => setBaseBranchOverride(event.currentTarget.value)}
                            onBlur={() => touch("baseBranch")}
                            aria-invalid={!!fieldError("baseBranch")}
                            aria-describedby={`kickstart-baseBranch-help${fieldError("baseBranch") ? " kickstart-baseBranch-error" : ""}`}
                        />
                        <p id="kickstart-baseBranch-help" className={styles.hint}>
                            {repositoryMetadata
                                ? l10n.t("Prefilled from GitHub's default branch.")
                                : l10n.t("Enter the branch to start from.")}
                        </p>
                        {renderError("baseBranch")}
                    </div>
                    <div className={styles.field}>
                        <label htmlFor="kickstart-workingBranch">{l10n.t("Working branch")}</label>
                        <input
                            id="kickstart-workingBranch"
                            type="text"
                            autoComplete="off"
                            spellCheck={false}
                            placeholder="kickstart/your-app"
                            value={workingBranch}
                            onChange={(event) => setWorkingBranchOverride(event.currentTarget.value)}
                            onBlur={() => touch("workingBranch")}
                            aria-invalid={!!fieldError("workingBranch")}
                            aria-describedby={`kickstart-workingBranch-help${fieldError("workingBranch") ? " kickstart-workingBranch-error" : ""}`}
                        />
                        <p id="kickstart-workingBranch-help" className={styles.hint}>
                            {l10n.t("Suggested from the workspace name. Edit it to keep your own branch name.")}
                        </p>
                        {renderError("workingBranch")}
                    </div>
                </div>

                <div className={styles.field}>
                    <label htmlFor="kickstart-application-folder">{l10n.t("Application folder")}</label>
                    <input
                        id="kickstart-application-folder"
                        type="text"
                        disabled
                        placeholder={l10n.t("Choose after inspection, if needed")}
                        aria-describedby="kickstart-application-folder-help"
                    />
                    <p id="kickstart-application-folder-help" className={styles.hint}>
                        {l10n.t(
                            "Folder selection will be available when inspection can identify multiple applications.",
                        )}
                    </p>
                </div>

                <footer className={styles.footer}>
                    <div className={styles.selectionStatus} role="status">
                        <strong>{fieldsValid ? l10n.t("Repository selected") : l10n.t("Choose your source")}</strong>
                        <p>
                            {fieldsValid
                                ? l10n.t(
                                      "{0} is the selected base. No checkout or working branch has been created.",
                                      baseBranch,
                                  )
                                : l10n.t("Select a repository and confirm the workspace and branch names.")}
                        </p>
                    </div>
                    <p id="kickstart-preview-boundary" className={styles.previewNotice}>
                        <FontAwesomeIcon icon={faCircleInfo} aria-hidden="true" />
                        <span>
                            {l10n.t(
                                "First-screen preview: connecting and read-only inspection come next. No files, branches, or Azure resources are changed.",
                            )}
                        </span>
                    </p>
                    <div className={styles.actions}>
                        <button type="button" disabled aria-describedby="kickstart-preview-boundary">
                            {l10n.t("Connect and inspect")}
                        </button>
                        <button type="button" className="secondary-button" onClick={props.onOtherSources}>
                            <FontAwesomeIcon icon={faArrowLeft} aria-hidden="true" />
                            {l10n.t("Other ways to start")}
                        </button>
                    </div>
                </footer>
            </form>
        </main>
    );
}
