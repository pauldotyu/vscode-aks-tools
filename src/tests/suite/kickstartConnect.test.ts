import * as assert from "assert";
import {
    filterRepositories,
    getBranchNameError,
    getWorkspaceNameError,
    parseGitHubRepository,
    suggestWorkingBranch,
} from "../../../webview-ui/src/KickstartGuidedSetup/helpers/connectForm";
import { GitHubRepo } from "../../webview-contract/webviewDefinitions/kickstartGuidedSetup";

describe("Kickstart Connect form", () => {
    it("accepts GitHub URLs with optional clone suffixes and trailing slashes", () => {
        for (const url of [
            "https://github.com/sample-org/orders-api",
            "https://github.com/sample-org/orders-api.git",
            " https://github.com/sample-org/orders-api.git/ ",
        ]) {
            assert.deepStrictEqual(parseGitHubRepository(url), {
                fullName: "sample-org/orders-api",
                name: "orders-api",
                url: /\.git$/.test(url.trim())
                    ? "https://github.com/sample-org/orders-api.git"
                    : "https://github.com/sample-org/orders-api",
            });
        }
        assert.deepStrictEqual(parseGitHubRepository("https://github.com/sample-org/.github"), {
            fullName: "sample-org/.github",
            name: ".github",
            url: "https://github.com/sample-org/.github",
        });
    });

    it("accepts the shorthand and web-subpath forms people actually paste", () => {
        // Shared with the rest of Kickstart via normalizeRepoUrl, so Connect stays consistent.
        for (const url of [
            "sample-org/orders-api",
            "github.com/sample-org/orders-api",
            "https://github.com/sample-org/orders-api/tree/main",
            "https://www.github.com/sample-org/orders-api",
        ]) {
            assert.deepStrictEqual(parseGitHubRepository(url)?.fullName, "sample-org/orders-api", url);
        }
    });

    it("rejects incomplete URLs, other hosts, credentials, and paths within a repository", () => {
        for (const url of [
            "",
            "orders",
            "https://github.com/sample-org",
            "https://github.com/sample-org/..",
            "https://example.com/sample-org/orders-api",
            "https://github.com.example.com/sample-org/orders-api",
            "https://user:token@github.com/sample-org/orders-api",
            "https://github.com/sample-org/orders-api?token=example",
            "https://github.com/sample-org/orders-api#readme",
        ]) {
            assert.strictEqual(parseGitHubRepository(url), null, url);
        }
    });

    it("suggests a valid working branch from the editable workspace name", () => {
        assert.strictEqual(suggestWorkingBranch("orders-api"), "kickstart/orders-api");
        assert.strictEqual(suggestWorkingBranch(" Orders API "), "kickstart/orders-api");
        assert.strictEqual(suggestWorkingBranch(".github"), "kickstart/github");
        assert.strictEqual(suggestWorkingBranch(""), "");
        assert.strictEqual(suggestWorkingBranch("..."), "");
    });

    it("validates Git branch syntax without treating a name as an existing branch", () => {
        for (const branch of ["main", "develop", "kickstart/orders-api", "release/2026.09", "feature/orders_v2"]) {
            assert.strictEqual(getBranchNameError(branch), null, branch);
        }
        for (const branch of [
            "",
            "has spaces",
            "HEAD",
            "@",
            "-orders",
            "/orders",
            "orders/",
            "feature//orders",
            "feature/.orders",
            "orders..api",
            "orders.",
            "orders.lock",
            "orders.lock/next",
            "orders@{1}",
            "orders~1",
            "orders^",
            "orders:api",
            "orders?api",
            "orders*api",
            "orders[api]",
            "orders\\api",
            "orders\napi",
            "orders\u0000api",
        ]) {
            assert.notStrictEqual(getBranchNameError(branch), null, JSON.stringify(branch));
        }
    });

    it("requires a workspace folder name rather than a path", () => {
        assert.strictEqual(getWorkspaceNameError("orders-api"), null);
        assert.strictEqual(getWorkspaceNameError("Orders API"), null);
        for (const name of ["", " ", ".", "..", "../orders", "src/orders", "src\\orders", " orders", "orders "]) {
            assert.notStrictEqual(getWorkspaceNameError(name), null, name);
        }
    });

    it("searches full names and descriptions while preserving the last-pushed order", () => {
        const repository = (fullName: string, description: string | null): GitHubRepo => ({
            fullName,
            description,
            cloneUrl: `https://github.com/${fullName}.git`,
            private: true,
            defaultBranch: "develop",
            pushedAt: null,
        });
        const repos = [
            repository("sample-org/storefront", "Inventory dashboard"),
            repository("sample-developer/inventory", null),
            repository("sample-org/orders", "Order processing"),
        ];
        const originalOrder = repos.map((repo) => repo.fullName);
        // GitHub already returns these most-recently-pushed first, so an empty query must not re-sort.
        assert.deepStrictEqual(
            filterRepositories(repos, "").map((repo) => repo.fullName),
            originalOrder,
        );
        assert.deepStrictEqual(
            filterRepositories(repos, "sample-org").map((repo) => repo.fullName),
            ["sample-org/storefront", "sample-org/orders"],
        );
        assert.strictEqual(filterRepositories(repos, "SAMPLE-ORG").length, 2);
        assert.strictEqual(filterRepositories(repos, "inventory").length, 2);
        assert.strictEqual(filterRepositories(repos, "missing").length, 0);
        assert.strictEqual(filterRepositories(repos, repos[0].cloneUrl).length, 3);
        assert.deepStrictEqual(
            repos.map((repo) => repo.fullName),
            originalOrder,
        );
    });
});
