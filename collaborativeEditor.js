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
        console.log('CollaborativeEditor: Constructor called');
    }

    async initialize() {
        console.log('CollaborativeEditor: Initialization started');

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
                serverUrl = `ws://localhost:8080`;
            } else if (choice === options[1]) {
                serverUrl = await vscode.window.showInputBox({
                    placeHolder: 'Enter server URL (e.g., ws://192.168.1.5:8080)',
                    prompt: 'Enter the WebSocket server URL to connect to'
                });
                

                if (!serverUrl) {
                    vscode.window.showWarningMessage('No server URL provided. Collaboration disabled.');
                    return Promise.reject('No server URL provided');
                }
            } else {
                return Promise.reject('Operation cancelled');
            }

            await vscode.workspace.getConfiguration('collab-code').update('serverUrl', serverUrl, true);
        }

        return this.connectWebSocket(serverUrl);
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
        console.log('CollaborativeEditor: Setting up editor listeners');

        vscode.window.onDidChangeActiveTextEditor(editor => {
            console.log('CollaborativeEditor: Active editor changed');
            this.editor = editor;
            if (editor) {
                this.document = editor.document;
                this.registerCursorTracking(editor);
                vscode.window.showInformationMessage(`CollabCode: Collaboration mode activated as ${this.username}!`);
                this.updateStatusBar('Connected');
            }
        });

        this.editor = vscode.window.activeTextEditor;
        if (this.editor) {
            console.log('CollaborativeEditor: Initializing current editor');
            this.document = this.editor.document;
            this.registerCursorTracking(this.editor);
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
                        username: this.username
                    }));
                }
            }
        });
    }

    showLocalCursor(position) {
        if (!this.editor) return;

        const decorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: 'rgba(0, 255, 0, 0.2)',
            border: '2px solid green',
            after: {
                contentText: ` 👤 ${this.username} (you)`,
                color: '#00FF00',
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
        terminal.sendText('node server.js');
        terminal.show();

        const localIP = ip.address();
        vscode.window.showInformationMessage(`Server started. Share this address with collaborators: ws://${localIP}:8080`);
    }

    connectWebSocket(serverUrl) {
        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(serverUrl);

                this.ws.onopen = () => {
                    vscode.window.showInformationMessage(`CollabCode: Connected to ${serverUrl}`);
                    this.updateStatusBar(`Connected to ${serverUrl}`);

                    this.ws.send(JSON.stringify({
                        type: 'userInfo',
                        clientId: this.clientId,
                        username: this.username
                    }));

                    resolve();
                };

                this.ws.onerror = (error) => {
                    vscode.window.showErrorMessage(`CollabCode: WebSocket connection failed.`);
                    this.updateStatusBar('Connection failed');
                    reject(error);
                };

                this.ws.onmessage = (event) => {
                    this.handleMessage(event.data);
                };

                this.ws.onclose = () => {
                    vscode.window.showWarningMessage('CollabCode: WebSocket connection closed.');
                    this.updateStatusBar('Disconnected');
                };
            } catch (error) {
                vscode.window.showErrorMessage('CollabCode: WebSocket error.');
                this.updateStatusBar('Connection error');
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
                vscode.window.showInformationMessage(`${message.username || 'Someone'} says: ${message.text}`);
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
        if (!this.editor) return;

        const position = new vscode.Position(data.position.line, data.position.character);
        const username = data.username || `User${data.senderId.substr(0, 4)}`;

        const decorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: 'rgba(255, 0, 0, 0.2)',
            border: '2px solid red',
            after: {
                contentText: ` 👤 ${username}`,
                color: '#FF0000',
                margin: '0 0 0 20px',
                fontWeight: 'bold'
            },
            isWholeLine: true
        });

        if (this.cursorDecorations.has(data.senderId)) {
            this.cursorDecorations.get(data.senderId).dispose();
        }

        this.editor.setDecorations(decorationType, [new vscode.Range(position, position)]);
        this.cursorDecorations.set(data.senderId, decorationType);
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
                this.sendTextEdit(event);
            }
        });
    }
    
    
    applyRemoteEdit(edit) {
        if (!this.editor || !edit.range) return;
    
        const start = new vscode.Position(edit.range.start.line, edit.range.start.character);
        const end = new vscode.Position(edit.range.end.line, edit.range.end.character);
        const range = new vscode.Range(start, end);
    
        this.editor.edit(editBuilder => {
            editBuilder.replace(range, edit.text);
        });
    }
    
    

    updateStatusBar(status) {
        this.statusBarItem.text = `$(sync) CollabCode: ${status}`;
        this.statusBarItem.tooltip = 'Collaborative editing mode activated';
        this.statusBarItem.show();
    }

    dispose() {
        if (this.ws) this.ws.close();
        this.cursorDecorations.forEach(decoration => decoration.dispose());
        this.statusBarItem.dispose();
    }
}

module.exports = CollaborativeEditor;
