import { useEffect } from "react";
import { InitialState } from "../../../src/webview-contract/webviewDefinitions/kickstartGuidedSetup";
import { useStateManagement } from "../utilities/state";
import { GuidedSetupInput } from "./GuidedSetupInput";
import { Stage, stateUpdater } from "./helpers/state";
import { vscode } from "./helpers/vscode";

export function KickstartGuidedSetup(initialState: InitialState) {
    const { state, eventHandlers } = useStateManagement(stateUpdater, initialState, vscode);

    // Silent probe on open: shows the signed-in account without forcing a consent dialog.
    useEffect(() => {
        vscode.postListGitHubReposRequest({ prompt: false, scope: "owned", page: 1 });
    }, []);

    // The form stays mounted while finishing so a failed handoff returns the user to their
    // selections instead of stranding them on a message that can never clear.
    return (
        <GuidedSetupInput
            samples={state.samples}
            workspaceIsEmpty={state.workspaceIsEmpty}
            workspaceName={state.workspaceName}
            errorMessage={state.errorMessage}
            githubRepos={state.githubRepos}
            githubReposLoading={state.githubReposLoading}
            githubReposError={state.githubReposError}
            githubSignedInUser={state.githubSignedInUser}
            githubSigningIn={state.githubSigningIn}
            githubNeedsSignIn={state.githubNeedsSignIn}
            githubReposScope={state.githubReposScope}
            githubReposNextPage={state.githubReposNextPage}
            isFinishing={state.stage === Stage.Finishing}
            eventHandlers={eventHandlers}
            vscode={vscode}
        />
    );
}
