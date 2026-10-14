// Bridge to the Electron main process. In a plain browser (used for quick UI
// testing) a mock keeps the project in localStorage and images in memory.

const memAssets = new Map();
const MOCK_KEY = 'sb-mock-project';

function memAsset(name, blob) {
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}-${name}`;
  memAssets.set(id, URL.createObjectURL(blob));
  return id;
}

function pickFilesInBrowser(accept = 'image/*') {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = accept;
    input.onchange = () => resolve([...input.files].map((f) => mockApi.pathForFile(f)));
    input.click();
  });
}

// The browser test keeps one project "file", with its versions, in localStorage.
const MOCK_DOC = 'sb-mock-doc';
const MOCK_FILE = 'C:\\Navegador\\Proyecto de prueba.storyboard';
const vid = () => Math.random().toString(36).slice(2, 9);
let mockDeleted = null;

function readMockDoc() {
  const doc = JSON.parse(localStorage.getItem(MOCK_DOC) || 'null');
  if (doc) return doc;
  // A project saved by the older browser test becomes its first version.
  const old = JSON.parse(localStorage.getItem(MOCK_KEY) || 'null');
  if (!old) return null;
  const id = vid();
  return { current: id, versions: [{ id, name: 'Versión 1', data: old, updated: new Date().toISOString() }] };
}
const writeMockDoc = (doc) => localStorage.setItem(MOCK_DOC, JSON.stringify(doc));
function mockOpened(doc) {
  const v = doc.versions.find((x) => x.id === doc.current) || doc.versions[0];
  return {
    file: MOCK_FILE, name: 'Proyecto de prueba', current: v.id, data: v.data,
    versions: doc.versions.map(({ id, name, updated }) => ({ id, name, updated })),
  };
}

const mockApi = {
  isMock: true,
  async newProject() {
    const id = vid();
    const doc = { current: id, versions: [{ id, name: 'Versión 1', data: null, updated: new Date().toISOString() }] };
    writeMockDoc(doc);
    return mockOpened(doc);
  },
  async openProject() {
    const doc = readMockDoc();
    return doc ? mockOpened(doc) : { error: 'No hay proyecto guardado en el navegador.' };
  },
  async openFile() {
    return this.openProject();
  },
  async openLast() {
    const doc = readMockDoc();
    return doc ? mockOpened(doc) : null;
  },
  async recents() {
    const doc = readMockDoc();
    return doc ? [{ file: MOCK_FILE, name: 'Proyecto de prueba', folder: 'C:\\Navegador', opened: new Date().toISOString(), exists: true }] : [];
  },
  async forgetRecent() {},
  async save(data) {
    const doc = readMockDoc();
    const v = doc.versions.find((x) => x.id === doc.current);
    v.data = data;
    v.updated = new Date().toISOString();
    writeMockDoc(doc);
    return true;
  },
  async createVersion(name) {
    const doc = readMockDoc();
    const from = doc.versions.find((x) => x.id === doc.current);
    const v = { id: vid(), name: name || `Versión ${doc.versions.length + 1}`, data: JSON.parse(JSON.stringify(from.data)), updated: new Date().toISOString() };
    doc.versions.push(v);
    doc.current = v.id;
    writeMockDoc(doc);
    return mockOpened(doc);
  },
  async switchVersion(id) {
    const doc = readMockDoc();
    if (doc.versions.some((x) => x.id === id)) doc.current = id;
    writeMockDoc(doc);
    return mockOpened(doc);
  },
  async renameVersion(id, name) {
    const doc = readMockDoc();
    const v = doc.versions.find((x) => x.id === id);
    if (v && name.trim()) v.name = name.trim().slice(0, 60);
    writeMockDoc(doc);
    return mockOpened(doc);
  },
  async deleteVersion(id) {
    const doc = readMockDoc();
    const i = doc.versions.findIndex((x) => x.id === id);
    if (i >= 0 && id !== doc.current) {
      mockDeleted = { i, v: doc.versions[i] };
      doc.versions.splice(i, 1);
      writeMockDoc(doc);
    }
    return mockOpened(doc);
  },
  async restoreVersion() {
    const doc = readMockDoc();
    if (mockDeleted) { doc.versions.splice(mockDeleted.i, 0, mockDeleted.v); mockDeleted = null; writeMockDoc(doc); }
    return mockOpened(doc);
  },
  pathForFile(file) {
    return '__mem__/' + memAsset(file.name, file);
  },
  async importPaths(paths) {
    return paths.filter((p) => p.startsWith('__mem__/')).map((p) => {
      const asset = p.slice('__mem__/'.length);
      return { asset, original: asset.split('-').slice(2).join('-') };
    });
  },
  async importBuffer(name, type, bytes) {
    return memAsset(name || 'pegado.png', new Blob([bytes], { type }));
  },
  async importUrl() {
    return null;
  },
  async removeAssets() {},
  assetUrl: (name) => memAssets.get(name) ?? '',
  pickImages: () => pickFilesInBrowser('image/*'),
  pickMedia: () => pickFilesInBrowser('image/*,video/*'),
  async openExternal(url) {
    window.open(url, '_blank');
  },
  onFlush() {},
  onOpenFile() {},
  closeReady() {},
};

export const api = window.api ?? mockApi;
export const assetUrl = (name) => (name ? api.assetUrl(name) : '');
