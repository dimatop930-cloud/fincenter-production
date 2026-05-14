import fs from "fs";

const out = "./firebase-admin.json";
const b64 = process.env.FIREBASE_ADMIN_BASE64;

console.log("BOOTSTRAP_FIREBASE_START");

if (!fs.existsSync(out) && b64) {
  fs.writeFileSync(out, Buffer.from(b64, "base64").toString("utf8"));
  console.log("firebase-admin.json created from ENV");
} else if (fs.existsSync(out)) {
  console.log("firebase-admin.json already exists");
} else {
  console.log("FIREBASE_ADMIN_BASE64 is not set");
}