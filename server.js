const WebSocket = require('ws');
const http = require('http');
const ip = require('ip');

// 创建 HTTP 服务器
const server = http.createServer();

// 创建 WebSocket 服务器
const wss = new WebSocket.Server({ server });

// 存储所有连接的客户端
const clients = new Map();

// 当有新的连接时
wss.on('connection', (ws) => {
    const clientId = Math.random().toString(36).substr(2, 9);
    clients.set(ws, clientId);
    console.log(`新客户端连接: ${clientId}`);

    // 广播当前在线用户数
    broadcastUserCount();

    // 处理消息
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log(`收到消息: ${JSON.stringify(data)}`);
            
            // 给消息添加发送者ID
            data.senderId = clientId;
            
            // 广播给其他客户端
            broadcast(ws, JSON.stringify(data));
        } catch (error) {
            console.error('处理消息时出错:', error);
        }
    });

    // 处理连接关闭
    ws.on('close', () => {
        console.log(`客户端断开连接: ${clientId}`);
        clients.delete(ws);
        broadcastUserCount();
    });
});

// 广播消息给其他客户端
function broadcast(sender, message) {
    clients.forEach((clientId, client) => {
        if (client !== sender && client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

// 广播在线用户数
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

// 获取本地IP地址
const localIP = ip.address();

// 监听特定端口
const PORT = 8080;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`WebSocket 服务器运行在:`);
    console.log(`- 本地地址: ws://localhost:${PORT}`);
    console.log(`- 局域网地址: ws://${localIP}:${PORT}`);
}); 