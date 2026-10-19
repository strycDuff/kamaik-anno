// Mechanical cleanup of ANNO Fraktur OCR. The rules and the cases they must
// not touch are written up in docs/ocr.md.

export function normalizeOcr(text: string): string {
  let value = text.normalize("NFC");
  value = value.replace(/\u00ad/g, "");
  value = value.replace(/ſ/g, "s");
  value = value.replace(/t<hen/g, "tchen");
  value = value.replace(/<h/g, "h");
  value = value.replace(/gedac<mten/g, "gedachten");
  value = value.replace(/([A-Za-zÄÖÜäöüß])<([A-Za-zÄÖÜäöüß])/g, "$1h$2");
  value = value.replace(/([A-Za-zÄÖÜäöüß])-=+\s+/g, "$1-");
  value = value.replace(/([A-Za-zÄÖÜäöüß])=+\s+([a-zäöüß])/g, "$1$2");
  value = value.replace(/Kainaik/g, "Kamaik");
  value = value.replace(/\bunfer\b/g, "unter");
  value = value.replace(/\böfentlich\b/g, "öffentlich");
  value = value.replace(/\bdesfelben\b/g, "desselben");
  value = value.replace(/\blinfen\b/g, "linken");
  value = value.replace(/Brettwühle/g, "Brettmühle");
  value = value.replace(/\bMähl\b/g, "Mahl");
  value = value.replace(/\bMaßl\b/g, "Mahl");
  value = value.replace(/\bsiküirke\b/g, "situierte");
  value = value.replace(/\bverpochtet\b/g, "verpachtet");
  value = value.replace(/\bzten\s+noch\s+zten\b(?=\s+Tagfahrt)/g, "zweiten noch dritten");
  value = value.replace(/\baten\s+noch\s+aten\b(?=\s+Tagfahrt)/g, "zweiten noch dritten");
  value = value.replace(/\bzten\b(?=\s+Tagfahrt)/g, "zweiten");
  value = value.replace(/\baten\b(?=\s+Tagfahrt)/g, "dritten");
  value = value.replace(/[ \t]+/g, " ");
  value = value.replace(/\s+([,.;:])/g, "$1");
  return value.trim();
}
