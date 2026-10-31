import { randomBytes, scryptSync } from "node:crypto";
import readline from "node:readline";
if (!process.stdin.isTTY) {
  console.error("Run in an interactive terminal. Password input is hidden.");
  process.exit(1);
}
process.stdout.write("New administrator password (12+ characters, hidden): ");
readline.emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true);
let value = "";
process.stdin.on("keypress", (text, key) => {
  if (key?.ctrl && key.name === "c") process.exit(1);
  if (key?.name === "backspace") {
    value = value.slice(0, -1);
    return;
  }
  if (key?.name === "return") {
    process.stdin.setRawMode(false);
    process.stdout.write("\n");
    if (value.length < 12) {
      console.error("Use at least 12 characters.");
      process.exit(1);
    }
    const salt = randomBytes(24).toString("hex");
    console.log(
      `ADMIN_PASSWORD_HASH=scrypt$${salt}$${scryptSync(value, salt, 64).toString("hex")}`,
    );
    process.exit(0);
  }
  if (text && !key?.ctrl) value += text;
});
