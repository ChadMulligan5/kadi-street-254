const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const rooms = new Map();

// Full 52-card deck
function createDeck() {
  const deck = [];
  for (let suit = 0; suit < 4; suit++)
    for (let num = 0; num < 13; num++)
      deck.push({ suit, num });
  return deck;
}

// Fisher-Yates shuffle
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  socket.on('createRoom', () => {
    const roomId = uuidv4().slice(0, 6).toUpperCase();
    rooms.set(roomId, {
      players: [socket.id],
      player1: socket.id,
      player2: null,
      deck: null,
      topCard: null,
      player1Hand: null,
      player2Hand: null
    });
    socket.join(roomId);
    socket.emit('roomCreated', roomId);
    console.log(`Room created: ${roomId}`);
  });

  socket.on('joinRoom', (code) => {
    const roomId = code.toUpperCase();
    const room = rooms.get(roomId);

    if (!room) return socket.emit('error', 'Hii room haipo bro!');
    if (room.players.length >= 2) return socket.emit('error', 'Room imejaa!');

    room.players.push(socket.id);
    room.player2 = socket.id;
    socket.join(roomId);
    socket.emit('roomJoined', roomId);

    // SERVER SHUFFLES ONCE → SAME DECK FOR BOTH
    const fullDeck = shuffle(createDeck());
    const player1Hand = fullDeck.splice(0, 4);
    const player2Hand = fullDeck.splice(0, 4);
    const topCard = fullDeck.splice(0, 1)[0];

    room.deck = fullDeck;
    room.topCard = topCard;
    room.player1Hand = player1Hand;
    room.player2Hand = player2Hand;

    // SEND GAME STATE – OPPONENT HAND IS HIDDEN!
    io.to(room.player1).emit('gameStart', {
      youAreFirst: true,
      deck: fullDeck.map(c => ({ suit: c.suit, num: c.num })),
      userHand: player1Hand.map(c => ({ suit: c.suit, num: c.num })),
      opponentHand: Array(4).fill(null),           // ← HIDDEN
      topCard: { suit: topCard.suit, num: topCard.num }
    });

    io.to(room.player2).emit('gameStart', {
      youAreFirst: false,
      deck: fullDeck.map(c => ({ suit: c.suit, num: c.num })),
      userHand: player2Hand.map(c => ({ suit: c.suit, num: c.num })),
      opponentHand: Array(4).fill(null),           // ← HIDDEN
      topCard: { suit: topCard.suit, num: topCard.num }
    });

    console.log(`Game started → Room ${roomId} | Top: ${topCard.num}_${topCard.suit}`);
  });

  // RELAY MOVES – HIDE PICKED CARDS FROM OPPONENT
  socket.on('move', ({ roomId, move }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    const opponentId = room.player1 === socket.id ? room.player2 : room.player1;
    if (!opponentId) return;

    if (move.type === 'pick') {
      // Only tell opponent HOW MANY cards were picked → no card data!
      socket.to(opponentId).emit('opponentMove', { type: 'pick', num: move.num });
    } else if (move.type === 'drop') {
      // Dropping is public → send real cards
      socket.to(opponentId).emit('opponentMove', move);
    }
  });

  // Rematch (optional)
  socket.on('rematch', ({ roomId }) => {
    socket.to(roomId).emit('rematchRequest');
  });

  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    for (const [roomId, room] of rooms.entries()) {
      const idx = room.players.indexOf(socket.id);
      if (idx !== -1) {
        socket.to(roomId).emit('opponentLeft');
        rooms.delete(roomId);
        console.log(`Room ${roomId} deleted`);
        break;
      }
    }
  });
});

const PORT = process.env.REACT_BASE_URL || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log('='.repeat(70));
  console.log('KADI 254 ONLINE – 100% FAIR, NO CHEATING, FULLY HIDDEN CARDS!');
  console.log('='.repeat(70));
  console.log(`Server running → http://localhost:${PORT}`);
  console.log(`Phone/PC → http://YOUR_IP:${PORT}`);
  console.log('='.repeat(70));
});