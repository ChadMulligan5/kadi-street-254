// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

// Serve static files (your game)
app.use(express.static('public')); // put index.html, game-online.html, assets here

const rooms = new Map(); // roomId → { players: [], gameState }

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  // === CREATE ROOM ===
  socket.on('createRoom', () => {
    const roomId = uuidv4().slice(0, 6).toUpperCase();
    rooms.set(roomId, {
      players: [socket.id],
      gameState: null,
      turn: null
    });
    socket.join(roomId);
    socket.emit('roomCreated', roomId);
    console.log(`Room ${roomId} created by ${socket.id}`);
  });

  // === JOIN ROOM ===
  socket.on('joinRoom', (roomId) => {
    const room = rooms.get(roomId);
    if (!room) return socket.emit('error', 'Room not found');
    if (room.players.length >= 2) return socket.emit('error', 'Room full');
    if (room.players.includes(socket.id)) return;

    room.players.push(socket.id);
    socket.join(roomId);
    socket.emit('roomJoined', roomId);

    // Start game for both
    const isFirst = room.players[0] === socket.id;
    io.to(roomId).emit('gameStart', { youAreFirst: isFirst });

    console.log(`Player ${socket.id} joined ${roomId}`);
  });

  // === RELAY GAME MOVES ===
  socket.on('move', ({ roomId, move }) => {
    const room = rooms.get(roomId);
    if (!room || !room.players.includes(socket.id)) return;
    socket.to(roomId).emit('opponentMove', move);
  });

  // === DISCONNECT ===
  socket.on('disconnect', () => {
    for (const [roomId, room] of rooms) {
      const idx = room.players.indexOf(socket.id);
      if (idx !== -1) {
        room.players.splice(idx, 1);
        io.to(roomId).emit('opponentLeft');
        if (room.players.length === 0) rooms.delete(roomId);
      }
    }
    console.log('Player disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on https://your-app.onrender.com`);
});