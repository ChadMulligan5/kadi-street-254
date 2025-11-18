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

app.use(express.static(__dirname));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'welcome.html')));

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

  // CREATE ROOM
  socket.on('createRoom', ({ playerName }) => {
    const roomId = uuidv4().slice(0, 6).toUpperCase();
    rooms.set(roomId, {
      players: [socket.id],
      player1: socket.id,
      player1Name: (playerName || "Player 1").trim(),
      player2: null,
      player2Name: null,
      deck: null,
      topCard: null,
      player1Hand: null,
      player2Hand: null
    });
    socket.join(roomId);
    socket.emit('roomCreated', roomId);
    console.log(`Room created: ${roomId} by ${playerName}`);
  });

  // JOIN ROOM – FIXED & SAFE
  socket.on('joinRoom', (data) => {
    // Accept both { code, playerName } and old format
    const code = typeof data === 'string' ? data : data?.code;
    const playerName = typeof data === 'string' ? "Player 2" : data?.playerName;

    if (!code || typeof code !== 'string') {
      return socket.emit('error', 'Code is required!');
    }

    const roomId = code.trim().toUpperCase();
    const room = rooms.get(roomId);

    if (!room) return socket.emit('error', 'Room haipo!');
    if (room.player2) return socket.emit('error', 'Room imejaa!');

    room.players.push(socket.id);
    room.player2 = socket.id;
    room.player2Name = (playerName || "Player 2").trim();

    socket.join(roomId);
    socket.emit('roomJoined', { id: roomId, opponentName: room.player1Name });

    // Notify first player that someone joined
    socket.to(roomId).emit('opponentJoined', { opponentName: room.player2Name });

    // START GAME
    const fullDeck = shuffle(createDeck());
    const player1Hand = fullDeck.splice(0, 4);
    const player2Hand = fullDeck.splice(0, 4);
    const topCard = fullDeck.pop();

    room.deck = fullDeck;
    room.topCard = topCard;
    room.player1Hand = player1Hand;
    room.player2Hand = player2Hand;

    // Send game to both
    io.to(room.player1).emit('gameStart', {
      youAreFirst: true,
      deck: fullDeck.map(c => ({ suit: c.suit, num: c.num })),
      userHand: player1Hand.map(c => ({ suit: c.suit, num: c.num })),
      opponentHandCount: 4,
      topCard: { suit: topCard.suit, num: topCard.num },
      opponentName: room.player2Name
    });

    io.to(room.player2).emit('gameStart', {
      youAreFirst: false,
      deck: fullDeck.map(c => ({ suit: c.suit, num: c.num })),
      userHand: player2Hand.map(c => ({ suit: c.suit, num: c.num })),
      opponentHandCount: 4,
      topCard: { suit: topCard.suit, num: topCard.num },
      opponentName: room.player1Name
    });

    console.log(`Game started → ${room.player1Name} vs ${room.player2Name}`);
  });

  // MOVE HANDLING
  socket.on('move', ({ roomId, move }) => {
    const room = rooms.get(roomId);
    if (!room || !room.player2) return;

    const isPlayer1 = room.player1 === socket.id;
    const opponentId = isPlayer1 ? room.player2 : room.player1;

    if (move.type === 'pick') {
      const num = move.num || 1;
      if (room.deck.length < num) {
        return socket.emit('error', 'Hakuna kadi za kutosha!');
      }

      const pickedCards = room.deck.splice(-num); // take from end

      if (isPlayer1) room.player1Hand.push(...pickedCards);
      else room.player2Hand.push(...pickedCards);

      // Give real cards to the player who picked
      socket.emit('yourPick', pickedCards.map(c => ({ suit: c.suit, num: c.num })));

      // Send hidden cards to opponent
      const hidden = Array(num).fill().map(() => ({ suit: null, num: null }));
      io.to(opponentId).emit('opponentMove', { type: 'pick', cards: hidden });

      // Sync remaining deck
      io.in(roomId).emit('deckUpdate', {
        remainingCards: room.deck.map(c => ({ suit: c.suit, num: c.num }))
      });

    } else if (move.type === 'drop') {
      const cards = move.cards;
      const hand = isPlayer1 ? room.player1Hand : room.player2Hand;

      cards.forEach(card => {
        const idx = hand.findIndex(c => c.suit === card.suit && c.num === card.num);
        if (idx !== -1) hand.splice(idx, 1);
      });

      room.topCard = cards[cards.length - 1];

      io.to(opponentId).emit('opponentMove', { type: 'drop', cards });
      io.in(roomId).emit('deckUpdate', { remainingCards: room.deck.map(c => ({ suit: c.suit, num: c.num })) });
    }
  });

  // REMATCH
  socket.on('rematch', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || !room.player2) return;

    const fullDeck = shuffle(createDeck());
    const p1 = fullDeck.splice(0, 4);
    const p2 = fullDeck.splice(0, 4);
    const top = fullDeck.pop();

    room.deck = fullDeck;
    room.topCard = top;
    room.player1Hand = p1;
    room.player2Hand = p2;

    io.to(room.player1).emit('gameStart', {
      youAreFirst: true,
      deck: fullDeck.map(c => ({ suit: c.suit, num: c.num })),
      userHand: p1.map(c => ({ suit: c.suit, num: c.num })),
      opponentHandCount: 4,
      topCard: { suit: top.suit, num: top.num },
      opponentName: room.player2Name
    });

    io.to(room.player2).emit('gameStart', {
      youAreFirst: false,
      deck: fullDeck.map(c => ({ suit: c.suit, num: c.num })),
      userHand: p2.map(c => ({ suit: c.suit, num: c.num })),
      opponentHandCount: 4,
      topCard: { suit: top.suit, num: top.num },
      opponentName: room.player1Name
    });
  });

  // DISCONNECT
  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    for (const [roomId, room] of rooms.entries()) {
      if (room.players.includes(socket.id)) {
        socket.to(roomId).emit('opponentLeft');
        rooms.delete(roomId);
        console.log(`Room ${roomId} deleted`);
        break;
      }
    }
  });
});

// Auto-retry port if busy
const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running → http://localhost:${server.address().port}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`Port ${PORT} busy → trying ${PORT + 1}`);
    server.listen(PORT + 1, '0.0.0.0');
  }
});