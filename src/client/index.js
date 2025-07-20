import { signal, computed, effect, dom, on } from "./munifw.js";

import { clientChannel } from "./channel.js";

import { Grid } from "./grid.js";

const SIZE = 2000;
const cellSize = 24;

const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const scale = (a, s = 1) => [a[0] * s, a[1] * s];

function generateTiles() {
  const canvas = dom("canvas", { width: cellSize * 4, height: cellSize });
  const ctx = canvas.getContext("2d");

  // normal cell
  ctx.save();
  ctx.fillStyle = "#ccc";
  ctx.fillRect(0, 0, cellSize, cellSize);
  ctx.fillStyle = "#eee";
  ctx.fillRect(0, 0, 2, cellSize - 2);
  ctx.fillRect(0, 0, cellSize - 2, 2);
  ctx.fillStyle = "#888";
  ctx.fillRect(2, cellSize - 2, cellSize - 2, 2);
  ctx.fillRect(cellSize - 2, 2, 2, cellSize - 2);
  ctx.restore();

  // empty cleared cell
  ctx.save();
  ctx.translate(cellSize, 0);
  ctx.fillStyle = "#aaa";
  ctx.fillRect(0, 0, cellSize, cellSize);
  ctx.fillStyle = "#ccc";
  ctx.fillRect(2, 2, cellSize - 2, cellSize - 2);
  ctx.restore();

  return canvas;
}

function drawTile(tileset, tileSize, tile, destinationCtx) {
  destinationCtx.drawImage(
    tileset,
    tile * tileSize,
    0,
    tileSize,
    tileSize,
    0,
    0,
    tileSize,
    tileSize
  );
}

async function start() {
  let screenWidth = signal(0);
  let screenHeight = signal(0);
  let viewportWidth = computed(() => Math.ceil(screenWidth.value / cellSize));
  let viewportHeight = computed(() => Math.ceil(screenHeight.value / cellSize));

  const tilesCanvas = generateTiles();

  const position = signal([0, 0]);
  const cursorCell = signal(null);

  const myRect = computed(() => {
    let x = (position.value[0] / cellSize) | 0;
    let y = (position.value[1] / cellSize) | 0;
    return [
      [x, y],
      [x + viewportWidth.value, y + viewportHeight.value],
    ];
  });

  function resizeScreen() {
    screenWidth.value = window.innerWidth;
    screenHeight.value = window.innerHeight;
  }

  resizeScreen();

  const grid = signal(null);
  const players = signal([]);
  let playerId;

  const disconnectChannel = clientChannel("/live", (msg) => {
    console.log(JSON.stringify(msg).length);
    console.log(msg);
    if (msg.type === "grid") {
      grid.value = Grid.deserialize(msg);
    }
    if (msg.type === "grid-rect") {
      console.log(JSON.stringify(msg).length);
      grid.value.updateRect(msg.data);
      grid.touch();
    }
    if (msg.type === "players") {
      players.value = msg.players;
    }
    if (msg.type === "playerId") {
      playerId = msg.id;
    }
  });

  const canvas = dom("canvas", {
    id: "grid",
    width: screenWidth,
    height: screenHeight,
  });
  document.body.append(canvas);

  effect(() => {
    // console.log(
    //   screenHeight.value,
    //   screenWidth.value,
    //   canvas.width,
    //   canvas.height,
    //   position.value,
    //   cursorCell.value
    // );
  });

  function draw() {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let pos = position.value;
    let gridX = (pos[0] / cellSize) | 0;
    let gridY = (pos[1] / cellSize) | 0;
    let offsetX = pos[0] % cellSize;
    let offsetY = pos[1] % cellSize;
    let vw = viewportWidth.value;
    let vh = viewportHeight.value;
    let cursor = cursorCell.value;
    let g = grid.value;
    let p = players.value;
    if (!g) {
      console.log("no grid!");
      return;
    }
    for (let x = 0; x <= vw; x++) {
      for (let y = 0; y <= vh; y++) {
        let cellX = gridX + x;
        let cellY = gridY + y;
        if (cellX > SIZE - 1 || cellY > SIZE - 1) continue;
        const cell = g.at(cellX, cellY);

        ctx.save();
        ctx.translate(x * cellSize - offsetX, y * cellSize - offsetY);

        if (!cell || !cell?.dug) {
          drawTile(tilesCanvas, cellSize, 0, ctx);
        }

        if (cell?.dug) {
          drawTile(tilesCanvas, cellSize, 1, ctx);

          ctx.font = "bold 16px sans-serif";
          ctx.fillStyle = "#000";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";

          if (cell.mine) {
            ctx.fillText("💣", cellSize / 2, cellSize / 2 + 2);
          }
          if (cell.count) {
            ctx.fillText(cell.count, cellSize / 2, cellSize / 2 + 2);
          }
        }

        if (cell?.marked) {
          drawTile(tilesCanvas, cellSize, 0, ctx);

          ctx.font = "bold 13px sans-serif";
          ctx.fillStyle = "#000";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";

          ctx.fillText("🚩", cellSize / 2, cellSize / 2);
        }

        if (cell?.boom) {
          if (cell.mine) {
            ctx.font = "bold 13px sans-serif";
            ctx.fillStyle = "#000";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("💣", cellSize / 2, cellSize / 2 + 2);
          }
          ctx.fillStyle = "rgba(192, 0, 0, .5)";
          ctx.fillRect(0, 0, cellSize, cellSize);
        }

        ctx.restore();
      }
    }
    for (let [id, position] of p) {
      if (id === playerId || !position) continue;
      const [px, py] = position;
      // if (px < gridX || py < gridY || px > gridX + vw || py > gridY + vh) {
      //   continue;
      // }
      ctx.save();
      ctx.translate(
        (px - gridX) * cellSize - offsetX,
        (py - gridY) * cellSize - offsetY
      );
      ctx.strokeStyle = `hsla(${id * 360 * 0.618}, 90%, 60%, .75)`;
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, cellSize - 2, cellSize - 2);
      ctx.restore();
    }
    if (cursor) {
      const [px, py] = cursor;
      ctx.save();
      ctx.translate(
        (px - gridX) * cellSize - offsetX,
        (py - gridY) * cellSize - offsetY
      );
      ctx.strokeStyle = "blue";
      ctx.lineWidth = 4;
      ctx.strokeRect(0, 0, cellSize - 1, cellSize - 1);
      ctx.restore();
    }
  }

  const projectMouse = (e) =>
    scale(add([e.clientX, e.clientY], position.value), 1 / cellSize);

  // allow right click
  on(canvas, "contextmenu", (e) => e.preventDefault());

  on(canvas, "auxclick", (e) => {
    e.preventDefault();
    let gridPos = projectMouse(e);
    if (e.button === 2) {
      // right click
      fetch("/mark", {
        method: "post",
        body: JSON.stringify(gridPos),
        headers: {
          "content-type": "application/json",
        },
      });
    }
  });

  on(canvas, "click", (e) => {
    e.preventDefault();
    let gridPos = projectMouse(e);
    fetch("/click", {
      method: "post",
      body: JSON.stringify(gridPos),
      headers: {
        "content-type": "application/json",
      },
    });
  });

  const _sendPosition = () => {
    if (!playerId) return;
    fetch("/player", {
      method: "post",
      body: JSON.stringify({
        id: playerId,
        position: cursorCell.value,
        rect: myRect.value,
      }),
      headers: {
        "content-type": "application/json",
      },
    });
  };

  let positionTimeout;
  const sendPosition = () => {
    if (!positionTimeout) {
      positionTimeout = setTimeout(() => {
        _sendPosition();
        positionTimeout = 0;
      }, 250);
    }
  };

  effect(() => {
    sendPosition(cursorCell.value, myRect.value);
  });

  on(canvas, "mousemove", (e) => {
    let gridPos = projectMouse(e);
    cursorCell.value = [gridPos[0] | 0, gridPos[1] | 0];
  });

  on(canvas, "wheel", (e) => {
    position.value = [
      Math.min(
        SIZE * cellSize - screenWidth.value,
        Math.max(0, position.value[0] + e.deltaX)
      ),
      Math.min(
        SIZE * cellSize - screenHeight.value,
        Math.max(0, position.value[1] + e.deltaY)
      ),
    ];
  });

  on(window, "resize", resizeScreen);

  effect(draw);
}

start().catch((e) => console.error(e));
