const vscode = require('vscode');

class CollabNotesViewProvider {
  /**
   * @param {vscode.Uri} extensionUri
   */
  constructor(extensionUri) {
    this._extensionUri = extensionUri;
    /** @type {vscode.WebviewView} */
    this._view = undefined;
  }

  /**
   * @param {vscode.WebviewView} webviewView
   */
  resolveWebviewView(webviewView) {
    this._view = webviewView;

    const webview = webviewView.webview;
    webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, 'media')]
    };

    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'app.js')
    );

    webview.html = this._getHtml(scriptUri);

    webview.onDidReceiveMessage(async (message) => {
      const workspace = vscode.workspace.workspaceFolders?.[0];
      if (!workspace) return;

      const fileUri = vscode.Uri.joinPath(workspace.uri, '.vscode', 'collabnotes.json');
      const data = JSON.stringify(message, null, 2);

      await vscode.workspace.fs.writeFile(fileUri, Buffer.from(data, 'utf8'));
    });

    this._loadData();
  }

  async _loadData() {
    const workspace = vscode.workspace.workspaceFolders?.[0];
    if (!workspace || !this._view) return;

    const fileUri = vscode.Uri.joinPath(workspace.uri, '.vscode', 'collabnotes.json');

    try {
      const data = await vscode.workspace.fs.readFile(fileUri);
      this._view.webview.postMessage(JSON.parse(data.toString()));
    } catch (err) {
      console.error('No existing collabnotes.json, or error reading:', err.message);
    }
  }

  _getHtml(scriptUri) {
    return `
      <html>
        <head>
          <style>
            body {
              font-family: sans-serif;
              padding: 10px;
            }
            .done {
              text-decoration: line-through;
              opacity: 0.6;
            }
            ul {
              padding-left: 20px;
            }
            li {
              margin: 5px 0;
              cursor: pointer;
            }
            textarea {
              width: 100%;
              height: 100px;
            }
          </style>
        </head>
        <body>
          <h2>📝 Notes</h2>
          <textarea id="notes"></textarea>
  
          <h2>✅ To-Do</h2>
          <ul id="todos"></ul>
          <input id="newTodo" placeholder="Add a task..." />
          <button onclick="addTodo()">Add</button>
  
          <script src="${scriptUri}"></script>
        </body>
      </html>
    `;
  }
}

module.exports = { CollabNotesViewProvider };