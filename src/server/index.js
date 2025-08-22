import express from "express";
import * as path from "node:path";
import { serverChannel } from "../shared/channel.js";
import { Grid } from "../shared/grid.js";
import { Player } from "../shared/player.js";

const app = express();

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const clientDir = path.join(__dirname, "../client");
const sharedDir = path.join(__dirname, "../shared");

app.use(express.static(clientDir));
app.use(express.static(sharedDir));
app.use(express.json());

const SIZE = 1000;
const mineCount = (SIZE * SIZE) / 10;

const grid = new Grid(SIZE);
const players = new Map();

const expandRect = (r, amount) => [
  [Math.max(0, r[0][0] - amount), Math.max(0, r[0][1] - amount)],
  [Math.min(SIZE - 1, r[1][0] + amount), Math.min(SIZE - 1, r[1][1] + amount)],
];

for (let i = 0; i < mineCount; i++) {
  grid.set(Math.floor(Math.random() * SIZE), Math.floor(Math.random() * SIZE), {
    mine: true,
    marked: false,
  });
}

app.get("/", (req, res) => {
  res.sendFile(path.join(clientDir, "index.html"));
});

const [sseHandler, sendSSE] = serverChannel({
  sendLastOnConnect: true,
  onConnect: (id, send) => {
    send({
      type: "playerId",
      id,
    });
    players.set(id, new Player(id, send));
    send({
      type: "grid",
      ...grid.serialize(),
    });
  },
  onDisconnect: (id) => {
    players.delete(id);
    sendPlayers();
  },
});

const sendPlayers = () =>
  sendSSE({
    type: "players",
    players: [...players].map((p) => [p[0], p[1].position]),
  });

// send each player the segment of the grid in their viewport
const sendGridUpdate = () => {
  players.forEach((player) => {
    if (player.rect) {
      player.send({
        type: "grid-rect",
        data: grid.serializeRect(expandRect(player.rect, 20)),
      });
    }
  });
};

app.use("/live", sseHandler);

app.post("/click", (req, res) => {
  const cellX = req.body[0] | 0;
  const cellY = req.body[1] | 0;
  grid.floodDig(cellX, cellY);
  sendGridUpdate();

  res.end();
});

app.post("/mark", (req, res) => {
  const cellX = req.body[0] | 0;
  const cellY = req.body[1] | 0;
  grid.mark(cellX, cellY);
  sendGridUpdate();
  res.end();
});

app.post("/player", (req, res) => {
  const { id, position, rect } = req.body;
  const player = players.get(id);
  if (!player) return;
  let oldRect = player.rect;
  player.setPosition(position);
  player.setRect(rect);
  sendPlayers();
  if (JSON.stringify(oldRect) !== JSON.stringify(rect)) {
    player.send({
      type: "grid-rect",
      data: grid.serializeRect(expandRect(rect, 20)),
    });
  }
  res.end();
});

const PORT = process.env.PORT || 8086;
app.listen(PORT, () => {
  console.log(`now serving on port ${PORT}`);
});
