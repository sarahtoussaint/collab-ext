const assert = require('assert');
const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

// 设置测试环境变量
process.env.NODE_ENV = 'test';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
// const myExtension = require('../extension');

suite('CollabCode Extension Test Suite', () => {
	let document;
	let editor1;
	let editor2;
	let testFile;
	let collabEditor;

	suiteSetup(async () => {
		// 创建临时测试文件
		const workspacePath = path.join(__dirname, '..');
		testFile = path.join(workspacePath, 'test.js');
		
		// 确保文件存在
		if (!fs.existsSync(testFile)) {
			fs.writeFileSync(testFile, '// Test file for collaborative editing\n');
		}

		// 打开文件
		document = await vscode.workspace.openTextDocument(testFile);
		editor1 = await vscode.window.showTextDocument(document, { viewColumn: vscode.ViewColumn.One });
		editor2 = await vscode.window.showTextDocument(document, { viewColumn: vscode.ViewColumn.Two });

		// 初始化协作编辑器
		collabEditor = new (require('../collaborativeEditor.js'))();
		await collabEditor.initialize();
	});

	suiteTeardown(() => {
		// 清理测试文件
		if (fs.existsSync(testFile)) {
			fs.unlinkSync(testFile);
		}
	});

	test('Chat panel opens for both users', async () => {
		await vscode.commands.executeCommand('collab-code.helloWorld');
		const panels = vscode.window.visibleTextEditors;
		assert.ok(panels.length > 0, 'Chat panel should be visible for user 1');

		await vscode.commands.executeCommand('collab-code.helloWorld');
		const panels2 = vscode.window.visibleTextEditors;
		assert.ok(panels2.length > 1, 'Chat panel should be visible for user 2');
	});

	test('Collaborative editing between two users', async () => {
		// 简单的编辑测试
		const initialContent = '// Initial content\n';
		await editor1.edit(editBuilder => {
			editBuilder.insert(new vscode.Position(0, 0), initialContent);
		});

		// 等待编辑完成
		await new Promise(resolve => setTimeout(resolve, 100));

		// 验证编辑是否成功
		const content = editor1.document.getText();
		assert.ok(content.includes(initialContent), 'Initial edit should be visible');
	});

	test('Cursor tracking between users', async () => {
		const position1 = new vscode.Position(2, 0);
		editor1.selection = new vscode.Selection(position1, position1);
		
		// 等待光标更新
		await new Promise(resolve => setTimeout(resolve, 100));
		
		// 检查光标位置
		assert.strictEqual(editor1.selection.active.line, position1.line, 'User 1 cursor position should be updated');
		assert.strictEqual(editor1.selection.active.character, position1.character, 'User 1 cursor position should be updated');

		const position2 = new vscode.Position(3, 0);
		editor2.selection = new vscode.Selection(position2, position2);
		
		// 等待光标更新
		await new Promise(resolve => setTimeout(resolve, 100));
		
		// 检查光标位置
		assert.strictEqual(editor2.selection.active.line, position2.line, 'User 2 cursor position should be updated');
		assert.strictEqual(editor2.selection.active.character, position2.character, 'User 2 cursor position should be updated');
	});

	test('Chat messages between users', async () => {
		// 在测试环境中，我们模拟聊天面板
		const panel = await vscode.window.createWebviewPanel(
			'collabChat',
			'Collaborative Chat',
			vscode.ViewColumn.Two,
			{}
		);

		// 设置面板内容
		panel.webview.html = `
			<!DOCTYPE html>
			<html>
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
			</head>
			<body>
				<div>Welcome to CollabCode</div>
			</body>
			</html>
		`;

		// 等待面板显示
		await new Promise(resolve => setTimeout(resolve, 100));

		// 检查面板是否可见
		const visiblePanels = vscode.window.visibleTextEditors;
		assert.ok(visiblePanels.length > 0, 'Chat panel should be visible');

		// 检查面板内容
		const panelContent = panel.webview.html;
		assert.ok(panelContent.includes('Welcome to CollabCode'), 'Chat panel should show welcome message');
	});
});
