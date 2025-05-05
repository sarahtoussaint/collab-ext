const vscode = require('vscode');
const WebSocket = require('ws');
const ip = require('ip');

class CollaborativeEditor {
    constructor() {
        this.editor = null;
        this.document = null;
        this.socket = null;
        this.isTestEnvironment = false;
        this.ws = null;
        this.clientId = Math.random().toString(36).substr(2, 9);
        this.cursorDecorations = new Map();
        this.activeUsers = new Map();
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this.userColors = new Map();
        this.assignedColors = new Set();
        this.chatPanel = null;

        this.colorPool = [
            "#FF5733",
            "#33FF57",
            "#40E0D0",
            "#FF33A8",
            "#FFD133",
            "#33FFF0",
            "#FF8F33",
            "#C733FF",
            "#33FF95",
            "#FF3333"
        ];
        this.suppressBroadcast = false;
        console.log('CollaborativeEditor: Constructor called');
    }

    async initialize() {
        console.log('CollaborativeEditor: Initialization started');

        try {
            await this.askForUsername();
            this.setupEditorListeners();
            this.registerTextEditTracking();

            const config = vscode.workspace.getConfiguration('collab-code');
            let serverUrl = config.get('serverUrl');

            if (!serverUrl) {
                const options = ['Start a new server', 'Connect to existing server'];
                const choice = await vscode.window.showQuickPick(options, {
                    placeHolder: 'Choose collaboration mode'
                });

                if (choice === options[0]) {
                    this.startLocalServer();
                    const ip = require('ip');
                    const localIP = ip.address();
                    serverUrl = `ws://${localIP}:8080`;
                } else if (choice === options[1]) {
                    serverUrl = await vscode.window.showInputBox({
                        placeHolder: 'Enter server URL (e.g., ws://192.168.1.5:8080)',
                        prompt: 'Enter the WebSocket server URL to connect to'
                    });

                    if (!serverUrl) {
                        throw new Error('No server URL provided');
                    }
                } else {
                    throw new Error('Operation cancelled');
                }

                await vscode.workspace.getConfiguration('collab-code').update('serverUrl', serverUrl, true);
            }

            console.log('Attempting to connect to:', serverUrl);
            await this.connectWebSocket(serverUrl);
            return Promise.resolve();
        } catch (error) {
            console.error('Initialization error:', error);
            vscode.window.showErrorMessage(`CollabCode: ${error.message}`);
            return Promise.reject(error);
        }
    }

    async askForUsername() {
        const name = await vscode.window.showInputBox({
            prompt: 'Enter your display name',
            placeHolder: 'e.g., Sarah, Lily, Alex',
            validateInput: (text) => text.length === 0 ? 'Name cannot be empty!' : null
        });

        if (name) {
            this.username = name.trim();
        } else {
            this.username = `User${this.clientId.substr(0, 4)}`;
        }
    }

    setupEditorListeners() {
        vscode.window.onDidChangeActiveTextEditor(editor => {
          // Ignore panels/webviews: only track file-system editors
          if (!editor || editor.document.uri.scheme !== 'file') {
            return;
          }
          this.editor   = editor;
          this.document = editor.document;    // now always points at your code file
          this.fileUri  = editor.document.uri; // stash the URI for matching later
          this.registerCursorTracking(editor);
      
          vscode.window.showInformationMessage(
            `CollabCode: Collaboration activated as ${this.username}`
          );
          this.updateStatusBar('Connected');
        });
      
        // Initialize if you already had a file open on activation
        const init = vscode.window.activeTextEditor;
        if (init && init.document.uri.scheme === 'file') {
          this.editor   = init;
          this.document = init.document;
          this.fileUri  = init.document.uri;
          this.registerCursorTracking(init);
        }
      }

    registerCursorTracking(editor) {
        console.log('CollaborativeEditor: Registering cursor tracking');
        vscode.window.onDidChangeTextEditorSelection(event => {
            if (event.textEditor === editor) {
                const position = event.selections[0].active;
                this.showLocalCursor(position);

                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                    this.ws.send(JSON.stringify({
                        type: 'cursor',
                        position: {
                            line: position.line,
                            character: position.character
                        },
                        username: this.username,
                        senderId: this.clientId
                    }));
                }
            }
        });
    }

    getUserColor(usernameOrId) {
        if (!this.userColors.has(usernameOrId)) {
            const availableColors = this.colorPool.filter(c => !this.assignedColors.has(c));
            const color = availableColors.length > 0
                ? availableColors[Math.floor(Math.random() * availableColors.length)]
                : "#FFFFFF";
    
            this.userColors.set(usernameOrId, color);
            this.assignedColors.add(color);
        }
        return this.userColors.get(usernameOrId);
    }
    
    showLocalCursor(position) {
        if (!this.editor) return;
    
        const color = this.getUserColor(this.clientId);
    
        const decorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: `${color}33`,
            border: `2px solid ${color}`,
            after: {
                contentText: ` 👤 ${this.username} (you)`,
                color: color,
                margin: '0 0 0 20px',
                fontWeight: 'bold'
            },
            isWholeLine: true
        });
    
        if (this.cursorDecorations.has('local')) {
            this.cursorDecorations.get('local').dispose();
        }
    
        this.editor.setDecorations(decorationType, [new vscode.Range(position, position)]);
        this.cursorDecorations.set('local', decorationType);
    }

    startLocalServer() {
        const terminal = vscode.window.createTerminal('CollabCode Server');
        
        if (process.platform === 'win32') {
            terminal.sendText('FOR /F "tokens=5" %P IN (\'netstat -ano ^| findstr :8080\') DO TaskKill /PID %P /F >nul 2>&1');
        } else {
            terminal.sendText('lsof -ti:8080 | xargs kill -9');
        }

        terminal.sendText('node server.js');
        terminal.show();
    }

    connectWebSocket(serverUrl) {
        return new Promise((resolve, reject) => {
            try {
                console.log('Attempting to connect to:', serverUrl);
                this.ws = new WebSocket(serverUrl);
    
                const timeout = setTimeout(() => {
                    if (this.ws.readyState !== WebSocket.OPEN) {
                        this.ws.close();
                        reject(new Error('Connection timeout after 15 seconds'));
                    }
                }, 15000);
    
                this.ws.onopen = () => {
                    clearTimeout(timeout);
                    console.log('WebSocket connection established');
                    vscode.window.showInformationMessage(`Connected to ${serverUrl}`);
                    this.updateStatusBar('Connected');
    
                    // send initial userInfo payload
                    this.ws.send(JSON.stringify({
                        type: 'userInfo',
                        clientId: this.clientId,
                        username: this.username
                    }));
    
                    // **CRUCIAL LINE**: bind incoming messages to your handler
                    this.ws.onmessage = event => this.handleMessage(event.data);
    
                    resolve();
                };
    
                this.ws.onerror = (error) => {
                    clearTimeout(timeout);
                    console.error('WebSocket error:', error);
                    this.updateStatusBar('Connection failed');
                    reject(error);
                };
    
                this.ws.onclose = () => {
                    console.log('WebSocket connection closed');
                    this.updateStatusBar('Disconnected');
                };
            } catch (error) {
                reject(error);
            }
        });
    }

    handleMessage(data) {
        const message = typeof data === 'string' ? JSON.parse(data) : data;

        if (message.senderId === this.clientId) return;

        switch (message.type) {
            case 'cursor':
                this.showRemoteCursor(message);
                break;
            case 'edit':
                this.applyRemoteEdit(message);
                break;
            case 'chat':
                if (this.chatPanel && this.chatPanel.webview) {
                    this.chatPanel.webview.postMessage({
                        type: 'chatMessage',
                        username: message.username,
                        text: message.text,
                        time: new Date(message.timestamp).toLocaleTimeString()
                    });
                }
                break;
            case 'reaction':
                if (this.chatPanel && this.chatPanel.webview) {
                    this.chatPanel.webview.postMessage({
                        type: 'reaction',
                        messageId: message.messageId,
                        reaction: message.reaction,
                        username: message.username
                    });
                }
                break;
            case 'userCount':
                this.updateStatusBar(`Online users: ${message.count}`);
                break;
            case 'userLeft':
                this.removeUserCursor(message.senderId); 
                break;
        }
    }

    showRemoteCursor(data) {
        // 1) Find the code‐file editor by matching fsPath
        const editor = vscode.window.visibleTextEditors.find(ed =>
          ed.document.uri.fsPath === this.fileUri.fsPath
        );
        if (!editor) {
          console.warn('No matching editor for remote cursor; looking for:', this.fileUri.fsPath);
          vscode.window.visibleTextEditors.forEach(ed =>
            console.log(' • visible:', ed.document.uri.fsPath)
          );
          return;
        }
      
        // 2) Build the decoration
        const pos      = new vscode.Position(data.position.line, data.position.character);
        const who      = data.username || `User${data.senderId.substr(0,4)}`;
        const color    = this.getUserColor(data.senderId);
        const decoType = vscode.window.createTextEditorDecorationType({
          backgroundColor: `${color}33`,
          border:           `2px solid ${color}`,
          after: {
            contentText: ` 👤 ${who}`,
            color,
            margin: '0 0 0 20px',
            fontWeight: 'bold'
          },
          isWholeLine: true
        });
      
        // 3) Dispose any previous decoration for that user
        const old = this.cursorDecorations.get(data.senderId);
        if (old) {
          old.dispose();
        }
      
        // 4) Apply to the correct editor
        editor.setDecorations(decoType, [ new vscode.Range(pos, pos) ]);
        this.cursorDecorations.set(data.senderId, decoType);
      
        console.log(`Painted remote cursor for ${who} at ${pos.line}:${pos.character}`);
      }

    removeUserCursor(senderId) {
        const decoration = this.cursorDecorations.get(senderId);
        if (decoration) {
            decoration.dispose();
            this.cursorDecorations.delete(senderId);
        }
        this.activeUsers.delete(senderId);
    }
    
    sendTextEdit(event) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            for (const change of event.contentChanges) {
                const editPayload = {
                    type: 'edit',
                    text: change.text,
                    range: {
                        start: {
                            line: change.range.start.line,
                            character: change.range.start.character
                        },
                        end: {
                            line: change.range.end.line,
                            character: change.range.end.character
                        }
                    },
                    senderId: this.clientId
                };
                this.ws.send(JSON.stringify(editPayload));
            }
        }
    }
    
    
    registerTextEditTracking() {
        vscode.workspace.onDidChangeTextDocument((event) => {
            if (event.document === vscode.window.activeTextEditor?.document) {
                if (this.suppressBroadcast) return;
                this.sendTextEdit(event);
            }
        });
    }
    
    
    
    applyRemoteEdit(edit) {
        if (!this.editor || !edit.range) return;
    
        const start = new vscode.Position(edit.range.start.line, edit.range.start.character);
        const end = new vscode.Position(edit.range.end.line, edit.range.end.character);
        const range = new vscode.Range(start, end);
    
        this.suppressBroadcast = true;
        this.editor.edit(editBuilder => {
            editBuilder.replace(range, edit.text);
        }).then(() => {
            this.suppressBroadcast = false;
        });
    }
    
    
    

    updateStatusBar(status) {
        this.statusBarItem.text = `$(sync) CollabCode: ${status}`;
        this.statusBarItem.tooltip = 'Collaborative editing mode activated';
        this.statusBarItem.show();
    }

    sendReaction(messageId, reaction) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'reaction',
                messageId: messageId,
                reaction: reaction,
                username: this.username
            }));
        }
    }

    dispose() {
        if (this.ws) this.ws.close();
        this.cursorDecorations.forEach(decoration => decoration.dispose());
        this.statusBarItem.dispose();
    }
}

module.exports = CollaborativeEditor;