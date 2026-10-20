const labels: Record<string,string> = {
  inkHighlight: "Ink highlight", addText: "Add text", insertText: "Insert text",
  replaceText: "Replace text", textField: "Text field", listBox: "List box",
  shapeStyle: "Style", applyRedact: "Apply redaction", cover: "Cover",
  strikeout: "Strikeout", squiggly: "Squiggly", callout: "Callout",
  stamp: "Stamp", image: "Image", signature: "Signature",
};
export function toolLabel(key: string, words: Record<string,string>) {
  return words[key] || labels[key] ||
    key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (letter) => letter.toUpperCase());
}
