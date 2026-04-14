export class RenderError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'RenderError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
