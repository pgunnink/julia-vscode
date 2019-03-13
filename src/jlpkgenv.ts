import * as vscode from 'vscode';
import * as settings from './settings';
import * as vslc from 'vscode-languageclient';
import * as telemetry from './telemetry';
import * as fs from 'async-file';
import * as packagepath from './packagepath'
import * as os from 'os';
import * as path from 'path'
import * as juliaexepath from './juliaexepath';
var exec = require('child-process-promise').exec;

let g_context: vscode.ExtensionContext = null;
let g_settings: settings.ISettings = null;
let g_languageClient: vslc.LanguageClient = null;

let g_current_environment: vscode.StatusBarItem = null;

let g_path_of_current_environment: string = null;

async function switchEnvToPath(envpath: string) {
    g_path_of_current_environment = envpath;
    g_current_environment.text = "Julia env: " + await getEnvName();

    g_languageClient.sendNotification("julia/activateenvironment", envpath);
}

async function changeJuliaEnvironment() {
    telemetry.traceEvent('changeCurrentEnvironment');

    const optionsEnv: vscode.QuickPickOptions = {
        placeHolder: 'Select environment'
    };

    const depotPaths = await packagepath.getPkgDepotPath();
    const projectNames = ['JuliaProject.toml', 'Project.toml'];
    const homeDir = os.homedir();

    let envFolders = [{ label: '(pick a folder)', description: '' }];

    if (vscode.workspace.workspaceFolders) {
        for (let workspaceFolder of vscode.workspace.workspaceFolders) {
            let curPath = workspaceFolder.uri.fsPath.toString();
            while (true) {
                let oldPath = curPath;
                for (let projectName of projectNames) {
                    if (await fs.exists(path.join(curPath, projectName))) {
                        envFolders.push({ label: path.basename(curPath), description: curPath });
                        break;
                    }
                }
                if (curPath == homeDir) break;
                curPath = path.dirname(curPath);
                if (oldPath == curPath) break;
            }
        }
    }

    for (let depotPath of depotPaths) {
        let envFolderForThisDepot = path.join(depotPath, 'environments');

        let folderExists = await fs.exists(envFolderForThisDepot);
        if (folderExists) {
            let envirsForThisDepot = await fs.readdir(envFolderForThisDepot);

            for (let envFolder of envirsForThisDepot) {
                envFolders.push({ label: envFolder, description: path.join(envFolderForThisDepot, envFolder) });
            }
        }
    }

    let resultPackage = await vscode.window.showQuickPick(envFolders, optionsEnv);

    if (resultPackage !== undefined) {
        if (resultPackage.description == '') {
            let resultFolder = await vscode.window.showOpenDialog({ canSelectFiles: false, canSelectFolders: true });
            // Is this actually an environment?
            if (resultFolder !== undefined) {
                let envPathUri = resultFolder[0].toString();
                let envPath = vscode.Uri.parse(envPathUri).fsPath;
                let isThisAEnv = await fs.exists(path.join(envPath, 'Project.toml'));
                if (isThisAEnv) {
                    switchEnvToPath(envPath);
                }
                else {
                    vscode.window.showErrorMessage('The selected path is not a julia environment.');
                }
            }
        }
        else {
            switchEnvToPath(resultPackage.description);
        }
    }
}

export async function getEnvPath() {
    if (g_path_of_current_environment == null) {
        let jlexepath = await juliaexepath.getJuliaExePath();
        if (vscode.workspace.workspaceFolders) process.chdir(vscode.workspace.workspaceFolders[0].uri.fsPath.toString());
        var res = await exec(`"${jlexepath}" --startup-file=no --history-file=no --project -e "using Pkg; println(dirname(Pkg.Types.Context().env.project_file))"`);
        g_path_of_current_environment = res.stdout.trim();
    }
    return g_path_of_current_environment;
}

export async function getEnvName() {
    let envpath = await getEnvPath();
    return path.basename(envpath);
}

export async function activate(context: vscode.ExtensionContext, settings: settings.ISettings) {
    g_context = context;
    g_settings = settings;
    context.subscriptions.push(vscode.commands.registerCommand('language-julia.changeCurrentEnvironment', changeJuliaEnvironment));
    // Environment status bar
    g_current_environment = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
    g_current_environment.show();
    g_current_environment.text = "Julia env: [loading]";
    g_current_environment.command = "language-julia.changeCurrentEnvironment";
    context.subscriptions.push(g_current_environment);
    switchEnvToPath(await getEnvPath());
}

export function onDidChangeConfiguration(newSettings: settings.ISettings) {
}

export function onNewLanguageClient(newLanguageClient: vslc.LanguageClient) {
    g_languageClient = newLanguageClient;
}
