import test from "node:test";
import assert from "node:assert/strict";
import { highlightParts } from "../src/lib/message-highlights";
import { crisisMatches } from "../src/lib/redact";
import { safeResult, fallbackResult } from "../src/lib/server/triage";
import { mockResults } from "../src/lib/mock-results";

const examples = [
  ["I might hurt myself.", "hurt myself"],
  ["I have thoughts of hurting myself.", "hurting myself"],
  ["I want to kill myself.", "kill myself"],
  ["I am thinking of KILLING MYSELF.", "KILLING MYSELF"],
  ["I might harm myself.", "harm myself"],
  ["I have thoughts of harming myself.", "harming myself"],
  ["I am struggling with self-harm.", "self-harm"],
  ["I am struggling with self harm.", "self harm"],
  ["I am thinking about suicide.", "suicide"],
  ["I feel suicidal.", "suicidal"],
  ["I want to end my life.", "end my life"],
  ["I want to die.", "want to die"],
  ["I don't want to live anymore.", "don't want to live"],
  ["I don’t want to live.", "don’t want to live"],
  ["I do not want to live anymore.", "do not want to live"],
  ["I don’t see the point anymore.", "don’t see the point"],
  ["I have CHEST PAIN.", "CHEST PAIN"],
  ["I can't breathe.", "can't breathe"],
  ["I CAN’T BREATHE.", "CAN’T BREATHE"],
  ["I have trouble breathing.", "trouble breathing"],
  ["I think I'm having a stroke.", "stroke"],
  ["I fainted today.", "fainted"],
  ["I keep fainting.", "fainting"],
  ["I had a seizure.", "seizure"],
  ["I have had seizures.", "seizures"],
  ["I have thoughts of hurting\nmyself.", "hurting\nmyself"],
];
for (const [message, phrase] of examples) {
  test(`crisis pattern catches ${JSON.stringify(phrase)} and overrides a support draft or fallback`, () => {
    assert.deepEqual(crisisMatches(message), [phrase]);
    for (const result of [mockResults["CV-10009"], fallbackResult()]) {
      const safe = safeResult(result, message, "Daniel");
      assert.equal(safe.ai.crisis, true);
      assert.equal(safe.ai.route, "Nurse - urgent");
      assert.equal(safe.ai.priority, "urgent");
      assert.equal(safe.ai.draft_reply, null);
      assert.equal(safe.safety_override, true);
      assert.ok(safe.ai.flagged_phrases.includes(phrase));
    }
  });
}
for (const message of [
  "my cuff hurts my arm",
  "this app is killing me",
  "the strips ran out",
]) {
  test(`non-crisis message does not match: ${message}`, () => {
    assert.deepEqual(crisisMatches(message), []);
    const safe = safeResult(mockResults["CV-10009"], message, "Daniel");
    assert.equal(safe.ai.crisis, false);
    assert.equal(safe.ai.route, "Member Support");
    assert.ok(safe.ai.draft_reply);
  });
}
test("safety matches retain original text, are repeatable, and preserve AI flags alongside every detected phrase", () => {
  const message =
    "Thoughts of hurting myself; CHEST PAIN. I CAN’T BREATHE. Chest pain again.";
  const matches = ["hurting myself", "CHEST PAIN", "CAN’T BREATHE"];
  assert.deepEqual(crisisMatches(message), matches);
  assert.deepEqual(crisisMatches(message), matches);
  const safe = safeResult(
    {
      ...mockResults["CV-10009"],
      flagged_phrases: ["Thoughts", "hurting myself"],
    },
    message,
    "Daniel",
  );
  assert.deepEqual(safe.ai.flagged_phrases, ["Thoughts", ...matches]);
});

test("message highlights merge overlapping AI and safety flags without truncating either", () => {
  const message = "I have thoughts of hurting myself and feel overwhelmed.";
  const parts = highlightParts(message, [
    "thoughts of hurting",
    "overwhelmed",
    ...crisisMatches(message),
  ]);
  assert.equal(parts.map((part) => part.text).join(""), message);
  assert.deepEqual(
    parts.filter((part) => part.highlighted).map((part) => part.text),
    ["thoughts of hurting myself", "overwhelmed"],
  );
});

test("message highlights ignore empty flags, escape literal punctuation and highlight repeated matches", () => {
  const message = "CHEST PAIN and chest pain. reading (54).";
  const parts = highlightParts(message, [
    "",
    " ",
    "reading (54)",
    ...crisisMatches(message),
  ]);
  assert.deepEqual(
    parts.filter((part) => part.highlighted).map((part) => part.text),
    ["CHEST PAIN", "chest pain", "reading (54)"],
  );
  assert.equal(parts.map((part) => part.text).join(""), message);
});
