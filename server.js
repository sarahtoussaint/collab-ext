const WebSocket = require('ws');
const http = require('http');
const ip = require('ip');

const server = http.createServer();
const wss = new WebSocket.Server({ server });
const clients = new Map();

wss.on('connection', (ws) => {
  const clientId = Math.random().toString(36).substr(2, 9);
  clients.set(ws, { clientId, username: null });
  console.log(`New client connected: ${clientId}`);

  broadcastUserCount();

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
    }
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

function broadcast(sender, message) {
  console.log(`Broadcasting message`);
  clients.forEach((_, wsClient) => {
    if (wsClient !== sender && wsClient.readyState === WebSocket.OPEN) {
      wsClient.send(message);
    }
  });
}

function broadcastUserCount() {
  const count = clients.size;
  const message = JSON.stringify({
    type: 'userCount',
    count: count
  });

  clients.forEach((_, client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

const localIP = ip.address();
const PORT = 8080;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`WebSocket server running at:`);
  console.log(`- Local address: ws://localhost:${PORT}`);
  console.log(`- LAN address: ws://${localIP}:${PORT}`);
});
