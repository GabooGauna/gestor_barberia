import test from "node:test";
import assert from "node:assert/strict";
import { mfaQrImageSource } from "../../src/utils/mfa-qr.js";

const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="#000" width="100" height="100"/></svg>';

for (const [name, source] of [["raw SVG", svg], ["SDK data URL containing raw SVG", `data:image/svg+xml;utf-8,${svg}`]]) {
  test(`${name}: transports the exact provider SVG without URL fragments`, () => {
    const result = mfaQrImageSource(source);
    assert.equal(new URL(result).hash, "");
    assert.equal(decodeURIComponent(result.slice(result.indexOf(",") + 1)), svg);
    assert.equal(result.includes("%253C"), false);
  });
}
test("already encoded SVG is not encoded again", () => {
  const source = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  assert.equal(mfaQrImageSource(source), source);
});
test("base64 image is passed through unchanged", () => {
  const source = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  assert.equal(mfaQrImageSource(source), source);
});
test("missing images and non-image URLs are rejected", () => {
  for (const source of [null, "", "https://example.invalid/image", "javascript:alert(1)", "otpauth://totp/synthetic"]) {
    assert.throws(() => mfaQrImageSource(source));
  }
});
