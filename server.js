const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json());

let notesData = { notes: '', todos: [] };

// REST API fallback (optional)
app.get('/notes', (req, res) => {
  res.json(notesData);
});

app.post('/notes', (req, res) => {
  notesData = req.body;
  // broadcast updated data to everyone
  broadcast(notesData);
  res.sendStatus(200);
});

// WebSocket connection
wss.on('connection', (ws) => {
  console.log('🔵 New WebSocket connection');
  ws.send(JSON.stringify(notesData)); // send current data on connect

  ws.on('message', (message) => {
    console.log('Received:', message);
    notesData = JSON.parse(message);
    broadcast(notesData);
  });
});

function broadcast(data) {
  const jsonData = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(jsonData);
    }
  });
}

server.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});