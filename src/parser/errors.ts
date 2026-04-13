export class ParseError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "ParseError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
