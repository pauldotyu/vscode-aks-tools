import * as l10n from "@vscode/l10n";
import { GitHubRepo } from "../../../../src/webview-contract/webviewDefinitions/kickstartGuidedSetup";
import { normalizeRepoUrl } from "./repoUrl";

/**
 * Resolve a pasted repository reference to a canonical URL plus the name we derive a workspace
 * from. Delegates the parsing to `normalizeRepoUrl` so the Connect screen accepts the same
 * shapes as the rest of Kickstart: bare `owner/repo`, a missing scheme, a trailing slash, or a
 * GitHub web subpath copied from the address bar.
 */
export function parseGitHubRepository(value: string): { fullName: string; name: string; url: string } | null {
    const result = normalizeRepoUrl(value);
    if (!result.ok) return null;

    // normalizeRepoUrl is deliberately host-permissive and keeps any query or fragment that was
    // pasted. The Connect form needs an owner/name pair, so re-parse and take only the path.
    let parsed: URL;
    try {
        parsed = new URL(result.url);
    } catch {
        return null;
    }
    if (parsed.hostname.toLowerCase().replace(/^www\./, "") !== "github.com") return null;
    // Refuse embedded credentials rather than carrying a pasted token into the clone URL.
    if (parsed.username || parsed.password) return null;
    if (parsed.search || parsed.hash) return null;

    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments.length !== 2) return null;

    const [owner, rawName] = segments;
    const name = rawName.replace(/\.git$/i, "");
    if (!name || name === "." || name === "..") return null;
    return { fullName: `${owner}/${name}`, name, url: result.url };
}

/** Coarse "2d ago" style hint so the last-pushed ordering is visible in the list. */
export function formatPushedAt(iso: string | null): string | null {
    if (!iso) return null;
    const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
    if (!Number.isFinite(days) || days < 0) return null;
    if (days === 0) return l10n.t("today");
    if (days === 1) return l10n.t("yesterday");
    if (days < 30) return l10n.t("{0}d ago", days);
    if (days < 365) return l10n.t("{0}mo ago", Math.floor(days / 30));
    return l10n.t("{0}y ago", Math.floor(days / 365));
}

export function filterRepositories(repositories: GitHubRepo[], query: string): GitHubRepo[] {
    // A pasted URL isn't a search term, so it filters nothing.
    const search = parseGitHubRepository(query) ? "" : query.trim().toLowerCase();
    if (!search) return repositories;
    // Deliberately not re-sorted: the list arrives in last-pushed order, so the repositories
    // someone is actually working in stay at the top.
    return repositories.filter(
        (repository) =>
            repository.fullName.toLowerCase().includes(search) ||
            repository.description?.toLowerCase().includes(search),
    );
}

export function suggestWorkingBranch(workspaceName: string): string {
    const suffix = workspaceName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "");
    return suffix ? `kickstart/${suffix}` : "";
}

export function getBranchNameError(value: string): string | null {
    if (!value) return l10n.t("Enter a branch name.");
    if (
        value === "@" ||
        value === "HEAD" ||
        value.startsWith("-") ||
        /[\s~^:?*[\]\\]/.test(value) ||
        containsControlCharacter(value) ||
        value.includes("..") ||
        value.includes("@{") ||
        value.split("/").some((part) => !part || part.startsWith(".") || part.endsWith(".lock")) ||
        value.endsWith(".")
    ) {
        return l10n.t("Use a valid Git branch name without spaces, '..', or special Git characters.");
    }
    return null;
}

export function getWorkspaceNameError(value: string): string | null {
    if (!value.trim()) return l10n.t("Enter a workspace name.");
    if (
        value !== value.trim() ||
        value === "." ||
        value === ".." ||
        /[/\\]/.test(value) ||
        containsControlCharacter(value)
    ) {
        return l10n.t("Use a folder name without slashes or leading or trailing spaces.");
    }
    return null;
}

function containsControlCharacter(value: string): boolean {
    return [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
}
