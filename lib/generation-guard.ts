export class GenerationRequestGuard {
  private active = false;

  tryStart() {
    if (this.active) return false;
    this.active = true;
    return true;
  }

  finish() {
    this.active = false;
  }

  isActive() {
    return this.active;
  }
}
