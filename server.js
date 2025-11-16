// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// === ROOM MANAGEMENT ===
const rooms = new Map(); // roomId → { players: [socket.id] }

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  // CREATE ROOM
  socket.on('createRoom', () => {
    const roomId = uuidv4().slice(0, 6).toUpperCase();
    rooms.set(roomId, { players: [socket.id] });
    socket.join(roomId);
    socket.emit('roomCreated', roomId);
    console.log(`Room ${roomId} created by ${socket.id}`);
  });

  // JOIN ROOM
  socket.on('joinRoom', (roomId) => {
    roomId = roomId.trim().toUpperCase();
    const room = rooms.get(roomId);

    if (!room) return socket.emit('error', 'Room not found.');
    if (room.players.length >= 2) return socket.emit('error', 'Room is full.');
    if (room.players.includes(socket.id)) return;

    room.players.push(socket.id);
    socket.join(roomId);
    socket.emit('roomJoined', roomId);

    // START GAME FOR BOTH
    const [p1, p2] = room.players;
    io.to(p1).emit('gameStart', { youAreFirst: true });
    io.to(p2).emit('gameStart', { youAreFirst: false });

    console.log(`Player ${socket.id} joined ${roomId} → Game started`);
  });

  // RELAY MOVE
  socket.on('move', ({ roomId, move }) => {
    const room = rooms.get(roomId);
    if (!room || !room.players.includes(socket.id)) return;
    socket.to(roomId).emit('opponentMove', move);
  });

  // DISCONNECT
  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    for (const [roomId, room] of rooms.entries()) {
      const idx = room.players.indexOf(socket.id);
      if (idx !== -1) {
        room.players.splice(idx, 1);
        socket.to(roomId).emit('opponentLeft');
        if (room.players.length === 0) rooms.delete(roomId);
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`Server running on ${url}`);
});