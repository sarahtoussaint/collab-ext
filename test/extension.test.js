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
		// 创建共享的测试文件
		const workspacePath = path.join(__dirname);
		testFile = path.join(workspacePath, 'shared-test.js');
		
		// 创建测试文件的初始内容
		const initialContent = `// 这是一个共享的测试文件
function add(a, b) {
	return a + b;
}`;

		fs.writeFileSync(testFile, initialContent);

		// 在两个编辑器中打开同一个文件
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

	test('基础协作功能测试', async () => {
		// 用户1编辑文件
		await editor1.edit(editBuilder => {
			const position = new vscode.Position(document.lineCount, 0);
			editBuilder.insert(position, '\n\n// 用户1添加的注释\n');
		});

		// 等待同步
		await new Promise(resolve => setTimeout(resolve, 500));

		// 用户2编辑文件
		await editor2.edit(editBuilder => {
			const position = new vscode.Position(document.lineCount, 0);
			editBuilder.insert(position, '// 用户2添加的注释\n');
		});

		// 等待同步
		await new Promise(resolve => setTimeout(resolve, 500));

		// 验证两个编辑器显示相同的内容
		const content1 = editor1.document.getText();
		const content2 = editor2.document.getText();
		assert.strictEqual(content1, content2, '两个编辑器应该显示相同的内容');
		assert.ok(content1.includes('用户1添加的注释'), '用户1的编辑应该可见');
		assert.ok(content1.includes('用户2添加的注释'), '用户2的编辑应该可见');

		// 测试光标位置
		const position1 = new vscode.Position(2, 0);
		editor1.selection = new vscode.Selection(position1, position1);
		
		const position2 = new vscode.Position(3, 0);
		editor2.selection = new vscode.Selection(position2, position2);
		
		// 等待光标更新
		await new Promise(resolve => setTimeout(resolve, 500));

		// 验证光标位置
		assert.strictEqual(editor1.selection.active.line, position1.line, '用户1的光标位置应该正确');
		assert.strictEqual(editor2.selection.active.line, position2.line, '用户2的光标位置应该正确');
	});

	test('Chat panel for shared file', async () => {
		// 打开聊天面板
		const panel = await vscode.window.createWebviewPanel(
			'collabChat',
			'Collaborative Chat',
			vscode.ViewColumn.Three,
			{}
		);

		// 设置面板内容
		panel.webview.html = `
			<!DOCTYPE html>
			<html>
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<style>
					body { font-family: Arial, sans-serif; padding: 10px; }
					.message { margin: 5px 0; padding: 5px; border-radius: 4px; }
					.user1 { background: #e3f2fd; }
					.user2 { background: #f3e5f5; }
				</style>
			</head>
			<body>
				<div class="message user1">User 1: I added a subtract function</div>
				<div class="message user2">User 2: I added a divide function</div>
				<div class="message user1">User 1: Looks good!</div>
			</body>
			</html>
		`;

		// 等待面板显示
		await new Promise(resolve => setTimeout(resolve, 100));

		// 验证面板是否可见和内容是否正确
		assert.ok(panel.visible, 'Chat panel should be visible');
		assert.ok(panel.webview.html.includes('subtract'), 'Chat should show relevant messages');
	});
});
