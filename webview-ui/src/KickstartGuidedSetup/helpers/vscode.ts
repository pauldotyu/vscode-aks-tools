import { getWebviewMessageContext } from "../../utilities/vscode";

export const vscode = getWebviewMessageContext<"kickstartGuidedSetup">({
    finishRequest: null,
    listGitHubReposRequest: null,
});
