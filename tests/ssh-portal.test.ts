import test from "node:test";
import assert from "node:assert/strict";
import { sshPortalOrigin } from "../src/lib/ssh-portal";
test("private SSH entry accepts only HTTPS origins, never URL credentials", () => {
  assert.equal(
    sshPortalOrigin("https://mini.example.ts.net:8443/"),
    "https://mini.example.ts.net:8443",
  );
  for (const value of [
    "http://mini.example",
    "javascript:alert(1)",
    "https://user:secret@mini.example",
    "https://mini.example/?token=secret",
    "https://mini.example/#secret",
    "https://mini.example/path",
    "not a URL",
  ]) {
    assert.equal(sshPortalOrigin(value), null, value);
  }
});
