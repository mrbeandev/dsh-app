export const IMPORT_CATEGORIES = [
  { id: 'images', label: 'Images', icon: 'image-outline', types: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'], detail: 'Attach pictures for a vision-capable model' },
  { id: 'video', label: 'Video', icon: 'videocam-outline', types: ['video/*'], detail: 'Attach as a file for the agent’s tools' },
  { id: 'audio', label: 'Audio', icon: 'musical-notes-outline', types: ['audio/*'], detail: 'Attach as a file for the agent’s tools' },
  { id: 'pdf', label: 'PDF', icon: 'document-text-outline', types: ['application/pdf'], detail: 'PDF documents' },
  { id: 'office', label: 'Office documents', icon: 'documents-outline', types: ['application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.oasis.opendocument.text', 'application/vnd.oasis.opendocument.spreadsheet', 'application/vnd.oasis.opendocument.presentation', 'text/csv', 'application/rtf'], detail: 'Documents, spreadsheets and presentations' },
  { id: 'other', label: 'Other files', icon: 'folder-open-outline', types: ['*/*'], detail: 'Text, code, archives and other formats' },
] as const;
export type ImportCategory = typeof IMPORT_CATEGORIES[number];
export type PromptPart = { type: 'text'; text: string } | { type: 'image'; mediaType: string; data: string; name: string } | { type: 'file'; receiptId: string };
export type ImportItem = { id: string; uri: string; name: string; size?: number; mimeType?: string; image: boolean; progress: number; state: 'uploading' | 'ready' | 'error'; part?: PromptPart; error?: string };
export function imageMediaType(name: string, mime?: string): string | null {
  const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
  if (mime && allowed.includes(mime.toLowerCase())) return mime.toLowerCase();
  const ext = name.split('.').pop()?.toLowerCase();
  return ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' } as Record<string, string>)[ext ?? ''] ?? null;
}
export function promptWithImports(text: string, items: ImportItem[]): PromptPart[] {
  if (items.some(i => i.state !== 'ready' || !i.part)) throw new Error('Wait for attachments to finish uploading or remove failed files.');
  return [...(text.trim() ? [{ type: 'text' as const, text: text.trim() }] : []), ...items.map(i => i.part!)];
}
export function parseUploadReceipt(body: string): string {
  let result; try { result = JSON.parse(body); } catch { throw new Error('Unexpected upload response from Harness.'); }
  if (!result?.ok) throw new Error(result?.error?.message ?? 'Upload failed.');
  const id = result.value?.receiptId;
  if (typeof id !== 'string' || !id) throw new Error('Harness did not return an upload receipt.');
  return id;
}
