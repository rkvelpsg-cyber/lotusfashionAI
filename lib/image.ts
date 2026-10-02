export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Unable to read image."));
    reader.onerror = () => reject(new Error("Unable to read image."));
    reader.readAsDataURL(file);
  });
}
