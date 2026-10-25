const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;
const rooms = new Map();
const MAX_PLAYERS = 5;
const W = 1000, H = 700;

function code() {
  return crypto.randomBytes(3).toString("hex").toUpperCase();
}
function safeName(s) {
  return String(s || "Player").replace(/[<>]/g, "").trim().slice(0, 16) || "Player";
}
function publicRoom(room) {
  return {
    code: room.code, status: room.status, players: [...room.players.values()].map(p => ({
      id: p.id, name: p.name, color: p.color, alive: p.alive, ready: p.ready,
      x: p.x, y: p.y, hp: p.hp, kills: p.kills, weapon: p.weapon
    })),
    pickups: room.pickups, zone: room.zone, winner: room.winner,
    startedAt: room.startedAt, message: room.message
  };
}
function emitRoom(room) { io.to(room.code).emit("state", publicRoom(room)); }
function makePickup(room) {
  const types = ["health", "gun", "sword", "boost"];
  return { id: crypto.randomBytes(4).toString("hex"), type: types[Math.floor(Math.random()*types.length)],
    x: 50 + Math.random()*(W-100), y: 50 + Math.random()*(H-100) };
}
function startGame(room) {
  room.status = "playing"; room.winner = null; room.message = "Survive. The safe zone is shrinking!";
  room.startedAt = Date.now(); room.zone = { x: W/2, y: H/2, r: 315 };
  room.pickups = Array.from({length: 9}, () => makePickup(room));
  let i = 0;
  for (const p of room.players.values()) {
    const a = (Math.PI*2*i++)/room.players.size;
    p.x = W/2 + Math.cos(a)*220; p.y = H/2 + Math.sin(a)*170;
    p.hp = 100; p.alive = true; p.kills = 0; p.weapon = "blaster"; p.ready = true;
    p.lastAttack = 0; p.boostUntil = 0;
  }
  emitRoom(room);
}
function finishIfNeeded(room) {
  const alive = [...room.players.values()].filter(p => p.alive);
  if (room.status === "playing" && alive.length <= 1) {
    room.status = "finished"; room.winner = alive[0]?.name || "Nobody";
    room.message = alive[0] ? `${alive[0].name} is the last survivor!` : "Everyone was eliminated!";
    emitRoom(room);
  }
}
io.on("connection", socket => {
  socket.on("createRoom", ({name} = {}) => {
    let c; do { c = code(); } while (rooms.has(c));
    const room = { code: c, status: "lobby", players: new Map(), pickups: [], zone: {x:W/2,y:H/2,r:315}, winner:null, startedAt:null, message:"Waiting for players" };
    rooms.set(c, room);
    addPlayer(socket, room, name);
  });
  socket.on("joinRoom", ({code: c, name} = {}) => {
    c = String(c || "").trim().toUpperCase();
    const room = rooms.get(c);
    if (!room) return socket.emit("errorMessage", "Room not found. Check the code.");
    if (room.status !== "lobby") return socket.emit("errorMessage", "This match has already started.");
    if (room.players.size >= MAX_PLAYERS) return socket.emit("errorMessage", "This room is full (5 players maximum).");
    addPlayer(socket, room, name);
  });
  function addPlayer(socket, room, name) {
    if (socket.data.room) return socket.emit("errorMessage", "You are already in a room. Refresh to leave.");
    const colors = ["#54e0ff","#ff5b70","#ffd166","#b28dff","#65e58a"];
    const p = { id: socket.id, name: safeName(name), color: colors[room.players.size % colors.length],
      x: 100, y: 100, hp: 100, alive: true, ready: false, kills: 0, weapon: "blaster", lastAttack: 0, boostUntil: 0 };
    room.players.set(socket.id, p); socket.join(room.code); socket.data.room = room.code;
    socket.emit("joined", {code: room.code, id: socket.id});
    room.message = `${p.name} joined (${room.players.size}/${MAX_PLAYERS})`;
    emitRoom(room);
  }
  socket.on("ready", () => {
    const room = rooms.get(socket.data.room); if (!room || room.status !== "lobby") return;
    const p = room.players.get(socket.id); if (!p) return;
    p.ready = true;
    if (room.players.size === MAX_PLAYERS && [...room.players.values()].every(x => x.ready)) startGame(room);
    else { room.message = `${p.name} is ready. ${room.players.size}/5 players joined.`; emitRoom(room); }
  });
  socket.on("move", ({dx,dy} = {}) => {
    const room = rooms.get(socket.data.room); if (!room || room.status !== "playing") return;
    const p = room.players.get(socket.id); if (!p || !p.alive) return;
    dx = Math.max(-1, Math.min(1, Number(dx)||0)); dy = Math.max(-1, Math.min(1, Number(dy)||0));
    const len = Math.hypot(dx,dy) || 1, speed = Date.now() < p.boostUntil ? 5.1 : 3.3;
    p.x = Math.max(18, Math.min(W-18, p.x + dx/len*speed));
    p.y = Math.max(18, Math.min(H-18, p.y + dy/len*speed));
    for (const item of room.pickups) {
      if (Math.hypot(p.x-item.x,p.y-item.y) < 27) {
        if (item.type === "health") p.hp = Math.min(100, p.hp+35);
        if (item.type === "gun") p.weapon = "blaster";
        if (item.type === "sword") p.weapon = "sword";
        if (item.type === "boost") p.boostUntil = Date.now()+5000;
        room.pickups = room.pickups.filter(x => x.id !== item.id);
        room.pickups.push(makePickup(room));
        room.message = `${p.name} collected ${item.type}!`;
      }
    }
  });
  socket.on("attack", ({targetId} = {}) => {
    const room = rooms.get(socket.data.room); if (!room || room.status !== "playing") return;
    const p = room.players.get(socket.id), target = room.players.get(targetId);
    if (!p || !p.alive || !target || !target.alive || p.id === target.id) return;
    const now = Date.now(); if (now - p.lastAttack < 650) return; p.lastAttack = now;
    const range = p.weapon === "sword" ? 72 : 235;
    if (Math.hypot(p.x-target.x,p.y-target.y) > range) return;
    target.hp -= p.weapon === "sword" ? 32 : 18;
    room.message = `${p.name} hit ${target.name}!`;
    if (target.hp <= 0) { target.hp = 0; target.alive = false; p.kills++; room.message = `${target.name} was eliminated by ${p.name}!`; }
    finishIfNeeded(room); emitRoom(room);
  });
  socket.on("disconnect", () => {
    const room = rooms.get(socket.data.room); if (!room) return;
    const p = room.players.get(socket.id);
    if (p) {
      room.players.delete(socket.id);
      if (room.status === "playing") finishIfNeeded(room);
      room.message = `${p.name} left the room`;
      if (!room.players.size) rooms.delete(room.code); else emitRoom(room);
    }
  });
});
setInterval(() => {
  for (const room of rooms.values()) {
    if (room.status !== "playing") continue;
    const elapsed = (Date.now()-room.startedAt)/1000;
    room.zone.r = Math.max(65, 315 - elapsed*2.15);
    for (const p of room.players.values()) {
      if (!p.alive) continue;
      const d = Math.hypot(p.x-room.zone.x,p.y-room.zone.y);
      if (d > room.zone.r) {
        p.hp -= 2.5;
        if (p.hp <= 0) { p.hp = 0; p.alive = false; room.message = `${p.name} was lost in the storm!`; }
      }
    }
    if (Math.random() < 0.045 && room.pickups.length < 12) room.pickups.push(makePickup(room));
    finishIfNeeded(room); emitRoom(room);
  }
}, 100);
server.listen(PORT, () => console.log(`Survival Arena running on port ${PORT}`));
