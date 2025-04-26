const WebSocket = require('ws');
const http = require('http');
const ip = require('ip');

const server = http.createServer();
const wss = new WebSocket.Server({ server });
const clients = new Map();

wss.on('connection', (ws) => {
  const clientId = Math.random().toString(36).substr(2, 9);
  clients.set(ws, clientId);
  console.log(`New client connected: ${clientId}`);
  
  broadcastUserCount();
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log(`Message received: ${JSON.stringify(data)}`);
      
      data.senderId = clientId;
      broadcast(ws, JSON.stringify(data));
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });
  
  ws.on('close', () => {
    console.log(`Client disconnected: ${clientId}`);
    clients.delete(ws);
    broadcastUserCount();
  });
});

function broadcast(sender, message) {
  console.log(`Broadcasting message from ${clients.get(sender)} to ${clients.size - 1} other clients`);
  clients.forEach((clientId, client) => {
      if (client !== sender && client.readyState === WebSocket.OPEN) {
          console.log(`Sending to client: ${clientId}`);
          client.send(message);
      }
  });
}

function broadcastUserCount() {
  const count = clients.size;
  const message = JSON.stringify({
    type: 'userCount',
    count: count
  });
  
  [...clients.keys()].forEach(client => {
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