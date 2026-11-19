// Error messages leave the browser only after this: emails, anything in quotes and every
// number are masked, so a merchant name, an amount or an address in a message never does.
export function scrubErrorMessage(message: string): string {
  return message
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "<email>")
    .replace(/(["'`])(?:(?!\1).){1,200}\1/g, "<text>")
    .replace(/\d+(?:[.,]\d+)*/g, "#")
    .slice(0, 160);
}
