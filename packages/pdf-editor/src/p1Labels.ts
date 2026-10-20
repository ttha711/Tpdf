const labels: Record<string,string> = {
  inkHighlight: "Ink highlight", addText: "Add text", insertText: "Insert text",
  replaceText: "Replace text", textField: "Text field", listBox: "List box",
  shapeStyle: "Style", applyRedact: "Apply redaction", cover: "Cover",
  strikeout: "Strikeout", squiggly: "Squiggly", callout: "Callout",
  stamp: "Stamp", image: "Image", signature: "Signature",
};
const vi: Record<string,string> = {
  underline:"Gạch dưới", strikeout:"Gạch ngang", squiggly:"Gạch sóng",
  inkHighlight:"Tô bằng bút", addText:"Thêm chữ", insertText:"Chèn chữ",
  callout:"Chú thích chỉ dẫn", rectangle:"Hình chữ nhật", circle:"Hình tròn",
  line:"Đường thẳng", arrow:"Mũi tên", polygon:"Đa giác", polyline:"Đường gấp khúc",
  stamp:"Con dấu", image:"Hình ảnh", signature:"Chữ ký",
};
export function toolLabel(key: string, words: Record<string,string>, locale: "vi"|"en" = "en") {
  return words[key] || (locale === "vi" ? vi[key] : "") || labels[key] ||
    key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (letter) => letter.toUpperCase());
}
