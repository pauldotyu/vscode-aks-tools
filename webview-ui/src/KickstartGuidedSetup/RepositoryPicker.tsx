import { faCodeBranch, faLock, faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import * as l10n from "@vscode/l10n";
import { KeyboardEvent, useEffect, useState } from "react";
import { GitHubRepo } from "../../../src/webview-contract/webviewDefinitions/kickstartGuidedSetup";
import { filterRepositories, formatPushedAt, parseGitHubRepository } from "./helpers/connectForm";
import styles from "./ExistingAppConnect.module.css";

interface RepositoryPickerProps {
    value: string;
    repositories: GitHubRepo[];
    loading: boolean;
    hasMore: boolean;
    error: string | null;
    onChange: (value: string) => void;
    onSelect: (repository: GitHubRepo) => void;
}

export function RepositoryPicker(props: RepositoryPickerProps) {
    const [open, setOpen] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const repositories = filterRepositories(props.repositories, props.value);
    const activeIndex = Math.min(highlightedIndex, Math.max(0, repositories.length - 1));
    const showResults = open && props.repositories.length > 0;
    const showList = showResults && repositories.length > 0;
    const activeRepository = repositories[activeIndex];
    const selectedFullName = parseGitHubRepository(props.value)?.fullName.toLowerCase();

    useEffect(() => {
        if (showList) {
            document.getElementById(`kickstart-repository-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
        }
    }, [showList, activeIndex, props.value]);

    function selectRepository(repository: GitHubRepo) {
        props.onSelect(repository);
        setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
        if (event.key === "Escape") {
            setOpen(false);
            event.preventDefault();
        } else if (event.key === "ArrowDown" && repositories.length > 0) {
            setHighlightedIndex(showList ? Math.min(activeIndex + 1, repositories.length - 1) : 0);
            setOpen(true);
            event.preventDefault();
        } else if (event.key === "ArrowUp" && repositories.length > 0) {
            setHighlightedIndex(showList ? Math.max(activeIndex - 1, 0) : repositories.length - 1);
            setOpen(true);
            event.preventDefault();
        } else if (event.key === "Enter" && showList && activeRepository) {
            selectRepository(activeRepository);
            event.preventDefault();
        }
    }

    return (
        <div
            className={styles.repositoryPicker}
            onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                    setOpen(false);
                }
            }}
        >
            <div className={styles.repositoryInput}>
                <FontAwesomeIcon icon={faMagnifyingGlass} aria-hidden="true" />
                <input
                    id="kickstart-repository"
                    type="text"
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={showList}
                    aria-controls={showList ? "kickstart-repositories" : undefined}
                    aria-activedescendant={
                        showList && activeRepository ? `kickstart-repository-${activeIndex}` : undefined
                    }
                    aria-describedby={`kickstart-repository-help${props.error ? " kickstart-repository-error" : ""}`}
                    aria-invalid={!!props.error}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={l10n.t("Search your repositories or paste a GitHub URL")}
                    value={props.value}
                    onChange={(event) => {
                        props.onChange(event.currentTarget.value);
                        setHighlightedIndex(0);
                        setOpen(true);
                    }}
                    onFocus={() => {
                        setHighlightedIndex(
                            Math.max(
                                0,
                                repositories.findIndex(
                                    (repository) => repository.fullName.toLowerCase() === selectedFullName,
                                ),
                            ),
                        );
                        setOpen(true);
                    }}
                    onKeyDown={handleKeyDown}
                />
            </div>
            {showResults && (
                <div className={styles.repositoryResults}>
                    {repositories.length === 0 ? (
                        <p className={styles.noResults} role="status">
                            {props.hasMore
                                ? l10n.t(
                                      "No matches in the loaded repositories. Load more repositories or paste a GitHub URL.",
                                  )
                                : l10n.t(
                                      "No matching repositories. Try another search, change the repository scope, or paste a URL.",
                                  )}
                        </p>
                    ) : (
                        <ul
                            id="kickstart-repositories"
                            role="listbox"
                            aria-label={l10n.t("GitHub repositories")}
                            aria-busy={props.loading}
                        >
                            {repositories.map((repository, index) => (
                                <li
                                    key={repository.fullName}
                                    id={`kickstart-repository-${index}`}
                                    role="option"
                                    aria-selected={repository.fullName.toLowerCase() === selectedFullName}
                                    className={index === activeIndex ? styles.activeRepository : undefined}
                                    onMouseDown={(event) => event.preventDefault()}
                                    onMouseMove={() => setHighlightedIndex(index)}
                                    onClick={() => selectRepository(repository)}
                                >
                                    <div className={styles.repositoryName}>
                                        <FontAwesomeIcon icon={faCodeBranch} aria-hidden="true" />
                                        <span className={styles.repositoryTitle}>{repository.fullName}</span>
                                        {repository.private && (
                                            <span className={styles.repositoryVisibility}>
                                                <FontAwesomeIcon icon={faLock} aria-hidden="true" />
                                                {l10n.t("Private")}
                                            </span>
                                        )}
                                        {formatPushedAt(repository.pushedAt) && (
                                            <span className={styles.repositoryPushed}>
                                                {formatPushedAt(repository.pushedAt)}
                                            </span>
                                        )}
                                    </div>
                                    {repository.description && <p>{repository.description}</p>}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
}
