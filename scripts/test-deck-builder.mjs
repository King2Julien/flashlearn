import assert from "node:assert/strict";
import { buildDeck, createQuestion } from "../deck-builder.js";

const draft = { id: crypto.randomUUID(), title: " Private practice ", subject: " My course ", description: " My notes ", createdAt: new Date().toISOString(), questions: [] };
const single = { ...createQuestion(), question: "One answer?", options: [{ id: "A", text: "Yes" }, { id: "B", text: "No" }], correctOptions: ["A"] };
const multiple = { ...single, id: crypto.randomUUID(), type: "multiple", correctOptions: ["A", "B"] };
const boolean = { ...single, id: crypto.randomUUID(), type: "true_false", options: [{ id: "A", text: "True" }, { id: "B", text: "False" }], correctOptions: ["B"] };
const written = { ...single, id: crypto.randomUUID(), type: "text", correctTextAnswer: " Written answer " };
draft.questions = [single, multiple, boolean, written];
const deck = JSON.parse(JSON.stringify(buildDeck(draft)));
assert.equal(deck.schemaVersion, 1);
assert.equal(deck.title, "Private practice");
assert.equal(deck.subject, "My course");
assert.deepEqual(deck.questions.map(q => q.type), ["single", "multiple", "true_false", "text"]);
assert.deepEqual(deck.questions[1].correctOptions, ["A", "B"]);
assert.deepEqual(deck.questions[2].correctOptions, ["B"]);
assert.deepEqual(deck.questions[3].options, []);
assert.deepEqual(deck.questions[3].correctOptions, []);
assert.equal(deck.questions[3].correctTextAnswer, "Written answer");
assert.equal(deck.id, buildDeck(draft).id, "Downloading a draft again retains its identity");
assert.throws(() => buildDeck({ ...draft, title: " " }), /title/);
assert.throws(() => buildDeck({ ...draft, subject: " " }), /course/);
assert.throws(() => buildDeck({ ...draft, questions: [] }), /at least one/);
for (const [question, message] of [
  [{ ...single, question: " " }, /enter the question/],
  [{ ...single, correctOptions: [] }, /mark the correct/],
  [{ ...single, correctOptions: ["missing"] }, /mark the correct/],
  [{ ...single, correctOptions: ["A", "B"] }, /exactly one/],
  [{ ...single, options: [{ id: "A", text: "Yes" }] }, /at least two/],
  [{ ...single, options: [{ id: "A", text: "Yes" }, { id: "B", text: " " }] }, /at least two/],
  [{ ...written, correctTextAnswer: " " }, /correct written answer/],
]) assert.throws(() => buildDeck({ ...draft, questions: [question] }), message);
console.log("Deck builder schema and validation checks passed.");
