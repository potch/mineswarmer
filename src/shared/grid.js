let neighbors = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

const maxFloodDistance = 16;

export const rectEach = ([x1, y1], [x2, y2], fn) => {
  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) {
      fn([x, y]);
    }
  }
};

export class Grid {
  constructor(size) {
    this.size = size;
    this.cells = new Map();
  }
  inBounds(x, y) {
    return !(x < 0 || y < 0 || x > this.size - 1 || y > this.size - 1);
  }
  at(x, y) {
    if (this.inBounds(x, y)) {
      return this.cells.get(y * this.size + x) ?? null;
    }
    return null;
  }
  mark(x, y) {
    if (!this.at(x, y) || !this.at(x, y).dug) {
      let existing = this.at(x, y) ?? {};
      existing.marked = !existing.marked;
      this.set(x, y, existing);
    }
  }
  dig(x, y) {
    let count = 0;
    if (this.at(x, y)?.dug) return;
    for (let [dx, dy] of neighbors) {
      let cx = x + dx;
      let cy = y + dy;
      if (this.at(cx, cy)?.mine) {
        count++;
      }
    }
    return count;
  }
  floodDig(x, y) {
    if (this.at(x, y)?.boom) {
      return;
    }
    if (this.at(x, y)?.mine) {
      this.floodBoom(x, y);
      return;
    }

    const SIZE = this.size;
    let toDig = [[x, y]];
    while (toDig.length) {
      let [cx, cy] = toDig.pop();
      if (Math.hypot(cx - x, cy - y) > maxFloodDistance) continue;
      if (cx < 0 || cy < 0 || cx > SIZE - 1 || cy > SIZE - 1) continue;
      if (this.at(cx, cy)) continue;
      const count = this.dig(cx, cy);
      this.set(cx, cy, {
        dug: true,
        count,
      });
      if (!count) {
        for (let [dx, dy] of neighbors) {
          toDig.push([cx + dx, cy + dy]);
        }
      }
    }
  }
  floodBoom(x, y) {
    this.set(x, y, { mine: true, dug: true, boom: true });

    const SIZE = this.size;
    for (let cx = x - maxFloodDistance; cx <= x + maxFloodDistance; cx++) {
      for (let cy = y - maxFloodDistance; cy <= y + maxFloodDistance; cy++) {
        if (cx < 0 || cy < 0 || cx > SIZE - 1 || cy > SIZE - 1) continue;
        if (Math.hypot(cx - x, cy - y) > maxFloodDistance) continue;
        let cell = this.at(cx, cy);
        if (!cell) {
          this.set(cx, cy, { dug: true, boom: true });
        } else {
          if (cell.boom) continue;
          this.set(cx, cy, { ...cell, boom: true });
        }
      }
    }
  }
  set(x, y, value) {
    this.cells.set(y * this.size + x, value);
  }
  serialize() {
    return {
      size: this.size,
      cells: [...this.cells.entries()],
    };
  }
  serializeRect([tl, br]) {
    const size = this.size;
    const cells = [];
    rectEach(tl, br, ([x, y]) => {
      const c = this.at(x, y);
      if (c) cells.push([y * size + x, c]);
    });
    return {
      size: size,
      rect: [tl, br],
      cells,
    };
  }
  updateRect({ cells }) {
    for (let [idx, cell] of cells) {
      this.cells.set(idx, cell);
    }
  }
  static deserialize(o) {
    let g = new Grid(o.size);
    g.cells = new Map(o.cells);
    return g;
  }
}
