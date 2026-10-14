// An expected business-rule failure (out of stock, bad total, …) whose message
// is safe and useful to show the cashier. Anything else is treated as an
// unexpected 500 and its details stay in the server log.
export class AppError extends Error {
  constructor(message, status = 400, code) {
    super(message);
    this.status = status;
    if (code) this.code = code;
  }
}
