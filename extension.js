const vscode = require('vscode');
const CollaborativeEditor = require('./collaborativeEditor');
const { time } = require('console');

let collaborativeEditor;

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	console.log('Congratulations, your extension "collab-code" is now active!');

	const chatCommand = vscode.commands.registerCommand('collab-code.openChat', async function () {
		if (!collaborativeEditor) {
			collaborativeEditor = new CollaborativeEditor();
		}

		try {
			await collaborativeEditor.initialize(); 
		} catch (error) {
			console.error('Failed to initialize collaborative editor:', error);
			return;
		}

		const panel = vscode.window.createWebviewPanel(
			'collabChat',
			'CollabCode Chat',
			vscode.ViewColumn.Two,
			{
				enableScripts: true
			}
		);
		
		panel.webview.html = getWebviewContent();

		panel.webview.onDidReceiveMessage((msg) => {
			if (msg.type === 'ready') {
				panel.webview.postMessage({
					type: 'setUsername',
					username: collaborativeEditor.username
				});
			}
		});
	});

	const connectCommand = vscode.commands.registerCommand('collab-code.connect', async function () {
		const serverUrl = await vscode.window.showInputBox({
			placeHolder: 'Enter server URL (e.g., ws://192.168.1.5:8080)',
			prompt: 'Enter the WebSocket server URL to connect to'
		});
		
		if (serverUrl) {
			await vscode.workspace.getConfiguration('collab-code').update('serverUrl', serverUrl, true);
			if (collaborativeEditor) {
				collaborativeEditor.dispose();
			}
			collaborativeEditor = new CollaborativeEditor();
			collaborativeEditor.initialize().catch(error => {
				console.error('Failed to initialize collaborative editor:', error);
			});
		}
	});

	const startServerCommand = vscode.commands.registerCommand('collab-code.startServer', function () {
		const terminal = vscode.window.createTerminal('CollabCode Server');
		terminal.sendText('node server.js');
		terminal.show();
		
		const ip = require('ip');
		const localIP = ip.address();
		vscode.window.showInformationMessage(`Server started. Share this address with collaborators: ws://${localIP}:8080`);
	});

	const notesCommand = vscode.commands.registerCommand('collab-code.openNotes', async function () {
		const panel = vscode.window.createWebviewPanel(
			'collabNotes',
			'CollabCode Notes',
			vscode.ViewColumn.Two,
			{
				enableScripts: true
			}
		);
	
		panel.webview.html = getNotesWebviewContent();
	});
	context.subscriptions.push(notesCommand);
	
	vscode.window.onDidChangeTextEditorSelection(event => {
		if (collaborativeEditor && event.textEditor === vscode.window.activeTextEditor) {
			const position = event.selections[0].active;
			collaborativeEditor.sendCursorPosition(position);
		}
	});

	context.subscriptions.push(chatCommand, connectCommand, startServerCommand);
}

function getWebviewContent() {
	return `
		<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<style>
				:root {
					--background: #1e1e1e;
					--panel-bg: #252526;
					--border-color: #3c3c3c;
					--button-bg: #0e639c;
					--button-hover: #1177bb;
					--font-color: #d4d4d4;
					--input-bg: #3c3c3c;
				}

				body {
					margin: 0;
					padding: 16px;
					background-color: var(--background);
					font-family: 'Segoe UI', sans-serif;
					color: var(--font-color);
				}

				h3 {
					margin-bottom: 12px;
					color: #3794ff;
				}

				#chat {
					background-color: var(--panel-bg);
					border: 1px solid var(--border-color);
					border-radius: 8px;
					padding: 10px;
					height: 300px;
					overflow-y: auto;
					box-shadow: 0 2px 4px rgba(0,0,0,0.3);
					margin-bottom: 14px;
				}

				.message.user {
					display: flex;
					justify-content: flex-end;
					padding-right: 12px;
					margin-bottom: 12px;
				}

				.bubble {
					background-color: #2d2d2d;
					border-radius: 10px;
					padding: 10px;
					max-width: 75%;
					box-shadow: 0 2px 4px rgba(0,0,0,0.2);
				}

				.bubble-header {
					display: flex;
					justify-content: space-between;
					align-items: center;
					margin-bottom: 4px;
					color: #d4d4d4;
					font-size: 0.85em;
				}

				.bubble-user {
					font-weight: bold;
				}

				.bubble-time {
					font-size: 0.75em;
					color: gray;
					margin-left: 10px;
				}

				.bubble-text {
					font-size: 1em;
					margin-bottom: 6px;
					word-wrap: break-word;
					text-align: left;
				}

				.reactions {
					display: flex;
					justify-content: flex-end;
					gap: 10px;
					margin-top: 6px;
				}

				.reaction {
					cursor: pointer;
					font-size: 18px;
					user-select: none;
					padding: 4px 6px;
					border-radius: 5px;
					transition: transform 0.1s, background-color 0.2s;
				}

				.reaction:hover {
					transform: scale(1.2);
					background-color: #444;
				}

				input {
					width: 78%;
					padding: 8px;
					border-radius: 6px;
					border: 1px solid var(--border-color);
					background-color: var(--input-bg);
					color: white;
					outline: none;
				}

				input::placeholder {
					color: #888;
				}

				button {
					width: 20%;
					margin-left: 2%;
					padding: 8px;
					background-color: var(--button-bg);
					color: white;
					border: none;
					border-radius: 6px;
					cursor: pointer;
					font-weight: 500;
				}

				button:hover {
					background-color: var(--button-hover);
				}

				#input-row {
					display: flex;
					justify-content: space-between;
					align-items: center;
				}
				.date-divider {
  					text-align: center;
  					color: #999;
  					margin: 16px 0 8px;
  					font-size: 0.85em;
  					border-top: 1px solid #444;
  					padding-top: 6px;
				}

			</style>

			<script type="module">
				import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
				import { getDatabase, ref, push, onValue } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js";

				const firebaseConfig = {
					apiKey: "AIzaSyBysdPKO20O9NaAuqvr9XXXB2uBIqAFGxI",
					authDomain: "collabcode-chat.firebaseapp.com",
					databaseURL: "https://collabcode-chat-default-rtdb.firebaseio.com/",
					projectId: "collabcode-chat",
					storageBucket: "collabcode-chat.appspot.com",
					messagingSenderId: "822599985818",
					appId: "1:822599985818:web:36b865cb2f158809d4cd23"
				};

				const app = initializeApp(firebaseConfig);
				const database = getDatabase(app);
				const chatRef = ref(database, 'messages');

				let currentUsername = "Anonymous"; // default

				window.addEventListener('message', event => {
				const message = event.data;
				if (message.type === 'setUsername') {
					currentUsername = message.username || "Anonymous";
				}
			});
			
			// Notify extension that webview is ready
				window.addEventListener('load', () => {
				const vscode = acquireVsCodeApi();
				vscode.postMessage({ type: 'ready' });
			});


				window.sendMessage = function() {
					const input = document.getElementById('message');
					if (input.value.trim() !== '') {
						push(chatRef, {
							type: "chat",
							user: currentUsername,
							text: input.value,
							timestamp: new Date().toISOString()
						});
						input.value = '';
					}
				};
				

				import { remove } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js";
				remove(chatRef);

				onValue(chatRef, (snapshot) => {
					const chat = document.getElementById('chat');
					chat.innerHTML = '';
					const data = snapshot.val();
					for (let id in data) {
						const message = data[id];

						const msgDate = new Date(message.timestamp);
						const time = new Date(message.timestamp).toLocaleTimeString([], { 
							hour: '2-digit', 
							minute: '2-digit'
						});
				

						let messageHTML = '';
							
						if (message.type === "reaction") {
							const reactionHTML = \`
								<div class="message user">
									<div class="bubble">
										<div class="bubble-header">
											<span class="bubble-user">\${message.user}</span>
											<span class="bubble-time">${time}</span>
										</div>
										<div class="bubble-text">reacted with \${message.emoji}</div>
									</div>
								</div>
							\`;
							chat.innerHTML += reactionHTML;
						} else if (message.type === "chat") {
							const messageHTML = \`
								<div class="message user">
									<div class="bubble">
										<div class="bubble-header">
											<span class="bubble-user">\${message.user}</span>
											<span class="bubble-time">\${time}</span>
										</div>
										<div class="bubble-text">\${message.text}</div>
										<div class="reactions">
											<span class="reaction">👍</span>
											<span class="reaction">❤️</span>
											<span class="reaction">😂</span>
										</div>
									</div>
								</div>
							\`;
							chat.innerHTML += messageHTML;
						}
					}
					chat.scrollTop = chat.scrollHeight;
				});

				document.addEventListener('click', function (e) {
					if (e.target.classList.contains('reaction')) {
						const reactionEmoji = e.target.textContent;
						push(chatRef, {
							type: "reaction",
							user: currentUsername,
							emoji: reactionEmoji,
							timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
						});
					}
				});

			</script>

		</head>
		<body>
    		<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
        		<h3 style="margin: 0;">Live Chat 💬</h3>
    		</div>

    		<div id="chat"></div>

    		<div id="input-row">
        		<input id="message" placeholder="Say something..." />
        		<button onclick="sendMessage()">Send</button>
    		</div>
		</body>
		</html>

	`;
}

function getNotesWebviewContent() {
	return `
	<!DOCTYPE html>
	<html>
	<head>
		<meta charset="UTF-8">
		<title>Shared Notes</title>
		<style>
			body {
				font-family: Arial, sans-serif;
				background-color: #1e1e1e;
				color: #fff;
				padding: 16px;
			}
			textarea {
				width: 100%;
				height: 400px;
				background-color: #252526;
				color: #fff;
				border: 1px solid #3c3c3c;
				padding: 12px;
				font-size: 16px;
				border-radius: 8px;
			}
		</style>
	</head>
	<body>
		<h3>📒 Shared Notes</h3>
		<textarea id="notes" placeholder="Write shared notes here..."></textarea>

		<script type="module">
			import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
			import { getDatabase, ref, onValue, set } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js";

			const firebaseConfig = {
				apiKey: "AIzaSyBysdPKO20O9NaAuqvr9XXXB2uBIqAFGxI",
				authDomain: "collabcode-chat.firebaseapp.com",
				databaseURL: "https://collabcode-chat-default-rtdb.firebaseio.com/",
				projectId: "collabcode-chat",
				storageBucket: "collabcode-chat.appspot.com",
				messagingSenderId: "822599985818",
				appId: "1:822599985818:web:36b865cb2f158809d4cd23"
			};

			const app = initializeApp(firebaseConfig);
			const db = getDatabase(app);
			const notesRef = ref(db, 'sharedNotes');

			const textarea = document.getElementById('notes');

			// Sync updates
			onValue(notesRef, (snapshot) => {
				const val = snapshot.val();
				if (val !== null && val !== textarea.value) {
					textarea.value = val;
				}
			});

			textarea.addEventListener('input', () => {
				set(notesRef, textarea.value);
			});
		</script>
	</body>
	</html>
	`;
}


function deactivate() {
	if (collaborativeEditor) {
		collaborativeEditor.dispose();
	}
}

module.exports = {
	activate,
	deactivate
};
