// GRAN CARRERA LOCA · © 2026 Creado y diseñado por FerLudu · Todos los derechos reservados
const express = require('express'), http = require('http'), { Server } = require('socket.io');
const app = express(), srv = http.createServer(app), io = new Server(srv);
app.use(express.static(__dirname + '/public'));

const TRACK = 8800, HZ = 30, DT = 1 / HZ, MAXV = 104;
const ITEMS = ['banana', 'ball', 'sofa', 'stickers', 'rocket', 'magnet'];
const BN = ['Robo-Pepe', 'Churri-Bot', 'Doña Turbo', 'Kevin404', 'Paco Prisas', 'Bot-ella', 'Míster Chispas', 'Lola Rayo', 'Tío Cohete', 'Super Nacho'];
const rooms = {};
const rnd = (a, b) => a + Math.random() * (b - a), cl = (v, a, b) => Math.max(a, Math.min(b, v));
const pub = p => ({ id: p.id, n: p.n, av: p.av });
const getRoom = id => rooms[id] || (rooms[id] = { id, players: {}, screens: new Set(), state: 'lobby', lobbyEnd: null, replay: false, t: 0, obs: [], items: [], res: null, endAt: 0 });
const ev = (r, k, id, x) => io.to(r.id).emit('ev', Object.assign({ k, id }, x));
const newP = (id, n, av, bot) => ({ id, n, av, bot, x: 300, y: 0, z: 0, vz: 0, v: 0, stun: 0, boost: 0, rocket: 0, stick: 0, imm: 0, mud: 0, item: null, fin: null, sk: bot ? rnd(.9, 1.04) : 1, in: { dx: 0, dy: 0, j: 0, u: 0 } });

function makeTrack() {
  const o = [];
  for (let y = 700; y < TRACK - 500; y += rnd(110, 180)) {
    const q = Math.random(), x = rnd(70, 530);
    if (q < .3) o.push({ t: 'mud', x, y, w: 130, h: 90 });
    else if (q < .6) o.push({ t: 'hurdle', x: rnd(130, 470), y, w: 200, h: 16 });
    else if (q < .8) o.push({ t: 'turbo', x, y, w: 80, h: 60 });
    else o.push({ t: 'tramp', x, y, w: 90, h: 46 });
  }
  for (let y = 1000; y < TRACK - 600; y += 860) [130, 300, 470].forEach(x => o.push({ t: 'box', x, y, w: 40, h: 40, cd: {} }));
  return o;
}
const stat = r => r.obs.filter(o => o.t !== 'sofa').map(o => ({ t: o.t, x: o.x, y: o.y, w: o.w, h: o.h }));
const racePkt = r => ({ track: TRACK, obs: stat(r), ps: Object.values(r.players).map(pub) });

function resetLobby(r) {
  for (const id in r.players) { const p = r.players[id]; if (!p.bot) { const s = io.sockets.sockets.get(id); s && s.leave(r.id); } delete r.players[id]; }
  Object.assign(r, { state: 'lobby', lobbyEnd: null, replay: true, obs: [], items: [], res: null, endAt: 0 });
}
function startRace(r) {
  r.state = 'race'; r.t = -3.5; r.endAt = 0; r.obs = makeTrack(); r.items = []; r.res = null;
  let n = Object.keys(r.players).length, b = 0;
  while (n < 8) { const id = 'bot' + b; r.players[id] = newP(id, BN[b % BN.length], Math.random() * 8 | 0, true); b++; n++; }
  Object.values(r.players).forEach((p, k) => Object.assign(p, { x: 55 + (k % 8) * 70, y: -Math.floor(k / 8) * 40, v: 0, z: 0, vz: 0, stun: 0, boost: 0, rocket: 0, stick: 0, imm: 0, mud: 0, fin: null, item: null }));
  io.to(r.id).emit('race', racePkt(r));
}
function endRace(r) {
  r.state = 'done';
  const all = Object.values(r.players).sort((a, b) => (a.fin !== null && b.fin !== null) ? a.fin - b.fin : a.fin !== null ? -1 : b.fin !== null ? 1 : b.y - a.y);
  r.res = all.map(p => ({ id: p.id, n: p.n, av: p.av, t: p.fin === null ? null : +p.fin.toFixed(2), bot: p.bot }));
  io.to(r.id).emit('end', r.res);
}
function hit(r, p, sec) { p.stun = sec; p.imm = sec + .8; p.v = 0; ev(r, 'crash', p.id); }

function use(r, p) {
  const k = p.item; if (!k || p.stun > 0 || p.fin !== null) return; p.item = null;
  const ps = Object.values(r.players).filter(q => q !== p && q.fin === null);
  const ahead = ps.filter(q => q.y > p.y).sort((a, b) => a.y - b.y)[0];
  if (k === 'banana') { r.items.push({ k, x: p.x, y: p.y - 35, own: p.id, born: r.t }); ev(r, 'drop', p.id); }
  else if (k === 'ball') { r.items.push({ k, x: p.x, y: p.y + 30, own: p.id, tgt: ahead && ahead.id, born: r.t }); ev(r, 'ball', p.id); }
  else if (k === 'sofa') { const L = ps.sort((a, b) => b.y - a.y)[0] || p; r.obs.push({ t: 'sofa', x: cl(L.x, 150, 450), y: L.y + 240, w: 300, h: 50, born: r.t, ttl: r.t + 7 }); ev(r, 'sofa', p.id); }
  else if (k === 'stickers') { const ids = []; ps.forEach(q => { if (Math.abs(q.y - p.y) < 760) { q.stick = 3; ids.push(q.id); } }); ev(r, 'stick', p.id, { ids }); }
  else if (k === 'rocket') { p.rocket = 3; p.stun = 0; ev(r, 'rocket', p.id); }
  else if (k === 'magnet') {
    if (ahead) { [p.x, ahead.x] = [ahead.x, p.x]; [p.y, ahead.y] = [ahead.y, p.y]; ahead.stun = .7; ahead.v = 0; ev(r, 'magnet', p.id, { to: ahead.id }); }
    else p.boost = 1.2;
  }
}

function bot(r, p) {
  const I = p.in; I.dx = 0; I.dy = .4; let hz = null, bx = null;
  for (const o of r.obs) {
    const d = o.y - p.y; if (d < -5 || d > 300) continue;
    if (o.t === 'box') { if (!p.item && (o.cd[p.id] || 0) < r.t && Math.abs(o.x - p.x) < 160 && (!bx || d < bx.y - p.y)) bx = o; }
    else if (['hurdle', 'mud', 'sofa'].includes(o.t) && Math.abs(o.x - p.x) < o.w / 2 + 22 && (!hz || d < hz.y - p.y)) hz = o;
  }
  if (hz) {
    const d = hz.y - p.y;
    if (hz.t === 'hurdle' && d < 110) { if (p.z === 0 && Math.random() < .85) I.j = 1; }
    else I.dx = (p.x >= hz.x ? 1 : -1) * (Math.random() < .97 ? 1 : 0);
  } else if (bx) I.dx = cl((bx.x - p.x) / 20, -1, 1);
  if (p.item && Math.random() < .025) I.u = 1;
}

function step(r) {
  r.t += DT; if (r.t < 0) return;
  r.obs = r.obs.filter(o => o.t !== 'sofa' || o.ttl > r.t);
  const ps = Object.values(r.players);
  for (const p of ps) {
    const I = p.in; if (p.bot && p.fin === null) bot(r, p);
    for (const k of ['stun', 'boost', 'rocket', 'stick', 'imm', 'mud']) p[k] = Math.max(0, p[k] - DT);
    if (p.z > 0 || p.vz > 0) { p.vz -= 45 * DT; p.z += p.vz * DT; if (p.z <= 0) { p.z = 0; p.vz = 0; } }
    if (p.fin !== null) { p.v *= .96; p.y += p.v * DT; I.j = I.u = 0; continue; }
    if (I.u) { use(r, p); I.u = 0; }
    if (I.j) { if (p.z === 0 && p.stun <= 0) { p.vz = 17; p.z = .01; ev(r, 'jump', p.id); } I.j = 0; }
    let tv = MAXV * p.sk * (1 + .18 * I.dy);
    if (p.mud > 0) tv *= .45; if (p.boost > 0) tv = 190; if (p.rocket > 0) tv = 210; if (p.stun > 0) tv = 0;
    p.v += (tv - p.v) * Math.min(1, (p.stun > 0 ? 9 : 3) * DT); p.y += p.v * DT;
    if (p.stun <= 0) p.x += I.dx * 170 * DT * (p.rocket > 0 ? .6 : 1);
    p.x = cl(p.x, 25, 575);
    for (const o of r.obs) {
      if (Math.abs(p.x - o.x) > o.w / 2 + 10 || Math.abs(p.y - o.y) > o.h / 2 + 8) continue;
      if (o.t === 'mud') { if (p.z < 1 && !p.rocket) p.mud = .25; }
      else if (o.t === 'turbo') { if (p.boost < 1) ev(r, 'turbo', p.id); p.boost = 1.4; }
      else if (o.t === 'tramp') { if (p.z < 1) { p.vz = 30; p.z = .01; ev(r, 'tramp', p.id); } }
      else if (o.t === 'hurdle') { if (p.z < 1.5 && !p.rocket && p.imm <= 0) hit(r, p, .8); }
      else if (o.t === 'sofa') { if (r.t > o.born + .6 && p.z < 1.5 && !p.rocket && p.imm <= 0) hit(r, p, 1.2); }
      else if (o.t === 'box') { if (!p.item && (o.cd[p.id] || 0) < r.t) { o.cd[p.id] = r.t + 5; p.item = ITEMS[Math.random() * 6 | 0]; ev(r, 'box', p.id); } }
    }
    if (p.y >= TRACK) { p.fin = r.t; ev(r, 'finish', p.id); }
  }
  r.items = r.items.filter(it => {
    const age = r.t - it.born;
    if (it.k === 'banana') {
      if (age > 25) return false;
      for (const p of ps) {
        if (p.fin !== null || p.z > 1.5 || p.stun > 0 || p.rocket > 0) continue;
        if (p.id === it.own && age < 1.2) continue;
        if (Math.abs(p.x - it.x) < 26 && Math.abs(p.y - it.y) < 22) { p.stun = 2; p.imm = 3; p.v = 0; ev(r, 'banana', p.id); return false; }
      }
      return true;
    }
    if (age > 4) return false;
    it.y += 350 * DT; const t = r.players[it.tgt]; if (t) it.x += cl(t.x - it.x, -260 * DT, 260 * DT);
    for (const p of ps) {
      if (p.id === it.own || p.fin !== null || p.z > 3) continue;
      if (Math.abs(p.x - it.x) < 24 && Math.abs(p.y - it.y) < 24) { p.stun = 1.6; p.imm = 2; p.v = 0; p.vz = 24; p.z = .01; ev(r, 'boom', p.id); return false; }
    }
    return it.y < TRACK + 200;
  });
}
function pkt(r) {
  const R1 = v => Math.round(v * 10) / 10;
  return {
    t: +r.t.toFixed(2),
    p: Object.values(r.players).map(p => [p.id, R1(p.x), R1(p.y), R1(p.z), p.stun > 0 ? 1 : 0, p.rocket > 0 ? 2 : p.boost > 0 ? 1 : 0, p.fin === null ? 0 : 1, p.stick > 0 ? 1 : 0, ITEMS.indexOf(p.item) + 1]),
    i: r.items.map(i => [i.k, R1(i.x), R1(i.y)]),
    f: r.obs.filter(o => o.t === 'sofa').map(o => [o.x, o.y, +(r.t - o.born).toFixed(2)])
  };
}

let tk = 0;
setInterval(() => {
  tk++;
  for (const id in rooms) {
    const r = rooms[id], hs = Object.values(r.players).filter(p => !p.bot);
    if (!hs.length && !r.screens.size) { delete rooms[id]; continue; }
    if (r.state === 'lobby') {
      if (r.lobbyEnd && hs.length && Date.now() >= r.lobbyEnd) startRace(r);
      else if (tk % 15 === 0) io.to(id).emit('lobby', { l: r.lobbyEnd ? Math.max(0, Math.ceil((r.lobbyEnd - Date.now()) / 1000)) : null, ps: hs.map(pub) });
    } else if (r.state === 'race') {
      step(r); if (tk % 2 === 0) io.to(id).emit('s', pkt(r));
      const all = Object.values(r.players), done = (hs.length ? hs : all).every(p => p.fin !== null);
      if (done && !r.endAt) r.endAt = r.t + 3;
      if (r.t >= 140 || (r.endAt && r.t >= r.endAt)) endRace(r);
    }
  }
}, 1000 / HZ);

io.on('connection', s => {
  let room = null, screenRoom = null;
  const leave = () => {
    if (room) { delete room.players[s.id]; s.leave(room.id); room = null; }
    if (screenRoom) { screenRoom.screens.delete(s.id); s.leave(screenRoom.id); screenRoom = null; }
  };
  s.on('join', d => {
    d = d || {}; leave();
    const r = getRoom(String(d.sala || 'publica').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24) || 'publica');
    if (r.state === 'done') resetLobby(r);
    room = r; s.join(r.id);
    const p = newP(s.id, String(d.n || 'Corredor').slice(0, 14), cl(parseInt(d.av) || 0, 0, 7), false);
    r.players[s.id] = p;
    if (r.state === 'lobby') { if (!r.lobbyEnd) r.lobbyEnd = Date.now() + (r.replay ? 10000 : 30000); }
    else { p.x = rnd(60, 540); s.emit('race', racePkt(r)); io.to(r.id).emit('roster', [pub(p)]); }
  });
  s.on('screen', d => {
    leave(); const r = getRoom(String((d && d.sala) || 'publica').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24) || 'publica');
    screenRoom = r; r.screens.add(s.id); s.join(r.id);
    if (r.state === 'race') s.emit('race', racePkt(r)); else if (r.state === 'done') s.emit('end', r.res);
  });
  s.on('start', () => { if (room && room.state === 'lobby' && room.players[s.id]) startRace(room); });
  s.on('i', d => { const p = room && room.players[s.id]; if (p && d) { p.in.dx = cl(+d.dx || 0, -1, 1); p.in.dy = cl(+d.dy || 0, -1, 1); } });
  s.on('j', () => { const p = room && room.players[s.id]; if (p) p.in.j = 1; });
  s.on('u', () => { const p = room && room.players[s.id]; if (p) p.in.u = 1; });
  s.on('disconnect', leave);
});
srv.listen(process.env.PORT || 3000, () => console.log('GRAN CARRERA LOCA en http://localhost:' + (process.env.PORT || 3000)));
