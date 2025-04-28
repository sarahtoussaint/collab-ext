const vscode = require('vscode');
const { CollabNotesViewProvider } = require('./collabNotesView');

function activate(context) {
	console.log('🟢 Collab Code Extension Activated!');

  const provider = new CollabNotesViewProvider(context.extensionUri);
  console.log('🛠 Registering Webview View Provider...');

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      'collabNotes.sidebarView',
      provider
    )
  );
  
  let disposable = vscode.commands.registerCommand('collab-code.takeNotes', function () {
	vscode.window.showInformationMessage('Taking notes...');
  });
  
  context.subscriptions.push(disposable);
}

//exports.activate = activate;

function deactivate() {}

module.exports = {
  activate,
  deactivate
};