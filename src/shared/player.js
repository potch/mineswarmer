export class Player {
  constructor(id, send) {
    this.position = [0, 0];
    this.rect = null;
    this.id = id;
    this.send = send;
  }
  setPosition(p) {
    this.position = p;
  }
  setRect(r) {
    this.rect = r;
  }
}
