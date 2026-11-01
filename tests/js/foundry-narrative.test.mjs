import test from "node:test";
import assert from "node:assert/strict";
import {localizedText, renderNarrative} from "../../foundry/scripts/narrative.mjs";
const translate = key => ({TranslationPending: "tradução pendente", Addendum: "Evento adicional", Ending: "Desfecho"}[key] ?? key);
const fallback = defaultText => ({defaultText, language: "en", requestedLanguage: "pt-BR", translationMissing: true});

test("per-entry fallback metadata is visible even under the requested locale key", () => {
  const entity = {kind: "dialogue", data: {nodes: [{id: 1, texts: {"pt-BR": fallback("Own English line")}, links: [{from: 1, to: 2}]}]}};
  const text = renderNarrative(entity, "pt-BR", translate);
  assert.match(text, /\[EN — tradução pendente\]\nOwn English line/);
  assert.match(text, /Links: 2/);
});
test("quest entries preserve nested addenda and end-state IDs, texts and fallback markers", () => {
  const entity = {kind: "quest", data: {texts: {"pt-BR": {title: fallback("Own English title"), description: {defaultText: "Descrição própria", language: "pt-BR"}, nodes: [{id: 5, title: fallback("Own node title"), description: fallback("Own node description")}], addenda: [{id: 7, text: fallback("Own addendum")}], endStates: [{id: 9, text: fallback("Own ending")}]}}}};
  const text = renderNarrative(entity, "pt-BR", translate);
  assert.match(text, /\[EN — tradução pendente\]\nOwn English title/);
  assert.match(text, /Descrição própria/);
  assert.match(text, /5: \[EN — tradução pendente\]\nOwn node title/);
  assert.match(text, /Evento adicional #7: \[EN — tradução pendente\]\nOwn addendum/);
  assert.match(text, /Desfecho #9: \[EN — tradução pendente\]\nOwn ending/);
});
test("actual language mismatch also marks fallback without translationMissing flag", () => {
  assert.match(localizedText({defaultText: "Own English prose", language: "en"}, "pt-BR", translate), /^\[EN — tradução pendente\]/);
  assert.equal(localizedText({defaultText: "Texto próprio", language: "pt-BR"}, "pt-BR", translate), "Texto próprio");
  assert.equal(localizedText({text: fallback("Nested own text")}, "pt-BR", translate), "[EN — tradução pendente]\nNested own text");
});
