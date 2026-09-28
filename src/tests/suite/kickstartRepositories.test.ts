import * as assert from "assert";
import { Octokit } from "@octokit/rest";
import { listKickstartRepositories } from "../../commands/aksKickstart/kickstartRepositories";

describe("Kickstart GitHub repositories", () => {
    it("returns the first page immediately rather than fetching every accessible repository", async () => {
        const requests: URL[] = [];
        const mockFetch: typeof fetch = async (input) => {
            const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
            requests.push(url);
            const secondPage = url.searchParams.get("page") === "2";
            const items = secondPage
                ? [{ full_name: "another-org/orders", default_branch: "develop", private: true }]
                : Array.from({ length: 100 }, (_, index) => ({
                      full_name: `sample-org/repo-${index.toString().padStart(3, "0")}`,
                      default_branch: "main",
                      private: false,
                  }));
            const headers = new Headers({ "content-type": "application/json" });
            if (!secondPage) {
                headers.set(
                    "link",
                    '<https://api.github.com/user/repos?page=2>; rel="next", <https://api.github.com/user/repos?page=117>; rel="last"',
                );
            }
            return new Response(
                JSON.stringify(
                    items.map((item) => ({
                        ...item,
                        description: null,
                        pushed_at: "2026-09-01T00:00:00Z",
                        clone_url: `https://github.com/${item.full_name}.git`,
                    })),
                ),
                { status: 200, headers },
            );
        };
        const octokit = new Octokit({ request: { fetch: mockFetch } });
        const firstPage = await listKickstartRepositories(octokit, { scope: "owned", page: 1 });

        assert.strictEqual(requests.length, 1);
        assert.strictEqual(requests[0].searchParams.get("per_page"), "100");
        assert.strictEqual(requests[0].searchParams.get("sort"), "pushed");
        assert.strictEqual(requests[0].searchParams.get("direction"), "desc");
        assert.strictEqual(requests[0].searchParams.get("affiliation"), "owner");
        assert.strictEqual(firstPage.repos.length, 100);
        assert.strictEqual(firstPage.nextPage, 2);
        assert.strictEqual(firstPage.repos[99].fullName, "sample-org/repo-099");

        const secondPage = await listKickstartRepositories(octokit, { scope: "all", page: firstPage.nextPage });
        assert.strictEqual(requests.length, 2);
        assert.strictEqual(requests[1].searchParams.get("page"), "2");
        assert.strictEqual(requests[1].searchParams.get("affiliation"), "owner,collaborator,organization_member");
        assert.strictEqual(secondPage.nextPage, null);
        assert.deepStrictEqual(secondPage.repos[0], {
            fullName: "another-org/orders",
            description: null,
            cloneUrl: "https://github.com/another-org/orders.git",
            private: true,
            defaultBranch: "develop",
            pushedAt: "2026-09-01T00:00:00Z",
        });
    });

    it("surfaces access failures instead of returning an empty successful result", async () => {
        const octokit = new Octokit({
            request: {
                fetch: async () =>
                    new Response(JSON.stringify({ message: "Repository access denied." }), {
                        status: 403,
                        headers: { "content-type": "application/json" },
                    }),
            },
        });
        await assert.rejects(
            listKickstartRepositories(octokit, { scope: "owned", page: 1 }),
            /Repository access denied/,
        );
    });

    it("rejects invalid pages before making an API request", async () => {
        const octokit = new Octokit({
            request: {
                fetch: async () => {
                    throw new Error("Unexpected request");
                },
            },
        });
        for (const page of [0, -1, 1.5, NaN, Infinity]) {
            await assert.rejects(
                listKickstartRepositories(octokit, { scope: "owned", page }),
                /Invalid repository scope or page/,
            );
        }
    });
});
