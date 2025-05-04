const vscode = require('vscode');
const CollaborativeEditor = require('./collaborativeEditor');
const { time } = require('console');
const WebSocket = require('ws');

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
			vscode.window.showErrorMessage('Failed to connect to chat server. Please make sure the server is running.');
			return;
		}

		const panel = vscode.window.createWebviewPanel(
			'collabChat',
			'CollabCode Chat',
			{
				viewColumn: vscode.ViewColumn.Two,
				preserveFocus: true
			},
			{
				enableScripts: true
			}
		);
		
		collaborativeEditor.chatPanel = panel;

		panel.webview.html = `
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

				.notification-container {
					position: fixed;
					bottom: 80px;
					right: 20px;
					z-index: 1000;
				}

				.notification {
					background-color: rgba(30, 30, 30, 0.9);
					color: #d4d4d4;
					padding: 8px 12px;
					border-radius: 6px;
					margin-top: 8px;
					font-size: 12px;
					animation: slideIn 0.3s ease-out, fadeOut 0.3s ease-in 2.7s;
					border: 1px solid var(--border-color);
					box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
				}

				@keyframes slideIn {
					from {
						transform: translateX(100%);
						opacity: 0;
					}
					to {
						transform: translateX(0);
						opacity: 1;
					}
				}

				@keyframes fadeOut {
					from {
						opacity: 1;
					}
					to {
						opacity: 0;
					}
				}

				body {
					margin: 0;
					padding: 16px;
					background-color: var(--background);
					font-family: 'Segoe UI', sans-serif;
					color: var(--font-color);
				}

				#header {
					display: flex;
					justify-content: space-between;
					align-items: center;
					margin-bottom: 16px;
					padding: 0 10px;
				}

				h3 {
					margin: 0;
					color: #3794ff;
					font-size: 1.2em;
				}

				#status {
					font-size: 0.9em;
					color: #888;
				}

				#chat {
					background-color: var(--panel-bg);
					border: 1px solid var(--border-color);
					border-radius: 8px;
					padding: 16px;
					height: calc(100vh - 140px);
					overflow-y: auto;
					box-shadow: 0 2px 4px rgba(0,0,0,0.3);
					margin-bottom: 14px;
				}

				.message {
					margin-bottom: 12px;
					opacity: 0;
					transform: translateY(20px);
					animation: slideIn 0.3s ease forwards;
				}

				.message.user {
					display: flex;
					justify-content: flex-end;
				}

				.message.other {
					display: flex;
					justify-content: flex-start;
				}

				.bubble {
					background-color: #2d2d2d;
					border-radius: 12px;
					padding: 10px 14px;
					max-width: 80%;
					box-shadow: 0 2px 4px rgba(0,0,0,0.2);
				}

				.message.user .bubble {
					background-color: #0e639c;
				}

				.bubble-header {
					display: flex;
					justify-content: space-between;
					align-items: center;
					margin-bottom: 6px;
					font-size: 0.85em;
				}

				.bubble-user {
					font-weight: bold;
					color: #3794ff;
				}

				.message.user .bubble-user {
					color: #fff;
				}

				.bubble-time {
					font-size: 0.75em;
					color: #666;
					margin-left: 8px;
				}

				.bubble-text {
					word-wrap: break-word;
					line-height: 1.4;
				}

				.reactions {
					display: flex;
					gap: 6px;
					margin-top: 4px;
				}

				.reaction {
					padding: 2px 6px;
					border-radius: 12px;
					background-color: #333;
					font-size: 0.9em;
					cursor: pointer;
					transition: all 0.2s;
					display: flex;
					align-items: center;
					gap: 4px;
				}

				.reaction:hover {
					background-color: #444;
					transform: scale(1.1);
				}

				.reaction-count {
					font-size: 0.8em;
					color: #888;
				}

				#input-container {
					display: flex;
					gap: 8px;
					padding: 0 10px;
				}

				#messageInput {
					flex: 1;
					padding: 10px 14px;
					border-radius: 20px;
					border: 1px solid var(--border-color);
					background-color: var(--input-bg);
					color: var(--font-color);
					font-size: 14px;
					transition: border-color 0.2s;
				}

				#messageInput:focus {
					outline: none;
					border-color: #0e639c;
				}

				button {
					padding: 8px 20px;
					background-color: var(--button-bg);
					color: white;
					border: none;
					border-radius: 20px;
					cursor: pointer;
					font-weight: 500;
					transition: all 0.2s;
				}

				button:hover {
					background-color: var(--button-hover);
					transform: translateY(-1px);
				}

				button:active {
					transform: translateY(1px);
				}
			</style>
		</head>
		<body>
			<div id="header">
				<h3>Live Chat 💬</h3>
				<div id="status">Connecting...</div>
			</div>
			<div id="chat"></div>
			<div id="notification-container" class="notification-container"></div>
			<div id="input-container">
				<input type="text" id="messageInput" placeholder="Type your message..." />
				<button onclick="sendMessage()">Send</button>
			</div>

			<script>
				const vscode = acquireVsCodeApi();
				const chat = document.getElementById('chat');
				const messageInput = document.getElementById('messageInput');
				const status = document.getElementById('status');
				const notificationContainer = document.getElementById('notification-container');
				let username = '';
				let messages = [];

				const state = vscode.getState() || { messages: [] };
				messages = state.messages;
				messages.forEach(msg => addMessageToUI(msg));

				function showNotification(text) {
					const notification = document.createElement('div');
					notification.className = 'notification';
					notification.textContent = text;
					notificationContainer.appendChild(notification);

					setTimeout(() => {
						notification.remove();
					}, 3000);
				}

				window.addEventListener('message', event => {
					const message = event.data;
					console.log('Received message:', message);

					switch (message.type) {
						case 'setUsername':
							username = message.username;
							status.textContent = 'Connected as ' + username;
							break;
						case 'chatMessage':
							const msg = {
								id: Date.now().toString(),
								username: message.username,
								text: message.text,
								time: message.time,
								reactions: {}
							};
							messages.push(msg);
							vscode.setState({ messages });
							addMessageToUI(msg);
							break;
						case 'reaction':
							handleReaction(message);
							showNotification(\`\${message.username} reacted with \${message.reaction}\`);
							break;
					}
				});

				function handleReaction(data) {
					const messageElement = document.querySelector(\`[data-message-id="\${data.messageId}"]\`);
					if (messageElement) {
						const reactionsContainer = messageElement.querySelector('.reactions');
						const reaction = reactionsContainer.querySelector(\`[data-reaction="\${data.reaction}"]\`);
						
						const message = messages.find(m => m.id === data.messageId);
						if (message) {
							if (!message.reactions[data.reaction]) {
								message.reactions[data.reaction] = new Set();
							}
							message.reactions[data.reaction].add(data.username);
							
							if (reaction) {
								const count = message.reactions[data.reaction].size;
								reaction.querySelector('.reaction-count').textContent = count;
							} else {
								const newReaction = createReactionElement(data.reaction, message.reactions[data.reaction].size);
								reactionsContainer.appendChild(newReaction);
							}
							
							vscode.setState({ messages });
						}
					}
				}

				function createReactionElement(emoji, count) {
					const span = document.createElement('span');
					span.className = 'reaction';
					span.setAttribute('data-reaction', emoji);
					span.innerHTML = \`\${emoji}<span class="reaction-count">\${count}</span>\`;
					return span;
				}

				function sendReaction(messageId, reaction) {
					vscode.postMessage({
						type: 'reaction',
						messageId: messageId,
						reaction: reaction
					});
				}

				function addMessageToUI(msg) {
					const div = document.createElement('div');
					div.className = 'message ' + (msg.username === username ? 'user' : 'other');
					div.setAttribute('data-message-id', msg.id);
					
					let reactionsHtml = '';
					if (msg.reactions) {
						reactionsHtml = Object.entries(msg.reactions)
							.map(([emoji, users]) => \`
								<span class="reaction" data-reaction="\${emoji}" onclick="sendReaction('\${msg.id}', '\${emoji}')">
									\${emoji}<span class="reaction-count">\${users.size}</span>
								</span>
							\`).join('');
					}

					div.innerHTML = \`
						<div class="bubble">
							<div class="bubble-header">
								<span class="bubble-user">\${msg.username}</span>
								<span class="bubble-time">\${msg.time}</span>
							</div>
							<div class="bubble-text">\${msg.text}</div>
							<div class="reactions">
								\${reactionsHtml}
								<span class="reaction" onclick="sendReaction('\${msg.id}', '👍')">👍</span>
								<span class="reaction" onclick="sendReaction('\${msg.id}', '❤️')">❤️</span>
								<span class="reaction" onclick="sendReaction('\${msg.id}', '😊')">😊</span>
							</div>
						</div>
					\`;
					chat.appendChild(div);
					chat.scrollTop = chat.scrollHeight;
				}

				function sendMessage() {
					const text = messageInput.value.trim();
					if (text) {
						vscode.postMessage({
							type: 'chatMessage',
							text: text
						});
						messageInput.value = '';
					}
				}

				messageInput.addEventListener('keypress', (e) => {
					if (e.key === 'Enter') {
						sendMessage();
					}
				});

				vscode.postMessage({ type: 'ready' });
			</script>
		</body>
		</html>
		`;

		panel.webview.onDidReceiveMessage(async (msg) => {
			switch (msg.type) {
				case 'ready':
				panel.webview.postMessage({
					type: 'setUsername',
					username: collaborativeEditor.username
				});
					break;
				case 'chatMessage':
					if (collaborativeEditor.ws && collaborativeEditor.ws.readyState === WebSocket.OPEN) {
						const chatMessage = {
							type: 'chat',
							text: msg.text,
							username: collaborativeEditor.username,
							timestamp: new Date().toISOString()
						};
						collaborativeEditor.ws.send(JSON.stringify(chatMessage));
						
						panel.webview.postMessage({
							type: 'chatMessage',
							username: collaborativeEditor.username,
							text: msg.text,
							time: new Date().toLocaleTimeString()
						});
					} else {
						vscode.window.showErrorMessage('Not connected to chat server');
					}
					break;
				case 'reaction':
					collaborativeEditor.sendReaction(msg.messageId, msg.reaction);
					break;
			}
		});

		if (collaborativeEditor.ws) {
			collaborativeEditor.ws.onmessage = (event) => {
				try {
					const message = JSON.parse(event.data);
					if (message.type === 'chat') {
						panel.webview.postMessage({
							type: 'chatMessage',
							username: message.username,
							text: message.text,
							time: new Date(message.timestamp).toLocaleTimeString()
						});
					} else if (message.type === 'reaction') {
						panel.webview.postMessage({
							type: 'reaction',
							messageId: message.messageId,
							reaction: message.reaction,
							username: message.username
						});
					}
				} catch (error) {
					console.error('Error handling chat message:', error);
				}
			};
		}
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

	const startServerCommand = vscode.commands.registerCommand('collab-code.startServer', async function () {
		const terminal = vscode.window.createTerminal('CollabCode Server');
		
		if (process.platform === 'win32') {
			terminal.sendText('FOR /F "tokens=5" %P IN (\'netstat -ano ^| findstr :8080\') DO TaskKill /PID %P /F >nul 2>&1');
		} else {
			terminal.sendText('lsof -ti:8080 | xargs kill -9');
		}

		await new Promise(resolve => setTimeout(resolve, 1000));

		terminal.sendText('node server.js');
		terminal.show();
		
		const ip = require('ip');
		const localIP = ip.address();
		const serverUrl = `ws://${localIP}:8080`;
		
		await vscode.workspace.getConfiguration('collab-code').update('serverUrl', serverUrl, true);
		
		vscode.window.showInformationMessage(
			`Server started!\n` +
			`Share this address with your collaborators: ${serverUrl}\n` +
			`They can connect using the "CollabCode: Connect to Server" command.`
		);
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

				.notification-container {
					position: fixed;
					bottom: 80px;
					right: 20px;
					z-index: 1000;
				}

				.notification {
					background-color: rgba(30, 30, 30, 0.9);
					color: #d4d4d4;
					padding: 8px 12px;
					border-radius: 6px;
					margin-top: 8px;
					font-size: 12px;
					animation: slideIn 0.3s ease-out, fadeOut 0.3s ease-in 2.7s;
					border: 1px solid var(--border-color);
					box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
				}

				@keyframes slideIn {
					from {
						transform: translateX(100%);
						opacity: 0;
					}
					to {
						transform: translateX(0);
						opacity: 1;
					}
				}

				@keyframes fadeOut {
					from {
						opacity: 1;
					}
					to {
						opacity: 0;
					}
				}

				body {
					margin: 0;
					padding: 16px;
					background-color: var(--background);
					font-family: 'Segoe UI', sans-serif;
					color: var(--font-color);
				}

				#header {
					display: flex;
					justify-content: space-between;
					align-items: center;
					margin-bottom: 16px;
				}

				h3 {
					margin: 0;
					color: #3794ff;
				}

				#status {
					font-size: 0.9em;
					color: #888;
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

				.message {
					margin-bottom: 12px;
					opacity: 0;
					transform: translateY(20px);
					animation: slideIn 0.3s ease forwards;
				}

				@keyframes slideIn {
					to {
						opacity: 1;
						transform: translateY(0);
					}
				}

				.message.user {
					display: flex;
					justify-content: flex-end;
				}

				.message.other {
					display: flex;
					justify-content: flex-start;
				}

				.bubble {
					background-color: #2d2d2d;
					border-radius: 10px;
					padding: 10px;
					max-width: 75%;
					box-shadow: 0 2px 4px rgba(0,0,0,0.2);
				}

				.message.user .bubble {
					background-color: #0e639c;
				}

				.bubble-header {
					display: flex;
					justify-content: space-between;
					align-items: center;
					margin-bottom: 4px;
					font-size: 0.85em;
				}

				.bubble-user {
					font-weight: bold;
					color: #3794ff;
				}

				.message.user .bubble-user {
					color: #fff;
				}

				.bubble-time {
					font-size: 0.75em;
					color: #666;
				}

				.bubble-text {
					word-wrap: break-word;
					line-height: 1.4;
				}

				#input-container {
					display: flex;
					gap: 8px;
				}

				#messageInput {
					flex: 1;
					padding: 8px 12px;
					border-radius: 6px;
					border: 1px solid var(--border-color);
					background-color: var(--input-bg);
					color: var(--font-color);
					font-size: 14px;
				}

				button {
					padding: 8px 16px;
					background-color: var(--button-bg);
					color: white;
					border: none;
					border-radius: 6px;
					cursor: pointer;
					font-weight: 500;
					transition: background-color 0.2s;
				}

				button:hover {
					background-color: var(--button-hover);
				}

				button:active {
					transform: translateY(1px);
				}
			</style>
		</head>
		<body>
			<div id="header">
				<h3>Live Chat 💬</h3>
				<div id="status">Connecting...</div>
			</div>
			<div id="chat"></div>
			<div id="notification-container" class="notification-container"></div>
			<div id="input-container">
				<input type="text" id="messageInput" placeholder="Type your message..." />
				<button onclick="sendMessage()">Send</button>
			</div>

			<script>
				const vscode = acquireVsCodeApi();
				const chat = document.getElementById('chat');
				const messageInput = document.getElementById('messageInput');
				const status = document.getElementById('status');
				const notificationContainer = document.getElementById('notification-container');
				let username = '';

				console.log = function(...args) {
					vscode.postMessage({
						type: 'log',
						message: args.join(' ')
					});
				};

				window.addEventListener('message', event => {
				const message = event.data;
					console.log('Received message:', message);

					switch (message.type) {
						case 'setUsername':
							username = message.username;
							status.textContent = 'Connected as ' + username;
							break;
						case 'chatMessage':
							addMessage(message.username, message.text, message.time);
							break;
					}
				});

				function showNotification(text) {
					const notification = document.createElement('div');
					notification.className = 'notification';
					notification.textContent = text;
					notificationContainer.appendChild(notification);

					setTimeout(() => {
						notification.remove();
					}, 3000);
				}

				function sendMessage() {
					const text = messageInput.value.trim();
					if (text) {
						console.log('Sending message:', text);
						vscode.postMessage({
							type: 'chatMessage',
							text: text
						});
						messageInput.value = '';
					}
				}

				function addMessage(user, text, time) {
					console.log('Adding message:', { user, text, time });
					const div = document.createElement('div');
					div.className = 'message ' + (user === username ? 'user' : 'other');
					div.innerHTML = \`
									<div class="bubble">
										<div class="bubble-header">
								<span class="bubble-user">\${user}</span>
											<span class="bubble-time">\${time}</span>
										</div>
							<div class="bubble-text">\${text}</div>
								</div>
							\`;
					chat.appendChild(div);
					chat.scrollTop = chat.scrollHeight;
				}

				messageInput.addEventListener('keypress', (e) => {
					if (e.key === 'Enter') {
						sendMessage();
					}
				});

				console.log('Webview ready, sending ready message');
				vscode.postMessage({ type: 'ready' });
			</script>
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
