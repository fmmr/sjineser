/**
 * Saves text as a file on the user's device (the browser's download, a share/preview sheet on iOS).
 * @param {string} fileName
 * @param {string} text
 * @param {string} [type] MIME type
 */
export function downloadText(fileName, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // Give the browser time to start reading the file before the address goes away.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
