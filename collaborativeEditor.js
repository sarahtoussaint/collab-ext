const vscode = require('vscode');

class CollaborativeEditor {
    constructor() {
        this.editor = null;
        this.document = null;
        this.socket = null;
        this.isTestEnvironment = true;
        this.ws = null;
        this.clientId = Math.random().toString(36).substr(2, 9);
        this.username = `测试用户${this.clientId.substr(0, 4)}`;
        this.cursorDecorations = new Map();
        this.activeUsers = new Map();
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        console.log('CollaborativeEditor: 构造函数被调用');
        this.setupEditorListeners();
        this.updateStatusBar('测试模式');
    }

    setupEditorListeners() {
        console.log('CollaborativeEditor: 设置编辑器监听器');
        // 监听活动编辑器变化
        vscode.window.onDidChangeActiveTextEditor(editor => {
            console.log('CollaborativeEditor: 活动编辑器改变');
            this.editor = editor;
            if (editor) {
                this.document = editor.document;
                this.registerCursorTracking(editor);
                // 显示插件已激活的提示
                vscode.window.showInformationMessage('CollabCode: 协作模式已激活！');
                this.updateStatusBar('已连接');
                console.log('CollaborativeEditor: 编辑器已初始化');
            }
        });

        // 初始化当前编辑器
        this.editor = vscode.window.activeTextEditor;
        if (this.editor) {
            console.log('CollaborativeEditor: 初始化当前编辑器');
            this.document = this.editor.document;
            this.registerCursorTracking(this.editor);
        }
    }

    registerCursorTracking(editor) {
        console.log('CollaborativeEditor: 注册光标追踪');
        vscode.window.onDidChangeTextEditorSelection(event => {
            if (event.textEditor === editor) {
                const position = event.selections[0].active;
                this.showCursor(position, this.username);
            }
        });
    }

    showCursor(position, username) {
        if (!this.editor) return;
        
        // 创建更显眼的光标装饰
        const decorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: 'rgba(255, 0, 0, 0.2)',
            border: '2px solid red',
            after: {
                contentText: ` 👤 ${username || this.username}`,
                color: '#FF0000',
                margin: '0 0 0 20px',
                fontWeight: 'bold'
            },
            isWholeLine: true
        });

        // 应用装饰
        const range = new vscode.Range(position, position);
        this.editor.setDecorations(decorationType, [range]);

        // 保存装饰类型以便后续更新或清除
        if (this.cursorDecorations.has(username)) {
            this.cursorDecorations.get(username).dispose();
        }
        this.cursorDecorations.set(username, decorationType);

        // 显示用户活动通知
        vscode.window.showInformationMessage(`CollabCode测试: ${username || this.username} 正在编辑文件`);
    }

    initialize() {
        console.log('CollaborativeEditor: 初始化开始');
        if (this.isTestEnvironment) {
            console.log('CollaborativeEditor: 测试环境，跳过WebSocket连接');
            return Promise.resolve();
        }
        return this.connectWebSocket();
    }

    connectWebSocket() {
        console.log('CollaborativeEditor: 尝试连接WebSocket');
        return new Promise((resolve, reject) => {
            try {
                if (this.isTestEnvironment) {
                    console.log('CollaborativeEditor: 测试环境，跳过WebSocket连接');
                    resolve();
                    return;
                }

                console.log('CollaborativeEditor: 创建WebSocket连接...');
                this.ws = new WebSocket('ws://localhost:8080');
                
                this.ws.onopen = () => {
                    console.log('CollaborativeEditor: WebSocket连接成功！');
                    vscode.window.showInformationMessage('CollabCode: WebSocket连接成功！');
                    this.updateStatusBar('已连接到服务器');
                    resolve();
                };

                this.ws.onerror = (error) => {
                    console.error('CollaborativeEditor: WebSocket错误:', error);
                    vscode.window.showErrorMessage('CollabCode: WebSocket连接失败！');
                    this.updateStatusBar('连接失败');
                    reject(error);
                };

                this.ws.onclose = () => {
                    console.log('CollaborativeEditor: WebSocket连接关闭');
                    vscode.window.showWarningMessage('CollabCode: WebSocket连接已关闭');
                    this.updateStatusBar('未连接');
                };

                this.ws.onmessage = (event) => {
                    console.log('CollaborativeEditor: 收到消息:', event.data);
                    this.handleMessage(event.data);
                };
            } catch (error) {
                console.error('CollaborativeEditor: 连接WebSocket时出错:', error);
                vscode.window.showErrorMessage('CollabCode: 连接WebSocket时出错！');
                this.updateStatusBar('连接错误');
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
            // 添加编辑提示
            vscode.window.showInformationMessage(`CollabCode: 收到来自其他用户的编辑`);
        });
    }

    updateRemoteCursor(cursor) {
        if (!this.editor) return;

        const position = new vscode.Position(cursor.line, cursor.character);
        this.showCursor(position, cursor.username || 'Remote User');
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
            console.log('Test environment: Cursor position update', {
                line: position.line,
                character: position.character
            });
            // 在测试环境中，直接显示光标
            this.showCursor(position, 'Test User');
            return;
        }

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'cursor',
                line: position.line,
                character: position.character,
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
        this.statusBarItem.tooltip = '协作编辑模式已激活';
        this.statusBarItem.show();
    }

    dispose() {
        this.ws?.close();
        this.cursorDecorations.forEach(decoration => decoration.dispose());
    }
}

module.exports = CollaborativeEditor; 