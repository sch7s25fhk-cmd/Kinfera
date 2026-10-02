// Kamera folgt einem Ziel und klemmt an den Kartenrand.
export class Camera {
  constructor(viewWidth, viewHeight) {
    this.x = 0;
    this.y = 0;
    this.viewWidth = viewWidth;
    this.viewHeight = viewHeight;
    /** @type {{ width: number, height: number } | null} Weltgröße in Pixeln */
    this.bounds = null;
  }

  setBounds(width, height) {
    this.bounds = { width, height };
  }

  /** Zentriert auf (cx, cy) in Weltpixeln */
  follow(cx, cy) {
    this.x = cx - this.viewWidth / 2;
    this.y = cy - this.viewHeight / 2;
    this.clamp();
  }

  clamp() {
    if (!this.bounds) return;
    const { width, height } = this.bounds;
    // Ist die Welt kleiner als der Bildausschnitt, wird sie zentriert
    this.x = width <= this.viewWidth
      ? (width - this.viewWidth) / 2
      : Math.max(0, Math.min(this.x, width - this.viewWidth));
    this.y = height <= this.viewHeight
      ? (height - this.viewHeight) / 2
      : Math.max(0, Math.min(this.y, height - this.viewHeight));
    this.x = Math.round(this.x);
    this.y = Math.round(this.y);
  }
}
