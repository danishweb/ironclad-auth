import { describe, expect, it } from "vitest";
import { decryptEnvelope, encryptEnvelope } from "./key-envelope.js";

describe("key envelope", () => {
	it("round-trips PKCS#8 PEM", () => {
		const secret = "unit-test-secret-at-least-16";
		const pem =
			"-----BEGIN PRIVATE KEY-----\nMII...\n-----END PRIVATE KEY-----";
		const enc = encryptEnvelope(secret, pem);
		expect(decryptEnvelope(secret, enc)).toBe(pem);
	});

	it("fails on wrong secret", () => {
		const enc = encryptEnvelope("correct-secret-16chars", "hello");
		expect(() => decryptEnvelope("wrong-secret-16chars", enc)).toThrow();
	});
});
