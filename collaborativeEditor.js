const vscode = require('vscode');

class CollaborativeEditor {
    constructor() {
        this.editor = null;
        this.document = null;
        this.socket = null;
        this.isTestEnvironment = false;
        this.ws = null;
        this.clientId = Math.random().toString(36).substr(2, 9);
        this.username = `用户${this.clientId.substr(0, 4)}`;
        this.cursorDecorations = new Map();
        this.activeUsers = new Map();
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        console.log('CollaborativeEditor: 构造函数被调用');
        this.setupEditorListeners();
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
                
                // 显示本地光标
                this.showLocalCursor(position);
                
                // 发送光标位置到服务器
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
        
        // 为本地用户创建装饰类型
        const decorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: 'rgba(0, 255, 0, 0.2)', // 使用绿色区分本地用户
            border: '2px solid green',
            after: {
                contentText: ` 👤 ${this.username} (你)`,
                color: '#00FF00',
                margin: '0 0 0 20px',
                fontWeight: 'bold'
            },
            isWholeLine: true
        });

        // 清除本地用户之前的光标
        if (this.cursorDecorations.has('local')) {
            this.cursorDecorations.get('local').dispose();
        }

        // 应用新的光标装饰
        this.editor.setDecorations(decorationType, [new vscode.Range(position, position)]);
        this.cursorDecorations.set('local', decorationType);
    }

    initialize() {
        console.log('CollaborativeEditor: 初始化开始');
        return this.connectWebSocket();
    }

    connectWebSocket() {
        console.log('CollaborativeEditor: 尝试连接WebSocket');
        return new Promise((resolve, reject) => {
            try {
                console.log('CollaborativeEditor: 创建WebSocket连接...');
                this.ws = new WebSocket('ws://localhost:8080');
                
                this.ws.onopen = () => {
                    console.log('CollaborativeEditor: WebSocket连接成功！');
                    vscode.window.showInformationMessage('CollabCode: WebSocket连接成功！');
                    this.updateStatusBar('已连接到服务器');
                    
                    // 发送初始用户信息
                    this.ws.send(JSON.stringify({
                        type: 'userInfo',
                        clientId: this.clientId,
                        username: this.username
                    }));
                    
                    resolve();
                };

                this.ws.onerror = (error) => {
                    console.error('CollaborativeEditor: WebSocket错误:', error);
                    vscode.window.showErrorMessage('CollabCode: WebSocket连接失败！');
                    this.updateStatusBar('连接失败');
                    reject(error);
                };

                this.ws.onmessage = (event) => {
                    console.log('CollaborativeEditor: 收到消息:', event.data);
                    this.handleMessage(JSON.parse(event.data));
                };

                this.ws.onclose = () => {
                    console.log('CollaborativeEditor: WebSocket连接关闭');
                    vscode.window.showWarningMessage('CollabCode: WebSocket连接已关闭');
                    this.updateStatusBar('未连接');
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
        console.log('处理收到的消息:', data);
        if (data.senderId === this.clientId) {
            return; // 忽略自己发送的消息
        }

        switch (data.type) {
            case 'cursor':
                this.showRemoteCursor(data);
                break;
            case 'edit':
                this.applyRemoteEdit(data);
                break;
            case 'userCount':
                this.updateStatusBar(`在线用户: ${data.count}`);
                break;
        }
    }

    showRemoteCursor(data) {
        if (!this.editor) return;
        
        const position = new vscode.Position(data.position.line, data.position.character);
        const username = data.username || `用户${data.senderId.substr(0, 4)}`;
        
        // 为远程用户创建独特的装饰类型
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

        // 清除该用户之前的光标
        if (this.cursorDecorations.has(data.senderId)) {
            this.cursorDecorations.get(data.senderId).dispose();
        }

        // 应用新的光标装饰
        this.editor.setDecorations(decorationType, [new vscode.Range(position, position)]);
        this.cursorDecorations.set(data.senderId, decorationType);
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
        if (this.ws) {
            this.ws.close();
        }
        this.cursorDecorations.forEach(decoration => decoration.dispose());
        this.statusBarItem.dispose();
    }
}

module.exports = CollaborativeEditor; 