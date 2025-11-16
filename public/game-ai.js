// ============================================
// KADI 254 - AI GAME LOGIC
// ============================================

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");
const cardsCountEl = document.getElementById("cardsCount");
const messageEl = document.getElementById("message");
const hintEl = document.getElementById("hint");
const winScreen = document.getElementById("winScreen");
const winText = document.getElementById("winText");

let CARD_W = 120, CARD_H = 174;
let DECK_X, DECK_Y, TOPCARD_X, TOPCARD_Y, USER_Y, OPP_Y;
let BUTTON_X, BUTTON_Y, BUTTON_W, BUTTON_H;
BUTTON_W = 100;
BUTTON_H = 40;

// Game scores
let playerScore = 0;
let computerScore = 0;

// Dynamic top card position (randomized when card changes)
let topCardOffset = { x: 0, y: 0, rot: 0 };

// Deck scatter positions - precomputed for consistency
const deckScatterOffsets = [
  { x: 0, y: 0, rot: 0 },
  { x: 12, y: 8, rot: -0.15 },
  { x: -8, y: 15, rot: 0.12 },
  { x: 18, y: -5, rot: -0.08 },
  { x: -15, y: 22, rot: 0.2 },
];

// MODIFIED: More dramatic scatter for played cards pile
const playedPileOffsets = [
  { x: 0, y: 0, rot: 0.05 },
  { x: -18, y: 12, rot: -0.22 },
  { x: 25, y: -8, rot: 0.18 },
  { x: -12, y: 25, rot: -0.15 },
  { x: 20, y: 15, rot: 0.25 },
];

// ============================================
// RESIZE & CANVAS SETUP
// ============================================
function resize() {
  canvas.width = innerWidth;
  canvas.height = innerHeight;
  
  // SCALED DOWN: Cards are now 50% of original size
  CARD_W = Math.min(innerWidth * 0.09, 65);
  CARD_H = CARD_W * 1.45;
  
  DECK_X = canvas.width * 0.2 - CARD_W * 1.2;
  DECK_Y = canvas.height * 0.5 - CARD_H * 0.5;
  TOPCARD_X = canvas.width * 0.5 - CARD_W * 0.5;
  TOPCARD_Y = canvas.height * 0.5 - CARD_H * 0.5;
  USER_Y = canvas.height - CARD_H - 20;
  OPP_Y = 20;
  BUTTON_X = canvas.width - 130;
  BUTTON_Y = 20;
}
window.addEventListener("resize", resize);
resize();

// ============================================
// IMAGE LOADING
// ============================================
const deckBack = new Image();
deckBack.src = "images/back_side.png";
const oppBack = new Image();
oppBack.src = "images/back_side.png";

const suits = ["clubs", "diamonds", "hearts", "spades"];
const cardImages = {};
for (let s = 0; s < 4; s++) {
  for (let n = 0; n < 13; n++) {
    const imgNum =
      n === 0
        ? "1"
        : n === 9
        ? "10"
        : n === 10
        ? "11"
        : n === 11
        ? "12"
        : n === 12
        ? "13"
        : `${n + 1}`;
    const img = new Image();
    img.src = `images/${imgNum}_of_${suits[s]}.png`;
    cardImages[`${n}_${s}`] = img;
  }
}

// ============================================
// GAME STATE VARIABLES
// ============================================
let gameState = "loading";
let animationCards = [];
let animationProgress = 0;
let animationTimer = 0;
let dealCounter = 0;
let allCards = [], userCards = [], opponentCards = [], staleCards = [], topCard = null;
let recentPlayedCards = [];
let myTurn = false, shouldEat = false, gameDone = false, isAnimating = false, gameReady = false;
let dragCard = null;

// ============================================
// UTILITY FUNCTIONS
// ============================================
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function playSound(id) {
  try {
    document.getElementById(id).currentTime = 0;
    document.getElementById(id).play();
  } catch (e) {
    console.error(`Error playing sound ${id}:`, e);
  }
}

function vibrate() {
  navigator.vibrate?.([150, 80, 150]);
}

function updateScore() {
  // Match scores (wins)
  scoreEl.innerHTML = `<span style="color:#ff0">Kompyuta: ${computerScore}</span> | <span style="color:#0f0">Wewe: ${playerScore}</span>`;
  
  // Current hand cards count
  if (cardsCountEl) {
    cardsCountEl.innerHTML = `K: ${opponentCards.length} | M: ${userCards.length}`;
  }
}

function showMessage(txt, color = "#0f0", time = 0) {
  messageEl.textContent = txt;
  messageEl.style.borderColor = color;
  
  // Only clear message if time is specified (not 0)
  if (time > 0) {
    clearTimeout(window.msgTimeout);
    window.msgTimeout = setTimeout(() => {
      messageEl.textContent = "";
    }, time);
  }
}

function showHint(show = true) {
  if (show && myTurn && !gameDone && gameState === "ready") {
    hintEl.classList.add("show");
  } else {
    hintEl.classList.remove("show");
  }
}

// ============================================
// DRAWING FUNCTIONS
// ============================================
function drawCard(card, x, y, scale = 1, glow = false, angle = 0, isBack = false) {
  ctx.save();
  ctx.translate(x + (CARD_W * scale) / 2, y + (CARD_H * scale) / 2);
  ctx.rotate(angle);
  if (glow) {
    ctx.shadowColor = "#00ffff";
    ctx.shadowBlur = 80;
  }
  const img = isBack ? oppBack : cardImages[`${card.num}_${card.suit}`] || oppBack;
  try {
    ctx.drawImage(
      img,
      (-CARD_W * scale) / 2,
      (-CARD_H * scale) / 2,
      CARD_W * scale,
      CARD_H * scale
    );
  } catch (e) {
    ctx.fillStyle = "#333";
    ctx.fillRect(
      (-CARD_W * scale) / 2,
      (-CARD_H * scale) / 2,
      CARD_W * scale,
      CARD_H * scale
    );
  }
  ctx.restore();
}

function drawScatteredDeck(x, y) {
  ctx.shadowColor = "#00ff00";
  ctx.shadowBlur = 25;
  ctx.shadowOffsetY = 10;

  deckScatterOffsets.forEach((offset, i) => {
    const drawX = x + offset.x;
    const drawY = y + offset.y;
    const scale = 0.95 - i * 0.03;
    try {
      ctx.save();
      ctx.translate(drawX + (CARD_W * scale) / 2, drawY + (CARD_H * scale) / 2);
      ctx.rotate(offset.rot);
      ctx.drawImage(
        deckBack,
        -(CARD_W * scale) / 2,
        -(CARD_H * scale) / 2,
        CARD_W * scale,
        CARD_H * scale
      );
      ctx.restore();
    } catch (e) {
      ctx.fillStyle = "#222";
      ctx.save();
      ctx.translate(drawX + (CARD_W * scale) / 2, drawY + (CARD_H * scale) / 2);
      ctx.rotate(offset.rot);
      ctx.fillRect(
        -(CARD_W * scale) / 2,
        -(CARD_H * scale) / 2,
        CARD_W * scale,
        CARD_H * scale
      );
      ctx.restore();
    }
  });
}

function drawRecentPlayed() {
  if (recentPlayedCards.length === 0) return;

  // Show last 4-5 cards with dramatic scatter
  const numToShow = Math.min(recentPlayedCards.length, 5);
  const recent = recentPlayedCards.slice(-numToShow);
  
  // Position below top card with more spacing
  const baseX = TOPCARD_X;
  const baseY = TOPCARD_Y;

  recent.forEach((card, i) => {
    const offset = playedPileOffsets[i];
    const drawX = baseX + offset.x;
    const drawY = baseY + offset.y;
    const scale = 1.0 - i * 0.04; // Slight size variation

    ctx.save();
    ctx.translate(drawX + (CARD_W * scale) / 2, drawY + (CARD_H * scale) / 2);
    ctx.rotate(offset.rot);
    
    // Subtle shadow for depth
    ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
    ctx.shadowBlur = 15;
    ctx.shadowOffsetX = 5;
    ctx.shadowOffsetY = 8;
    
    try {
      ctx.drawImage(
        cardImages[`${card.num}_${card.suit}`] || oppBack,
        -(CARD_W * scale) / 2,
        -(CARD_H * scale) / 2,
        CARD_W * scale,
        CARD_H * scale
      );
    } catch (e) {
      ctx.fillStyle = "#444";
      ctx.fillRect(
        -(CARD_W * scale) / 2,
        -(CARD_H * scale) / 2,
        CARD_W * scale,
        CARD_H * scale
      );
    }
    ctx.restore();
  });
}

function drawFan(cards, baseY, isUser = true) {
  if (!cards.length) return;
  const spacing = CARD_W * 0.7;
  const totalW = (cards.length - 1) * spacing + CARD_W;
  const startX = (canvas.width - totalW) / 2;
  const inKadi = isUser && cards.length === 1 && canFinish(cards[0]);
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const x = startX + i * spacing;
    const dy = isUser ? (card.float ? -35 : 0) + (card.ready ? -50 : 0) : 0;
    const angle = (i - (cards.length - 1) / 2) * (isUser ? 0.1 : -0.08);
    const scale = isUser ? 1.0 : 0.85;
    if (inKadi) {
      const pulse = Math.sin(Date.now() / 300) * 0.5 + 0.5;
      ctx.shadowColor = `rgba(255, ${Math.floor(pulse * 100)}, 0, ${0.8 + pulse * 0.2})`;
      ctx.shadowBlur = 50 + pulse * 30;
    } else {
      ctx.shadowColor = card.ready ? "#00ffff" : "rgba(0,255,255,0.5)";
      ctx.shadowBlur = card.ready ? 70 : 30;
    }
    ctx.shadowOffsetY = 15;
    drawCard(card, x, baseY + dy, scale, card.ready || inKadi, angle, !isUser);
  }
}

// ============================================
// ANIMATION UPDATE
// ============================================
function updateAnimation() {
  animationTimer++;
  animationProgress += 0.05;
  
  if (gameState === "reshuffling") {
    let allSettled = true;
    animationCards.forEach((card) => {
      card.x += card.dx;
      card.y += card.dy;
      card.rot += card.drot;
      card.dx *= 0.97;
      card.dy *= 0.97;
      card.drot *= 0.99;
      const dx = DECK_X + CARD_W / 2 - card.x;
      const dy = DECK_Y + CARD_H / 2 - card.y;
      card.dx += dx * 0.03;
      card.dy += dy * 0.03;
      card.alpha = Math.max(0, (card.alpha || 1) - 0.02);
      if (card.alpha > 0.1 || Math.abs(dx) > 10 || Math.abs(dy) > 10) {
        allSettled = false;
      }
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
        card.scale = Math.min(1, (card.scale || 0.8) + 0.01);
      }
    });
    if (animationTimer > 60 || allSettled) {
      gameState = "dealing";
      animationProgress = 0;
      dealCounter = 0;
      animationCards = [];
      isAnimating = false;
    }
  } else if (gameState === "dealing") {
    if (animationProgress > 1.5 && dealCounter < 8 && allCards.length > 0 && animationCards.length === 0) {
      animationProgress = 0;
      dealCounter++;
      const card = allCards.pop();
      const isOpp = dealCounter % 2 === 1;
      const spacing = CARD_W * 0.55;
      const totalW = (Math.floor(dealCounter / 2) - 1) * spacing + CARD_W || CARD_W;
      const targetX = isOpp
        ? (canvas.width - totalW) / 2 + Math.floor((dealCounter - 1) / 2) * spacing
        : (canvas.width - totalW) / 2 + Math.floor(dealCounter / 2) * spacing;
      const targetY = isOpp ? OPP_Y : USER_Y;
      animationCards.push({
        x: DECK_X + CARD_W / 2,
        y: DECK_Y + CARD_H / 2,
        tx: targetX + CARD_W * 0.45,
        ty: targetY + CARD_H * 0.45,
        progress: 0,
        card: { suit: card.suit, num: card.num, float: false, ready: false },
        isBack: isOpp,
        rot: 0,
        alpha: 1,
        scale: 0.9,
      });
      playSound("pick");
    }
    let newAnimationCards = [];
    animationCards.forEach((card) => {
      card.progress += 0.06;
      const ease = 1 - Math.pow(1 - card.progress, 3);
      card.x = card.x + (card.tx - card.x) * ease;
      card.y = card.y + (card.ty - card.y) * ease;
      card.rot = Math.sin(card.progress * Math.PI) * 0.2;
      if (card.progress >= 1) {
        if (card.isBack) {
          if (!opponentCards.some((c) => c.suit === card.card.suit && c.num === card.card.num)) {
            opponentCards.push(card.card);
          }
        } else {
          if (!userCards.some((c) => c.suit === card.card.suit && c.num === card.card.num)) {
            userCards.push(card.card);
          }
        }
      } else {
        newAnimationCards.push(card);
      }
    });
    animationCards = newAnimationCards;
    if (dealCounter >= 8 && animationCards.length === 0 && allCards.length > 0) {
      topCard = allCards.pop();
      animationCards = [{
        x: DECK_X + CARD_W / 2,
        y: DECK_Y + CARD_H / 2,
        tx: TOPCARD_X + CARD_W / 2,
        ty: TOPCARD_Y + CARD_H / 2,
        progress: 0,
        card: topCard,
        isBack: false,
        rot: 0,
        scale: 1.35,
        alpha: 1,
      }];
      gameState = "game_start";
      showMessage("Kadi inaanza!", "#0f0", 4000);
      isAnimating = false;
    }
  } else if (gameState === "game_start") {
    const card = animationCards[0];
    if (!card) {
      gameState = "ready";
      gameReady = true;
      myTurn = Math.random() < 0.5;
      shouldEat = false;
      isAnimating = false;
      animationCards = [];
      showMessage(myTurn ? "ZAMUU YAKO MSEE!" : "Kompyuta anaanza...", myTurn ? "#0f0" : "#ff0", 2000);
      if (!myTurn) setTimeout(aiMove, 1500);
      return;
    }
    card.progress += 0.05;
    const ease = 1 - Math.pow(1 - card.progress, 3);
    card.x = card.x + (card.tx - card.x) * ease;
    card.y = card.y + (card.ty - card.y) * ease;
    card.rot = Math.sin(card.progress * Math.PI) * 0.2;
    card.scale = 1.35 + Math.sin(card.progress * Math.PI) * 0.1;
    if (card.progress >= 1) {
      gameState = "ready";
      gameReady = true;
      myTurn = Math.random() < 0.5;
      shouldEat = false;
      isAnimating = false;
      animationCards = [];
      showMessage(myTurn ? "ZAMUU YAKO MSEE!" : "Kompyuta anaanza...", myTurn ? "#0f0" : "#ff0", 2000);
      if (!myTurn) setTimeout(aiMove, 1500);
    }
  }
}

// ============================================
// MAIN DRAW LOOP
// ============================================
function draw() {
  updateAnimation();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#001a00";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (gameState === "dealing" || gameState === "game_start" || gameState === "ready") {
    drawScatteredDeck(DECK_X, DECK_Y);
  }

  animationCards.forEach((animCard) => {
    ctx.save();
    ctx.globalAlpha = animCard.alpha ?? 1;
    ctx.translate(animCard.x, animCard.y);
    ctx.rotate(animCard.rot || 0);
    ctx.scale(animCard.scale || 0.9, animCard.scale || 0.9);
    ctx.translate(-CARD_W * 0.45, -CARD_H * 0.45);
    try {
      if (animCard.isBack || gameState === "reshuffling") {
        ctx.drawImage(oppBack, 0, 0, CARD_W * 0.9, CARD_H * 0.9);
      } else {
        ctx.drawImage(
          cardImages[`${animCard.card.num}_${animCard.card.suit}`] || oppBack,
          0, 0, CARD_W * 0.9, CARD_H * 0.9
        );
      }
    } catch (e) {
      ctx.fillStyle = "gray";
      ctx.fillRect(0, 0, CARD_W * 0.9, CARD_H * 0.9);
    }
    ctx.restore();
  });

  if (gameState === "dealing" || gameState === "game_start" || gameState === "ready") {
    drawFan(opponentCards, OPP_Y, false);
    drawFan(userCards, USER_Y, true);
  }

  if (gameState === "ready") {
    // Draw played pile FIRST (behind everything)
    drawRecentPlayed();
    
    // Draw glowing top card on top
    ctx.shadowColor = "#ffff00";
    ctx.shadowBlur = 80;
    ctx.shadowOffsetY = 15;
    if (topCard) {
      drawCard(topCard, TOPCARD_X, TOPCARD_Y, 1.15, true);
    }
  }

  if (isAnimating && window.animCards) {
    const p = Math.min(window.animStep / 22, 1);
    const ease = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    const cx = window.animFromX + (window.animToX - window.animFromX) * ease;
    const cy = window.animFromY + (window.animToY - window.animFromY) * ease;
    const showBack = window.animIsUser === false;
    window.animCards.forEach((c, i) => {
      if (showBack) {
        ctx.shadowColor = "#00ff00";
        ctx.shadowBlur = 25;
        ctx.drawImage(oppBack, cx + i * 40, cy + i * 25, CARD_W * 0.95, CARD_H * 0.95);
      } else {
        drawCard(c, cx + i * 40, cy + i * 25, 0.95);
      }
    });
    if (p < 1) {
      window.animStep++;
    } else {
      isAnimating = false;
    }
  }

  ctx.fillStyle = gameState === "ready" ? "#0f0" : "#888";
  ctx.fillRect(BUTTON_X, BUTTON_Y, BUTTON_W, BUTTON_H);
  ctx.fillStyle = "#000";
  ctx.font = "bold 20px Poppins";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Restart", BUTTON_X + BUTTON_W / 2, BUTTON_Y + BUTTON_H / 2);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  
  updateScore();
  showHint();
  requestAnimationFrame(draw);
}

// ============================================
// GAME LOGIC
// ============================================
function startGame() {
  playSound("shuffle");
  allCards = [];
  userCards = [];
  opponentCards = [];
  staleCards = [];
  topCard = null;
  recentPlayedCards = [];
  gameState = "reshuffling";
  animationProgress = 0;
  animationTimer = 0;
  dealCounter = 0;
  isAnimating = true;
  gameDone = false;
  gameReady = false;
  myTurn = false;
  shouldEat = false;
  winScreen.classList.remove("show");

  for (let s = 0; s < 4; s++) {
    for (let n = 0; n < 13; n++) {
      allCards.push({ suit: s, num: n, float: false, ready: false });
    }
  }
  shuffle(allCards);
  animationCards = [];
  for (let i = 0; i < 10; i++) {
    animationCards.push({
      x: DECK_X + CARD_W / 2,
      y: DECK_Y + CARD_H / 2,
      dx: (Math.random() - 0.5) * 6,
      dy: (Math.random() - 0.5) * 6,
      rot: (Math.random() - 0.5) * Math.PI,
      drot: (Math.random() - 0.5) * 0.05,
      scale: 0.8,
      alpha: 1,
    });
  }
}

function dropCards(cards, isUser) {
  if (!isValid(topCard, cards, shouldEat)) {
    playSound("badmove");
    vibrate();
    showMessage("HAPANA! Si halali!", "#f00", 3000);
    userCards.forEach((c) => (c.ready = false));
    return;
  }
  isAnimating = true;
  window.animCards = cards.map((c) => ({ ...c }));
  window.animIsUser = isUser;
  const cardsArray = isUser ? userCards : opponentCards;
  const firstCardIndex = cardsArray.findIndex((c) => c.suit === cards[0].suit && c.num === cards[0].num);
  const spacing = CARD_W * 0.55;
  const totalW = (cardsArray.length - 1) * spacing + CARD_W;
  const startX = (canvas.width - totalW) / 2;
  window.animFromX = startX + firstCardIndex * spacing;
  window.animFromY = isUser ? USER_Y : OPP_Y;
  window.animToX = TOPCARD_X;
  window.animToY = TOPCARD_Y;
  window.animStep = 0;
  playSound("throw");
  showMessage(isUser ? "Poa sana!" : "Kompyuta ametupa!", "#0f0");
  
  setTimeout(() => {
    // Track last 4-5 played cards for scatter display
    if (topCard) recentPlayedCards.push(topCard);
    cards.forEach((card) => recentPlayedCards.push(card));
    recentPlayedCards = recentPlayedCards.slice(-5); // Keep only last 5

    staleCards.push(topCard, ...cards.slice(0, -1));
    topCard = cards[cards.length - 1];

    if (isUser) {
      userCards = userCards.filter((c) => !cards.some((dc) => dc.suit === c.suit && dc.num === c.num));
      userCards.forEach((c) => {
        c.ready = false;
        c.float = false;
      });
    } else {
      opponentCards = opponentCards.filter((c) => !cards.some((dc) => dc.suit === c.suit && dc.num === c.num));
    }

    const isFeederCard = [1, 2].includes(topCard.num);
    if (isQuestion(topCard)) {
      showMessage("FUNIKA HII KADI!", "#ff0"); // Stays until action
    } else if (isFeederCard) {
      showMessage(topCard.num === 1 ? "KULA 2!" : "KULA 3!", "#f00"); // Stays until action
      shouldEat = true;
      myTurn = !isUser;
    } else {
      shouldEat = false;
      myTurn = !isUser;
      showMessage(myTurn ? "Zamuu yako!" : "Kompyuta anacheza...", myTurn ? "#0f0" : "#ff0", 2000);
    }
    if (!myTurn) setTimeout(aiMove, 700);
    checkGameOver();
    isAnimating = false;
  }, 900);
}

function pickCards(num, isUser) {
  if (isAnimating || gameState !== "ready") return;
  isAnimating = true;
  window.animCards = [];
  window.animIsUser = isUser;
  for (let i = 0; i < num && allCards.length > 0; i++) {
    window.animCards.push(allCards.pop());
  }
  const spacing = CARD_W * 0.55;
  const totalW = ((isUser ? userCards.length : opponentCards.length) + num - 1) * spacing + CARD_W;
  const startX = (canvas.width - totalW) / 2;
  const baseCards = isUser ? userCards.length : opponentCards.length;
  window.animFromX = DECK_X;
  window.animFromY = DECK_Y;
  window.animToX = startX + baseCards * spacing;
  window.animToY = isUser ? USER_Y : OPP_Y;
  window.animStep = 0;
  playSound("pick");
  showMessage(isUser ? "Umechukua!" : "Kompyuta anachukua", "#fff");
  
  setTimeout(() => {
    if (isUser) {
      userCards.push(...window.animCards.map((c) => ({ ...c, float: false, ready: false })));
    } else {
      opponentCards.push(...window.animCards.map((c) => ({ ...c })));
    }
    isAnimating = false;
    shouldEat = false;
    myTurn = !isUser;
    
    // Clear persistent messages when picking cards
    messageEl.textContent = "";
    showMessage(myTurn ? "Zamuu yako!" : "Subiri kidogo...", myTurn ? "#0f0" : "#ff0", 2000);
    
    if (!myTurn) setTimeout(aiMove, 800);
    checkGameOver();
  }, 900);
}

function isQuestion(card) {
  return [7, 10, 11, 12].includes(card.num);
}

function canFinish(card) {
  return ![0, 1, 2, 7, 10, 11, 12].includes(card.num);
}

function isValid(top, cards, eat) {
  if (!cards.length) return false;
  let prev = top;
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    const firstTime = i === 0;
    if (eat) {
      if (firstTime) {
        if (c.num !== prev.num && c.num !== 0) return false;
      } else {
        if (c.num !== prev.num) return false;
      }
    } else if (!firstTime) {
      if (isQuestion(prev)) {
        if (!(c.suit === prev.suit || c.num === prev.num || c.num === 0)) return false;
      } else {
        if (c.num !== prev.num) return false;
      }
    } else {
      if (!(c.suit === prev.suit || c.num === prev.num || c.num === 0)) return false;
    }
    prev = c;
  }
  return true;
}

function aiMove() {
  if (gameDone || myTurn || isAnimating || gameState !== "ready") return;
  showMessage("Kompyuta anacheza...", "#ff0");
  setTimeout(() => {
    const best = findBestMoves(topCard, opponentCards, shouldEat);
    if (best.length === 0) {
      const num = shouldEat ? (topCard.num === 1 ? 2 : 3) : 1;
      pickCards(num, false);
    } else {
      dropCards(best, false);
    }
  }, 700 + Math.random() * 500);
}

function findBestMoves(top, cards, eat) {
  const allMoves = [];
  function rec(cur, rem, path) {
    if (path.length) allMoves.push([...path]);
    const nexts = rem.filter((c) => {
      if (eat) {
        return c.num === cur.num || c.num === 0;
      } else if (path.length) {
        if (isQuestion(cur)) {
          return c.suit === cur.suit || c.num === cur.num || c.num === 0;
        } else {
          return c.num === cur.num;
        }
      } else {
        return c.suit === cur.suit || c.num === cur.num || c.num === 0;
      }
    });
    for (let nc of nexts) {
      const newRem = rem.filter((c) => !(c.suit === nc.suit && c.num === nc.num));
      rec(nc, newRem, [...path, nc]);
    }
  }
  rec(top, cards, []);
  let best = [], bestScore = -99999;
  for (let m of allMoves) {
    const remain = cards.filter((c) => !m.some((x) => x.suit === c.suit && x.num === c.num));
    let score = -remain.length * 50;
    const numCounts = {};
    remain.forEach((c) => (numCounts[c.num] = (numCounts[c.num] || 0) + 1));
    Object.values(numCounts).forEach((count) => {
      if (count > 1) score += (count - 1) * 10;
    });
    if (remain.length === 0 && canFinish(m[m.length - 1])) {
      score = 99999;
    }
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }
  if (best.length === 1 && isQuestion(best[0])) {
    if (Math.random() < 0.25) best = [];
  }
  return best;
}

function checkGameOver() {
  if (userCards.length === 0 && canFinish(topCard) && opponentCards.length > 0) {
    playerScore++; // Increment player score
    winText.textContent = "UMESHINDA!!!";
    winText.style.color = "#0f0";
    winScreen.classList.add("show");
    confetti({ particleCount: 600, spread: 140, origin: { y: 0.55 } });
    playSound("win");
    gameDone = true;
    updateScore(); // Update score display
  }
  if (opponentCards.length === 0 && canFinish(topCard) && userCards.length > 0) {
    computerScore++; // Increment computer score
    winText.textContent = "KOMPYUTA AMESHINDA!";
    winText.style.color = "#f00";
    winScreen.classList.add("show");
    gameDone = true;
    updateScore(); // Update score display
  }
}

// ============================================
// INPUT HANDLING
// ============================================
function getHit(x, y) {
  const spacing = CARD_W * 0.7;
  const totalW = (userCards.length - 1) * spacing + CARD_W;
  const startX = (canvas.width - totalW) / 2;
  for (let i = userCards.length - 1; i >= 0; i--) {
    const card = userCards[i];
    const cx = startX + i * spacing;
    const dy = (card.float ? -35 : 0) + (card.ready ? -50 : 0);
    const visibleLeft = cx + CARD_W * 0.1;
    const visibleRight = cx + CARD_W * 0.9;
    if (x > visibleLeft && x < visibleRight && y > USER_Y + dy - 60 && y < USER_Y + dy + CARD_H + 60) {
      return { type: "user", idx: i };
    }
  }
  if (x > DECK_X - 30 && x < DECK_X + CARD_W + 30 && y > DECK_Y - 30 && y < DECK_Y + CARD_H + 30) {
    return { type: "deck" };
  }
  if (x > canvas.width * 0.3 && x < canvas.width * 0.7 && y > canvas.height * 0.3 && y < canvas.height * 0.7) {
    return { type: "top" };
  }
  if (x > BUTTON_X && x < BUTTON_X + BUTTON_W && y > BUTTON_Y && y < BUTTON_Y + BUTTON_H) {
    return { type: "restart" };
  }
  return null;
}

function getInputXY(e) {
  const rect = canvas.getBoundingClientRect();
  if (e.touches && e.touches[0]) {
    return {
      x: (e.touches[0].clientX - rect.left) * (canvas.width / rect.width),
      y: (e.touches[0].clientY - rect.top) * (canvas.height / rect.height),
    };
  } else if (e.changedTouches && e.changedTouches[0]) {
    return {
      x: (e.changedTouches[0].clientX - rect.left) * (canvas.width / rect.width),
      y: (e.changedTouches[0].clientY - rect.top) * (canvas.height / rect.height),
    };
  } else {
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  }
}

function handleStart(x, y) {
  if (!myTurn || isAnimating || gameDone || gameState !== "ready") return;
  const hit = getHit(x, y);
  if (hit?.type === "user") {
    dragCard = {
      card: userCards[hit.idx],
      idx: hit.idx,
      x: x - CARD_W / 2,
      y: y - CARD_H / 2,
    };
    userCards[hit.idx].float = true;
  }
}

function handleMove(x, y) {
  if (!dragCard) return;
  dragCard.x = x - CARD_W / 2;
  dragCard.y = y - CARD_H / 2;
}

function handleEnd(x, y) {
  const hit = getHit(x, y);
  if (hit?.type === "restart") {
    startGame();
    return;
  }
  if (!myTurn || isAnimating || gameDone || gameState !== "ready") return;
  if (hit?.type === "deck") {
    const num = shouldEat ? (topCard.num === 1 ? 2 : 3) : 1;
    pickCards(num, true);
    userCards.forEach((c) => (c.float = false));
    dragCard = null;
    return;
  }
  if (hit?.type === "top") {
    const ready = userCards.filter((c) => c.ready);
    if (ready.length > 0) {
      dropCards(ready.map((c) => ({ suit: c.suit, num: c.num })), true);
    } else {
      showMessage("Chagua kadi ya kutupa!", "#ff0");
    }
    userCards.forEach((c) => (c.float = false));
    dragCard = null;
    return;
  }
  if (dragCard) {
    const dx = x - (dragCard.x + CARD_W / 2);
    if (Math.abs(dx) > 70) {
      const dir = dx > 0 ? 1 : -1;
      const newIdx = dragCard.idx + dir;
      if (newIdx >= 0 && newIdx < userCards.length) {
        [userCards[dragCard.idx], userCards[newIdx]] = [userCards[newIdx], userCards[dragCard.idx]];
      }
    } else {
      userCards[dragCard.idx].ready = !userCards[dragCard.idx].ready;
    }
  }
  userCards.forEach((c) => (c.float = false));
  dragCard = null;
}

// ============================================
// EVENT LISTENERS
// ============================================
canvas.addEventListener("touchstart", (e) => {
  e.preventDefault();
  const { x, y } = getInputXY(e);
  handleStart(x, y);
}, { passive: false });

canvas.addEventListener("touchmove", (e) => {
  e.preventDefault();
  const { x, y } = getInputXY(e);
  handleMove(x, y);
}, { passive: false });

canvas.addEventListener("touchend", (e) => {
  e.preventDefault();
  const { x, y } = getInputXY(e);
  handleEnd(x, y);
}, { passive: false });

canvas.addEventListener("mousedown", (e) => {
  e.preventDefault();
  const { x, y } = getInputXY(e);
  handleStart(x, y);
});

canvas.addEventListener("mousemove", (e) => {
  const { x, y } = getInputXY(e);
  handleMove(x, y);
});

canvas.addEventListener("mouseup", (e) => {
  const { x, y } = getInputXY(e);
  handleEnd(x, y);
});

// ============================================
// GAME INITIALIZATION
// ============================================
function initGame() {
  console.log("Initializing game...");
  startGame();
}

let loaded = 0;
const expectedImages = Object.keys(cardImages).length + 2;

function imgLoaded() {
  loaded++;
  console.log(`Images loaded: ${loaded}/${expectedImages}`);
  if (loaded >= expectedImages) {
    console.log("All images loaded, starting game");
    resize();
    initGame();
    draw();
  }
}

deckBack.onload = imgLoaded;
oppBack.onload = imgLoaded;
deckBack.onerror = oppBack.onerror = () => {
  console.error("Error loading back_side.png");
  imgLoaded();
};

Object.values(cardImages).forEach((img, i) => {
  img.onload = imgLoaded;
  img.onerror = () => {
    console.error(`Error loading card image ${i}`);
    imgLoaded();
  };
});

setTimeout(() => {
  if (gameState === "loading") {
    console.warn("Image load timeout — starting game anyway.");
    console.log(`Loaded ${loaded}/${expectedImages} images`);
    resize();
    initGame();
    draw();
  }
}, 1500);