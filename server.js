const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080 });

const clients = new Map();

wss.on('connection', (ws) => {
    const clientId = Math.random().toString(36).substr(2, 9);
    
    clients.set(clientId, {
        ws,
        username: `User${clientId.substring(0, 5)}`,
        cursorPosition: null
    });

    ws.send(JSON.stringify({
        type: 'system',
        message: 'Connected to server',
        clientId
    }));

    broadcastUserList();

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            switch (data.type) {
                case 'chat':
                    broadcastMessage(data);
                    break;
                case 'cursor':
                    updateCursorPosition(clientId, data.position);
                    break;
                case 'edit':
                    broadcastEdit(data);
                    break;
                case 'username':
                    updateUsername(clientId, data.username);
                    break;
            }
        } catch (error) {
            console.error('Error processing message:', error);
        }
    });

    ws.on('close', () => {
        clients.delete(clientId);
        broadcastUserList();
    });
});

function broadcastMessage(data) {
    const message = {
        type: 'chat',
        ...data,
        timestamp: new Date().toISOString()
    };
    
    broadcast(JSON.stringify(message));
}

function broadcastEdit(data) {
    broadcast(JSON.stringify({
        type: 'edit',
        ...data
    }));
}

function updateCursorPosition(clientId, position) {
    const client = clients.get(clientId);
    if (client) {
        client.cursorPosition = position;
        broadcastCursorPositions();
    }
}

function updateUsername(clientId, username) {
    const client = clients.get(clientId);
    if (client) {
        client.username = username;
        broadcastUserList();
    }
}

function broadcastUserList() {
    const userList = Array.from(clients.entries()).map(([id, client]) => ({
        id,
        username: client.username
    }));
    
    broadcast(JSON.stringify({
        type: 'userList',
        users: userList
    }));
}

function broadcastCursorPositions() {
    const cursorPositions = Array.from(clients.entries())
        .filter(([_, client]) => client.cursorPosition)
        .map(([id, client]) => ({
            id,
            username: client.username,
            position: client.cursorPosition
        }));
    
    broadcast(JSON.stringify({
        type: 'cursorPositions',
        positions: cursorPositions
    }));
}

function broadcast(message) {
    clients.forEach(client => {
        if (client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(message);
        }
    });
}

console.log('WebSocket server started on port 8080'); 