import { test } from "node:test";
import assert from "node:assert/strict";
import { normalize, editDistance, matchAnswer, isPhrasedAsQuestion } from "../src/match.js";

test("normalize strips question words, articles, accents and punctuation", () => {
  assert.equal(normalize("What is The Tempest?"), "tempest");
  assert.equal(normalize("Who's   Shakespeare!"), "shakespeare");
  assert.equal(normalize("Where are the Alps"), "alps");
  assert.equal(normalize("  Québec "), "quebec");
  assert.equal(normalize("an apple"), "apple");
  assert.equal(normalize("what's up"), "up");
});

test("editDistance counts insertions, deletions, substitutions and swaps", () => {
  assert.equal(editDistance("kitten", "sitting"), 3);
  assert.equal(editDistance("abcd", "abdc"), 1);
  assert.equal(editDistance("", "abc"), 3);
  assert.equal(editDistance("same", "same"), 0);
});

test("phrasing detection", () => {
  assert.equal(isPhrasedAsQuestion("What is Paris"), true);
  assert.equal(isPhrasedAsQuestion("who's drake"), true);
  assert.equal(isPhrasedAsQuestion("Paris"), false);
});

// response, clue, expected result
const TABLE = [
  // exact and near-exact
  ["Paris", { answer: "Paris" }, "correct"],
  ["What is Paris?", { answer: "Paris" }, "correct"],
  ["the Tempest", { answer: "The Tempest", accept: ["Tempest"] }, "correct"],
  ["tempest", { answer: "The Tempest", accept: ["Tempest"] }, "correct"],
  ["PARIS", { answer: "Paris" }, "correct"],
  ["Quebec", { answer: "Québec" }, "correct"],
  // accept list
  ["Red Riding Hood", { answer: "Little Red Riding Hood", accept: ["Red Riding Hood"] }, "correct"],
  ["Rio", { answer: "Rio de Janeiro", accept: ["Rio"] }, "correct"],
  ["forty-two", { answer: "42", accept: ["forty-two"], strict: true }, "correct"],
  // typos within the allowance
  ["Pars", { answer: "Paris" }, "correct"],            // 1 edit, len 5
  ["Nairobbi", { answer: "Nairobi" }, "correct"],      // 1 edit, len 7
  ["Lilehamer", { answer: "Lillehammer" }, "correct"], // 2 edits, len 11
  ["Saskatoonn", { answer: "Saskatoon" }, "correct"],
  ["Casablnaca", { answer: "Casablanca" }, "correct"], // transposition
  ["Shakespear", { answer: "Shakespeare" }, "correct"],
  ["Churchil", { answer: "Churchill" }, "correct"],
  // too many edits -> borderline or wrong
  ["Pris", { answer: "Paris" }, "correct"],             // 1 deletion
  ["Prs", { answer: "Paris" }, "borderline"],           // 2 edits of 5 = 40 %
  ["Pxxs", { answer: "Paris" }, "wrong"],               // 3 edits of 5
  ["Lillehamr", { answer: "Lillehammer" }, "correct"],  // 2 edits
  ["Lilhamr", { answer: "Lillehammer" }, "borderline"], // 4 edits of 11 = 36 %
  ["London", { answer: "Paris" }, "wrong"],
  ["", { answer: "Paris" }, "wrong"],
  ["   ", { answer: "Paris" }, "wrong"],
  ["what is", { answer: "Paris" }, "wrong"],
  // partial credit: surname only, extra words
  ["Roosevelt", { answer: "Franklin Roosevelt" }, "correct"],
  ["Mitchell", { answer: "Joni Mitchell" }, "correct"],
  ["Joni Mitchell the singer", { answer: "Joni Mitchell" }, "correct"],
  ["the Merchant of Venice play", { answer: "The Merchant of Venice" }, "correct"],
  ["Franklin", { answer: "Franklin Roosevelt" }, "correct"], // the plan allows word matches unless strict
  ["of", { answer: "The Merchant of Venice" }, "wrong"],       // tiny word, no credit
  // strict: no partial credit, typos still ok
  ["Roosevelt", { answer: "Theodore Roosevelt", strict: true }, "wrong"],
  ["Theodore Rosevelt", { answer: "Theodore Roosevelt", strict: true }, "correct"],
  ["October", { answer: "October", strict: true }, "correct"],
  ["November", { answer: "October", strict: true }, "wrong"],
  // numbers: exact only
  ["32", { answer: "32", strict: true }, "correct"],
  ["31", { answer: "32", strict: true }, "wrong"],
  ["1989", { answer: "1989", strict: true }, "correct"],
  ["1988", { answer: "1989", strict: true }, "wrong"],
  ["what is 99", { answer: "99", strict: true }, "correct"],
  ["ninety nine", { answer: "99", accept: ["ninety-nine", "ninety nine"], strict: true }, "correct"],
  // articles and question forms
  ["the liver", { answer: "the liver", accept: ["liver"] }, "correct"],
  ["liver", { answer: "the liver", accept: ["liver"] }, "correct"],
  ["What is the liver?", { answer: "the liver" }, "correct"],
  ["Who is Drake", { answer: "Drake" }, "correct"],
  ["Who's Drake?", { answer: "Drake" }, "correct"],
  // multi-word wordplay
  ["fat cat", { answer: "fat cat" }, "correct"],
  ["a fat cat", { answer: "fat cat" }, "correct"],
  ["fat cats", { answer: "fat cat" }, "correct"],      // 1 edit
  ["glad dad", { answer: "glad dad" }, "correct"],
  ["sad dad", { answer: "glad dad" }, "correct"],      // 2 edits, len 8: within the allowance
  ["mad lad", { answer: "glad dad" }, "borderline"],   // 3 edits of 8 = 37 %
  ["dog house", { answer: "mouse house" }, "borderline"],
  ["house", { answer: "mouse house" }, "correct"],     // partial word credit (not strict)
  // punctuation and symbols
  ["Black Sea.", { answer: "the Black Sea", accept: ["Black Sea"] }, "correct"],
  ["black-sea", { answer: "the Black Sea" }, "correct"],
  ["Pink Floyd!!", { answer: "Pink Floyd" }, "correct"],
  ["Floyd", { answer: "Pink Floyd", accept: ["Floyd"] }, "correct"],
  ["Magna Carta", { answer: "Magna Carta" }, "correct"],
  ["magna charta", { answer: "Magna Carta" }, "correct"],
  ["Hannibal Barca", { answer: "Hannibal", accept: ["Hannibal Barca"] }, "correct"],
  ["Hannibal Lecter", { answer: "Hannibal" }, "correct"], // contains the answer's only word
  ["Algeria", { answer: "Algeria" }, "correct"],
  ["Libya", { answer: "Algeria" }, "wrong"],
];

for (const [response, clue, expected] of TABLE) {
  test(`"${response}" vs "${clue.answer}"${clue.strict ? " (strict)" : ""} -> ${expected}`, () => {
    assert.equal(matchAnswer(response, clue).result, expected);
  });
}

test("the matching table has at least 50 cases", () => {
  assert.ok(TABLE.length >= 50, `${TABLE.length} cases`);
});

test("matchAnswer reports phrasing", () => {
  assert.equal(matchAnswer("What is Paris", { answer: "Paris" }).phrased, true);
  assert.equal(matchAnswer("Paris", { answer: "Paris" }).phrased, false);
});
