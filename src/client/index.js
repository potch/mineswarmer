import { signal, computed, effect, dom, on } from "./munifw.js";

import { clientChannel } from "./channel.js";

import { Grid } from "./grid.js";

const SIZE = 1000;
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
  ctx.fillStyle = "#bbb";
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
  // set up data
  let screenWidth = signal(0);
  let screenHeight = signal(0);
  let viewportWidth = computed(() => Math.ceil(screenWidth.value / cellSize));
  let viewportHeight = computed(() => Math.ceil(screenHeight.value / cellSize));
  let lastTouchEvent = null;
  let scrollMomentum = [0, 0];

  // create game UI

  const canvas = dom("canvas", {
    width: screenWidth,
    height: screenHeight,
  });

  const minimap = dom("canvas", {
    id: "minimap",
    width: 72,
    height: 72,
  });

  effect(() => {
    console.log(screenWidth.value, screenHeight.value);
  });

  const game = dom(
    "div",
    { id: "game" },
    dom("div", { id: "grid" }, canvas),
    dom(
      "div",
      {
        id: "hud",
      },
      "mineswarmer",
      minimap,
      dom(
        "form",
        { id: "mode", onsubmit: (e) => e.preventDefault() },
        dom(
          "label",
          {},
          dom("input", {
            type: "radio",
            checked: true,
            name: "mode",
            value: "dig",
          }),
          "🪏"
        ),
        dom(
          "label",
          {},
          dom("input", { type: "radio", name: "mode", value: "flag" }),
          "🚩"
        )
      )
    )
  );
  document.body.append(game);

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

  function updatePosition(deltaX, deltaY) {
    position.value = [
      Math.min(
        SIZE * cellSize - screenWidth.value,
        Math.max(0, position.value[0] + deltaX)
      ),
      Math.min(
        SIZE * cellSize - screenHeight.value,
        Math.max(0, position.value[1] + deltaY)
      ),
    ];
  }

  function updateCursorPosition(e) {
    let gridPos = projectMouse(e);
    cursorCell.value = [gridPos[0] | 0, gridPos[1] | 0];
  }

  function resizeScreen() {
    const grid = document.querySelector("#grid");
    screenWidth.value = grid.offsetWidth;
    screenHeight.value = grid.offsetHeight;
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

  effect(() => {
    let pos = position.value;
    let x = ((pos[0] / cellSize / SIZE) * minimap.width) | 0;
    let y = ((pos[1] / cellSize / SIZE) * minimap.height) | 0;
    let w = Math.ceil((viewportWidth.value / SIZE) * minimap.height);
    let h = Math.ceil((viewportHeight.value / SIZE) * minimap.width);
    const ctx = minimap.getContext("2d");
    ctx.fillStyle = "#bbb";
    ctx.fillRect(0, 0, minimap.width, minimap.height);
    ctx.fillStyle = "red";
    ctx.fillRect(x, y, w, h);
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

  const dig = (pos) =>
    fetch("/click", {
      method: "post",
      body: JSON.stringify(pos),
      headers: {
        "content-type": "application/json",
      },
    });

  const mark = (pos) =>
    fetch("/mark", {
      method: "post",
      body: JSON.stringify(pos),
      headers: {
        "content-type": "application/json",
      },
    });

  const projectMouse = (e) =>
    scale(add([e.clientX, e.clientY], position.value), 1 / cellSize);

  // allow right click
  on(canvas, "contextmenu", (e) => e.preventDefault());

  on(canvas, "auxclick", (e) => {
    e.preventDefault();
    let gridPos = projectMouse(e);
    if (e.button === 2) {
      // right click
      mark(gridPos);
    }
  });

  on(canvas, "click", (e) => {
    e.preventDefault();
    let gridPos = projectMouse(e);
    const mode = document.querySelector("#mode").elements.mode.value;
    if (mode === "dig") {
      dig(gridPos);
    }
    if (mode === "flag") {
      mark(gridPos);
    }
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
    updateCursorPosition(e);
  });

  const momentumBlend = 0.5;
  const momentumDecay = 0.1;
  const lerp = (a, b, t) => a * (1 - t) + b * t;
  on(canvas, "touchstart", (e) => {
    const currentTouch = e.changedTouches[0];
    lastTouchEvent = currentTouch;
    scrollMomentum = [0, 0];
  });
  on(canvas, "touchmove", (e) => {
    const currentTouch = e.changedTouches[0];

    if (lastTouchEvent && currentTouch) {
      const deltaX = lastTouchEvent.clientX - currentTouch.clientX;
      const deltaY = lastTouchEvent.clientY - currentTouch.clientY;
      updatePosition(deltaX, deltaY);
      scrollMomentum = [
        lerp(scrollMomentum[0], deltaX, momentumBlend),
        lerp(scrollMomentum[1], deltaY, momentumBlend),
      ];
      updateCursorPosition(currentTouch);
    }
    lastTouchEvent = currentTouch;
  });
  on(canvas, "touchend", () => {
    lastTouchEvent = null;
    momentumScroll();
  });
  function momentumScroll() {
    updatePosition(...scrollMomentum);
    console.log(Math.hypot(...scrollMomentum));
    scrollMomentum = [
      lerp(scrollMomentum[0], 0, momentumDecay),
      lerp(scrollMomentum[1], 0, momentumDecay),
    ];
    if (Math.hypot(...scrollMomentum) > 0.001) {
      requestAnimationFrame(momentumScroll);
    }
  }

  on(canvas, "wheel", (e) => {
    updatePosition(e.deltaX, e.deltaY);
  });

  on(window, "resize", resizeScreen);

  effect(draw);
}

start().catch((e) => console.error(e));
