const vscode = require('vscode');
const path = require('path');
const fs = require("fs");
const parse = require('@babel/parser').parse;
const generate = require('@babel/generator').default;
const template = require('@babel/template').default;
const traverse = require('@babel/traverse').default;
const t = require('@babel/types');
const child_process = require('child_process');
const process = require('process');


const fileName = 'main.js';
const backUpFileName = 'main.origin.js';
const patchFileName = 'main.patch.js';

let BASE_PATH = '';
let step = 0;


function getVSCodePath() {
	const app = path.dirname(require.main.filename);
	BASE_PATH = path.join(app, "vs", "code", 'electron-main');
}

// backup
async function backup() {
	const unWritable = await fs.promises.access(path.resolve(BASE_PATH, fileName), fs.constants.W_OK).catch(() => true);
	if (unWritable) {
		vscode.window.showErrorMessage('VS Code can not modify itself.');
		return false;
	}
	const notBackup = await fs.promises.access(path.resolve(BASE_PATH, backUpFileName), fs.constants.F_OK).catch(e => {
		console.log('backup file not exist', e);
		return true;
	});
	if (notBackup) {
		await fs.promises.copyFile(path.resolve(BASE_PATH, fileName), path.resolve(BASE_PATH, backUpFileName));
	}
	return true;
}

// TODO
function restore() {

}



async function patch() {
	vscode.window.showInformationMessage('remove security warning patch starts. It will take some time.')
	step = 0;
	const status = await backup();
	if (!status) {
		return;
	}
	const data = await fs.promises.readFile(path.resolve(BASE_PATH, backUpFileName), 'utf8')
	const ast = parse(data, {
		plugins: [
			"classStaticBlock",
		],
	});
	transformer(ast);
	if (step !== 1) {
		vscode.window.showErrorMessage('security warning patch failed!!');
		return;
	}
	const { code } = generate(ast, {
		compact: true,
		concise: true,
		minified: true,
	});
	output(code);
}

async function output(data) {
	await fs.promises.writeFile(path.join(BASE_PATH, fileName), data).then(e => {
		vscode.window.showInformationMessage('security warning patch successed! Restart to take effect.', { title: 'Restart VS Code' })
			.then(() => {
				const vscodeExecutablePath = process.argv[0]; // Path to the currently running VS Code executable
				child_process.spawn(vscodeExecutablePath, { detached: true, stdio: 'ignore' }).unref();
				vscode.commands.executeCommand('workbench.action.quit');

				// vscode.commands.executeCommand("update.restart")
				// vscode.commands.executeCommand("workbench.action.closeWindow")
				// this.hostService.restart();
				// vscode.commands.executeCommand("workbench.action.reloadWindow")

			});
	}).catch((e) => {
		console.error(e)
		vscode.window.showWarningMessage('security warning patch failed!');
	})

}

function transformer(ast) {
	traverse(ast, {
		ClassMethod: function (path) {
			// src/vs/code/electron-main/app.ts
			if (path.toString().includes('showMessageBoxSync')) {
				const [ifStatement, returnStatement] = path?.node?.body?.body || [];
				if (ifStatement?.type === 'IfStatement' && returnStatement?.type === 'ReturnStatement') {
					const body = template.ast`return!1`;
					path.node.body = t.blockStatement([body])
					path.skip();
					step++;
				}
			}
		},
	});
}


/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	getVSCodePath();

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with  registerCommand
	// The commandId parameter must match the command field in package.json
	const patchInstall = vscode.commands.registerCommand('security-warning.patch', patch);
	context.subscriptions.push(patchInstall);
}

function deactivate() { }

module.exports = {
	activate,
	deactivate
}
