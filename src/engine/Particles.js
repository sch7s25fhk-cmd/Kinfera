// Einfaches Partikelsystem (Staub, Funken, Explosionen). Weltkoordinaten.

export class Particles {
  constructor(max = 300) {
    this.max = max;
    /** @type {{x:number,y:number,vx:number,vy:number,life:number,age:number,color:string,size:number,gravity:number,fade:boolean}[]} */
    this.list = [];
  }

  emit(p) {
    if (this.list.length >= this.max) this.list.shift();
    this.list.push({ vx: 0, vy: 0, size: 1, gravity: 0, fade: true, ...p, age: 0 });
  }

  update(dt) {
    for (const p of this.list) {
      p.age += dt;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.list = this.list.filter((p) => p.age < p.life);
  }

  /**
   * @param {import('./Renderer.js').Renderer} r
   * @param {{x: number, y: number}} cam
   */
  render(r, cam) {
    for (const p of this.list) {
      const alpha = p.fade ? 1 - p.age / p.life : 1;
      const s = p.size;
      r.withAlpha(alpha, () => r.fillRect(Math.round(p.x - cam.x - s / 2), Math.round(p.y - cam.y - s / 2), s, s, p.color));
    }
  }
}
