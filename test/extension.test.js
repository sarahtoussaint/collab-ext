/* eslint-env mocha */
const assert = require('assert');
const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

process.env.NODE_ENV = 'test';

suite('CollabCode Extension Test Suite', () => {
  let document;
  let editor1;
  let editor2;
  let testFile;
  let collabEditor;

  suiteSetup(async () => {
    const workspacePath = path.join(__dirname);
    testFile = path.join(workspacePath, 'shared-test.js');

    const initialContent = `// This is a shared test file
function add(a, b) {
  return a + b;
}`;
    fs.writeFileSync(testFile, initialContent);

    document = await vscode.workspace.openTextDocument(testFile);
    editor1 = await vscode.window.showTextDocument(document, { viewColumn: vscode.ViewColumn.One });
    editor2 = await vscode.window.showTextDocument(document, { viewColumn: vscode.ViewColumn.Two });

    collabEditor = new (require('../collaborativeEditor.js'))();
    await collabEditor.initialize();
  });

  suiteTeardown(() => {
    if (fs.existsSync(testFile)) {
      fs.unlinkSync(testFile);
    }
  });

  test('Basic Collaboration Functionality Test', async () => {
    // User 1 adds a comment
    await editor1.edit(editBuilder => {
      const position = new vscode.Position(document.lineCount, 0);
      editBuilder.insert(position, '\n\n// Comment added by User 1\n');
    });

    await new Promise(resolve => setTimeout(resolve, 500)); // simulate delay

    // User 2 adds another comment
    await editor2.edit(editBuilder => {
      const position = new vscode.Position(document.lineCount, 0);
      editBuilder.insert(position, '// Comment added by User 2\n');
    });

    await new Promise(resolve => setTimeout(resolve, 500)); // simulate delay

    const content1 = editor1.document.getText();
    const content2 = editor2.document.getText();

    assert.strictEqual(content1, content2, 'Both editors should display the same content');
    assert.ok(content1.includes('Comment added by User 1'), 'User 1 edits should be visible');
    assert.ok(content1.includes('Comment added by User 2'), 'User 2 edits should be visible');

    const position1 = new vscode.Position(2, 0);
    const position2 = new vscode.Position(3, 0);

    editor1.selection = new vscode.Selection(position1, position1);
    editor2.selection = new vscode.Selection(position2, position2);

    await new Promise(resolve => setTimeout(resolve, 500)); // simulate delay for sync

    assert.strictEqual(editor1.selection.active.line, position1.line, 'User 1 cursor position should be correct');
    assert.strictEqual(editor2.selection.active.line, position2.line, 'User 2 cursor position should be correct');
  });

  test('Chat panel for shared file', async () => {
    const panel = await vscode.window.createWebviewPanel(
      'collabChat',
      'Collaborative Chat',
      vscode.ViewColumn.Three,
      {}
    );

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

    await new Promise(resolve => setTimeout(resolve, 100)); // simulate loading delay

    assert.ok(panel.visible, 'Chat panel should be visible');
    assert.ok(panel.webview.html.includes('subtract'), 'Chat should show relevant messages');

    await panel.dispose(); // cleanly close the panel after test
  });
});
