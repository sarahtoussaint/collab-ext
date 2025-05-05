const WebSocket = require('ws');
const http = require('http');
const ip = require('ip');

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('WebSocket server is running');
});

const wss = new WebSocket.Server({ 
    noServer: true,
    perMessageDeflate: false,
    clientTracking: true
});

const clients = new Map();

const HEARTBEAT_INTERVAL = 30000;
const HEARTBEAT_TIMEOUT = 30000;

const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        const client = clients.get(ws);
        if (client && client.lastPing && Date.now() - client.lastPing > HEARTBEAT_TIMEOUT) {
            console.log(`Client ${client.clientId} timed out`);
            clients.delete(ws);
            return ws.terminate();
        }
        if (ws.readyState === WebSocket.OPEN) {
            ws.ping();
        }
    });
}, HEARTBEAT_INTERVAL);

server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
    });
});

wss.on('connection', (ws, req) => {
    const clientId = Math.random().toString(36).substr(2, 9);
    clients.set(ws, { 
        clientId, 
        username: null,
        lastPing: Date.now()
    });
    console.log(`New client connected: ${clientId}`);

    broadcastUserCount();

    ws.on('pong', () => {
        const client = clients.get(ws);
        if (client) {
            client.lastPing = Date.now();
        }
    });

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message.toString());
            console.log(`Message received: ${JSON.stringify(data)}`);

            if (data.type === 'userInfo' && data.username) {
                const client = clients.get(ws);
                if (client) {
                    client.username = data.username;
                }
                return; 
            }

            const client = clients.get(ws);
            if (client) {
                data.senderId = client.clientId;
                data.username = client.username || `User${client.clientId.substring(0,4)}`;
            }

            broadcast(ws, JSON.stringify(data));
        } catch (error) {
            console.error('Error processing message:', error);
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Failed to process message'
            }));
        }
    });

    ws.on('error', (error) => {
        console.error(`WebSocket error for client ${clientId}:`, error);
    });

    ws.on('close', () => {
        const leavingClient = clients.get(ws);
        
        if (leavingClient) {
            console.log(`Client disconnected: ${leavingClient.clientId}`);
            
            const message = JSON.stringify({
                type: 'userLeft',
                senderId: leavingClient.clientId
            });
            broadcast(ws, message);
        }
    
        clients.delete(ws);
        broadcastUserCount();
    });
});

wss.on('error', (error) => {
    console.error('WebSocket server error:', error);
});

function broadcast(sender, message) {
    console.log(`Broadcasting message`);
    wss.clients.forEach((client) => {
        if (client !== sender && client.readyState === WebSocket.OPEN) {
            try {
                client.send(message);
            } catch (error) {
                console.error('Error broadcasting to client:', error);
            }
        }
    });
}

function broadcastUserCount() {
    const count = clients.size;
    const message = JSON.stringify({
        type: 'userCount',
        count: count
    });

    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            try {
                client.send(message);
            } catch (error) {
                console.error('Error sending user count to client:', error);
            }
        }
    });
}

const PORT = 8080;

server.on('error', (error) => {
    if (error.message && error.message.includes('EADDRINUSE')) {
        console.error(`Port ${PORT} is already in use. Please try a different port.`);
    } else {
        console.error('Server error:', error);
    }
});

function cleanup() {
    clearInterval(interval);
    wss.close(() => {
        console.log('WebSocket server closed');
        server.close(() => {
            console.log('HTTP server closed');
            process.exit(0);
        });
    });
}

process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);

server.listen(PORT, '0.0.0.0', () => {
    const lanIP = ip.address();
    console.log(`WebSocket server running at:`);
    console.log(`- Local address: ws://localhost:${PORT}`);
    console.log(`- LAN address: ws://${lanIP}:${PORT}`);
    console.log('Share the LAN address with your collaborators!');
});
