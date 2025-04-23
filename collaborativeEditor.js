const vscode = require('vscode');

class CollaborativeEditor {
    constructor() {
        this.editor = vscode.window.activeTextEditor;
        this.document = this.editor?.document;
        this.socket = null;
        this.isTestEnvironment = process.env.NODE_ENV === 'test';
        this.ws = null;
        this.clientId = null;
        this.username = null;
        this.cursorDecorations = new Map();
        this.activeUsers = new Map();
    }

    initialize() {
        if (this.isTestEnvironment) {
            console.log('Running in test environment, skipping WebSocket connection');
            return Promise.resolve();
        }
        return this.connectWebSocket();
    }

    connectWebSocket() {
        return new Promise((resolve, reject) => {
            try {
                if (this.isTestEnvironment) {
                    console.log('Test environment: WebSocket connection skipped');
                    resolve();
                    return;
                }

                this.ws = new WebSocket('ws://localhost:8080');
                
                this.ws.onopen = () => {
                    console.log('WebSocket connected');
                    resolve();
                };

                this.ws.onerror = (error) => {
                    console.error('WebSocket error:', error);
                    reject(error);
                };

                this.ws.onmessage = (event) => {
                    this.handleMessage(event.data);
                };
            } catch (error) {
                console.error('Error connecting to WebSocket:', error);
                reject(error);
            }
        });
    }

    handleMessage(data) {
        try {
            const message = JSON.parse(data);
            switch (message.type) {
                case 'edit':
                    this.applyRemoteEdit(message);
                    break;
                case 'cursor':
                    this.updateRemoteCursor(message);
                    break;
                case 'chat':
                    this.displayChatMessage(message);
                    break;
            }
        } catch (error) {
            console.error('Error handling message:', error);
        }
    }

    applyRemoteEdit(edit) {
        if (!this.editor) return;

        const position = new vscode.Position(edit.line, edit.character);
        const range = new vscode.Range(position, position);
        
        this.editor.edit(editBuilder => {
            editBuilder.insert(position, edit.text);
        });
    }

    updateRemoteCursor(cursor) {
        if (!this.editor) return;

        const position = new vscode.Position(cursor.line, cursor.character);
        const decoration = vscode.window.createTextEditorDecorationType({
            backgroundColor: 'rgba(100, 100, 255, 0.3)',
            border: '1px solid blue'
        });

        this.editor.setDecorations(decoration, [new vscode.Range(position, position)]);
    }

    displayChatMessage(message) {
        if (!this.editor) return;

        const panel = vscode.window.createWebviewPanel(
            'collabChat',
            'Collaborative Chat',
            vscode.ViewColumn.Two,
            {}
        );

        panel.webview.html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body>
                <div>${message.text}</div>
            </body>
            </html>
        `;
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
            console.log('Test environment: Cursor position skipped', position);
            return;
        }

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'cursor',
                line: position.line,
                character: position.character
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

    registerCursorTracking() {
        vscode.window.onDidChangeTextEditorSelection((event) => {
            if (event.textEditor === vscode.window.activeTextEditor) {
                const position = event.selections[0].active;
                this.sendCursorPosition(position);
            }
        });
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

    updateStatusBar() {
        const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        statusBarItem.text = `👥 ${this.activeUsers.size} users online`;
        statusBarItem.show();
    }

    dispose() {
        this.ws?.close();
        this.cursorDecorations.forEach(decoration => decoration.dispose());
    }
}

module.exports = CollaborativeEditor; 