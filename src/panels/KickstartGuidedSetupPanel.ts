import * as vscode from "vscode";
import * as l10n from "@vscode/l10n";
import { KICKSTART_SAMPLES, handoffToChat } from "../commands/aksKickstart/kickstartChat";
import { KickstartRepositoryLoader } from "../commands/aksKickstart/kickstartRepositories";
import { MessageHandler } from "../webview-contract/messaging";
import {
    GuidedSetupSelections,
    InitialState,
    ToVsCodeMsgDef,
} from "../webview-contract/webviewDefinitions/kickstartGuidedSetup";
import { TelemetryDefinition, ToWebviewMessageSink } from "../webview-contract/webviewTypes";
import { BasePanel, PanelDataProvider } from "./BasePanel";

export class KickstartGuidedSetupPanel extends BasePanel<"kickstartGuidedSetup"> {
    constructor(extensionUri: vscode.Uri) {
        super(extensionUri, "kickstartGuidedSetup", {
            errorNotification: null,
            gitHubReposLoading: null,
            gitHubAccountLoaded: null,
            gitHubReposLoaded: null,
            gitHubReposError: null,
        });
    }
}

export class KickstartGuidedSetupDataProvider implements PanelDataProvider<"kickstartGuidedSetup"> {
    private authListener: vscode.Disposable | undefined;
    private readonly repositories = new KickstartRepositoryLoader((prompt) =>
        vscode.authentication.getSession("github", ["repo"], prompt ? { createIfNone: true } : { silent: true }),
    );

    getTitle(): string {
        return l10n.t("AKS Kickstart");
    }

    getInitialState(): InitialState {
        return {
            samples: KICKSTART_SAMPLES,
            workspaceIsEmpty: !vscode.workspace.workspaceFolders?.length,
            workspaceName: vscode.workspace.workspaceFolders?.[0]?.name ?? null,
        };
    }

    getTelemetryDefinition(): TelemetryDefinition<"kickstartGuidedSetup"> {
        return { finishRequest: true, listGitHubReposRequest: true };
    }

    /** Disposable to pass to `panel.show(...)` so the auth listener is cleaned up. */
    getProviderDisposable(): vscode.Disposable {
        return new vscode.Disposable(() => {
            this.repositories.dispose();
            this.authListener?.dispose();
        });
    }

    getMessageHandler(webview: ToWebviewMessageSink<"kickstartGuidedSetup">): MessageHandler<ToVsCodeMsgDef> {
        this.authListener?.dispose();
        this.authListener = vscode.authentication.onDidChangeSessions((e) => {
            if (e.provider.id === "github") this.repositories.refreshAccount(webview);
        });

        return {
            finishRequest: (args) => this.handleFinish(webview, args),
            listGitHubReposRequest: (args) => this.repositories.load(webview, args),
        };
    }

    private async handleFinish(
        webview: ToWebviewMessageSink<"kickstartGuidedSetup">,
        selections: GuidedSetupSelections,
    ) {
        try {
            await handoffToChat(selections);
            vscode.window.showInformationMessage(l10n.t("Continuing AKS Kickstart in the chat view."));
        } catch (e) {
            webview.postErrorNotification({
                message: l10n.t("Couldn't open the Kickstart chat: {0}", String(e)),
            });
        }
    }
}
