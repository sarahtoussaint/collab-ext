const vscode = require('vscode');
const WebSocket = require('ws');

class CollaborativeEditor {
    constructor() {
        this.editor = null;
        this.document = null;
        this.socket = null;
        this.isTestEnvironment = false;
        this.ws = null;
        this.clientId = Math.random().toString(36).substr(2, 9);
        this.username = `User${this.clientId.substr(0, 4)}`;
        this.cursorDecorations = new Map();
        this.activeUsers = new Map();
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        console.log('CollaborativeEditor: Constructor called');
        this.setupEditorListeners();
    }

    setupEditorListeners() {
        console.log('CollaborativeEditor: Setting up editor listeners');
        vscode.window.onDidChangeActiveTextEditor(editor => {
            console.log('CollaborativeEditor: Active editor changed');
            this.editor = editor;
            if (editor) {
                this.document = editor.document;
                this.registerCursorTracking(editor);
                vscode.window.showInformationMessage('CollabCode: Collaboration mode activated!');
                this.updateStatusBar('Connected');
                console.log('CollaborativeEditor: Editor initialized');
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
        console.log('CollaborativeEditor: Register cursor tracking');
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

    initialize() {
        console.log('CollaborativeEditor: Initialization started');
        return this.connectWebSocket();
    }

    connectWebSocket() {
        console.log('CollaborativeEditor: Attempting to connect WebSocket');
        return new Promise((resolve, reject) => {
            try {
                console.log('CollaborativeEditor: Creating WebSocket connection...');
                this.ws = new WebSocket('ws://172.16.0.63:8080');
                
                this.ws.onopen = () => {
                    console.log('CollaborativeEditor: WebSocket connection successful!');
                    vscode.window.showInformationMessage('CollabCode: WebSocket connection successful!');
                    this.updateStatusBar('Connected to server');
                    
                    this.ws.send(JSON.stringify({
                        type: 'userInfo',
                        clientId: this.clientId,
                        username: this.username
                    }));
                    
                    resolve();
                };

                this.ws.onerror = (error) => {
                    console.error('CollaborativeEditor: WebSocket error:', error);
                    vscode.window.showErrorMessage('CollabCode: WebSocket connection failed!');
                    this.updateStatusBar('Connection failed');
                    reject(error);
                };

                this.ws.onmessage = (event) => {
                    console.log('CollaborativeEditor: Message received:', event.data);
                    this.handleMessage(event.data);
                };

                this.ws.onclose = () => {
                    console.log('CollaborativeEditor: WebSocket connection closed');
                    vscode.window.showWarningMessage('CollabCode: WebSocket connection closed');
                    this.updateStatusBar('Disconnected');
                };
            } catch (error) {
                console.error('CollaborativeEditor: Error connecting to WebSocket:', error);
                vscode.window.showErrorMessage('CollabCode: Error connecting to WebSocket!');
                this.updateStatusBar('Connection error');
                reject(error);
            }
        });
    }

    handleMessage(data) {
        console.log('Processing received message:', data);
        const message = typeof data === 'string' ? JSON.parse(data) : data;
        
        if (message.senderId === this.clientId) {
            return;
        }

        switch (message.type) {
            case 'cursor':
                this.showRemoteCursor(message);
                break;
            case 'edit':
                this.applyRemoteEdit(message);
                break;
            case 'userCount':
                this.updateStatusBar(`Online users: ${message.count}`);
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

    applyRemoteEdit(edit) {
        if (!this.editor) return;

        const position = new vscode.Position(edit.line, edit.character);
        const range = new vscode.Range(position, position);
        
        this.editor.edit(editBuilder => {
            editBuilder.insert(position, edit.text);
            vscode.window.showInformationMessage(`CollabCode: Edit received from other user`);
        });
    }

    sendEdit(edit) {
        if (this.isTestEnvironment) {
            console.log('Test environment: Edit skipped', edit);
            return;
        }

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'edit',
                ...edit
            }));
        }
    }

    sendCursorPosition(position) {
        if (this.isTestEnvironment) {
            console.log('Test environment: Cursor position update', {
                line: position.line,
                character: position.character
            });
            this.showRemoteCursor({
                position: position,
                username: 'Test User'
            });
            return;
        }

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'cursor',
                position: {
                    line: position.line,
                    character: position.character
                },
                username: this.username || 'Anonymous'
            }));
        }
    }

    sendChatMessage(text) {
        if (this.isTestEnvironment) {
            console.log('Test environment: Chat message skipped', text);
            return;
        }

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'chat',
                text: text
            }));
        }
    }

    registerTextEditTracking() {
        vscode.workspace.onDidChangeTextDocument((event) => {
            if (event.document === vscode.window.activeTextEditor?.document) {
                this.sendTextEdit(event);
            }
        });
    }

    sendTextEdit(event) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'edit',
                changes: event.contentChanges,
                documentVersion: event.document.version
            }));
        }
    }

    updateUserList(users) {
        this.activeUsers.clear();
        users.forEach(user => {
            this.activeUsers.set(user.id, user);
        });
        this.updateStatusBar();
    }

    updateCursorDecorations(positions) {
        this.cursorDecorations.forEach(decoration => decoration.dispose());
        this.cursorDecorations.clear();

        positions.forEach(position => {
            const user = this.activeUsers.get(position.id);
            if (user) {
                const decoration = this.createCursorDecoration(position, user.username);
                this.cursorDecorations.set(position.id, decoration);
            }
        });
    }

    createCursorDecoration(position, username) {
        const decorationType = vscode.window.createTextEditorDecorationType({
            after: {
                contentText: username,
                color: '#666666',
                margin: '0 0 0 1em'
            }
        });

        const range = new vscode.Range(
            new vscode.Position(position.line, position.character),
            new vscode.Position(position.line, position.character)
        );

        vscode.window.activeTextEditor?.setDecorations(decorationType, [range]);
        return decorationType;
    }

    updateStatusBar(status) {
        this.statusBarItem.text = `$(sync) CollabCode: ${status}`;
        this.statusBarItem.tooltip = 'Collaborative editing mode activated';
        this.statusBarItem.show();
    }

    dispose() {
        if (this.ws) {
            this.ws.close();
        }
        this.cursorDecorations.forEach(decoration => decoration.dispose());
        this.statusBarItem.dispose();
    }
}

module.exports = CollaborativeEditor;