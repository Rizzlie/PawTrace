import { Service } from "@angular/core";

@Service()
export class BrowserFiles {
  read(file: File): Promise<string> {
    return file.text();
  }

  download(text: string, filename: string): void {
    const url = URL.createObjectURL(
      new Blob([text], { type: "application/json;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    try {
      anchor.click();
    } finally {
      anchor.remove();
      // Give the browser time to capture the download before releasing the URL.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }
}
