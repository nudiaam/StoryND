import { useEffect, useRef, useState } from 'react';
import { useStore, newProject, notify } from './store.js';
import { api } from './api.js';
import Icon from './Icon.jsx';

// Opening, creating and switching projects and versions. A project is one
// file; its versions live inside it, chosen from the top bar.

// Set by the autosave; saves pending changes before anything is switched.
let flushNow = async () => {};
export const setFlush = (fn) => { flushNow = fn; };

const setDoc = (r) => useStore.setState({ doc: { name: r.name, versions: r.versions, current: r.current } });

export async function createProject() {
  await flushNow();
  const r = await api.newProject();
  if (!r) return;
  if (r.error) { notify(r.error); return; }
  useStore.getState().load(r, r.data || newProject(r.name));
  if (!r.data) await api.save(useStore.getState().project);
}

async function opened(r) {
  if (!r) return;
  if (r.error) { notify(r.error); return; }
  useStore.getState().load(r);
}

export async function openProject() {
  await flushNow();
  await opened(await api.openProject());
}

export async function openRecent(file) {
  await flushNow();
  await opened(await api.openFile(file));
}

export async function newVersion() {
  await flushNow();
  const r = await api.createVersion();
  useStore.getState().load(r);
  notify(`Ahora trabajas en «${r.versions.find((v) => v.id === r.current).name}», una copia de la anterior`);
}

export async function switchVersion(id) {
  if (id === useStore.getState().doc?.current) return;
  await flushNow();
  useStore.getState().load(await api.switchVersion(id));
}

export async function renameVersion(id, name) {
  if (!name.trim()) return;
  setDoc(await api.renameVersion(id, name));
}

export async function deleteVersion(id) {
  const v = useStore.getState().doc.versions.find((x) => x.id === id);
  setDoc(await api.deleteVersion(id));
  notify(`Versión «${v?.name}» borrada`, false, { label: 'Deshacer', run: async () => setDoc(await api.restoreVersion()) });
}

// "hoy 14:20", "ayer", "12 oct."
export function when(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const days = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
  if (days === 0) return 'hoy ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  if (days === 1) return 'ayer';
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

// A menu that drops under its button and closes when clicking elsewhere.
function Dropdown({ label, title, className = '', children }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return;
    const down = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', key, true);
    return () => { window.removeEventListener('pointerdown', down, true); window.removeEventListener('keydown', key, true); };
  }, [open]);
  return (
    <div className={`dd ${className}`} ref={box}>
      <button className={`ghost dd-btn ${open ? 'on' : ''}`} title={title} onClick={() => setOpen((o) => !o)}>
        {label}
        <Icon name="chevron" size={12} />
      </button>
      {open && <div className="dd-menu" onClick={(e) => { if (e.target.closest('[data-close]')) setOpen(false); }}>{children}</div>}
    </div>
  );
}

function RecentItems({ list, onPick }) {
  if (!list.length) return <p className="dd-empty">Aún no hay proyectos recientes.</p>;
  return list.map((r) => (
    <div key={r.file} className={`recent ${r.exists ? '' : 'missing'}`} title={r.file}>
      <button className="recent-main" data-close disabled={!r.exists} onClick={() => onPick(r.file)}>
        <span className="recent-name">{r.name}</span>
        <span className="recent-folder">{r.exists ? r.folder : 'No se encuentra: ¿lo has movido?'}</span>
      </button>
      <span className="recent-when">{when(r.opened)}</span>
      <button
        className="icon-btn recent-forget"
        title="Quitar de la lista (no borra el archivo)"
        onClick={async (e) => { e.stopPropagation(); await api.forgetRecent(r.file); onPick(null); }}
      >
        <Icon name="close" size={12} />
      </button>
    </div>
  ));
}

function useRecents() {
  const [list, setList] = useState([]);
  const reload = () => api.recents().then(setList);
  useEffect(() => { reload(); }, []);
  return [list, reload];
}

// The project's name is its menu: a new project, another file, or one of
// the recent ones.
export function ProjectMenu() {
  const name = useStore((s) => s.doc?.name);
  const file = useStore((s) => s.file);
  const [list, reload] = useRecents();
  return (
    <Dropdown label={<span className="proj">{name}</span>} title={file} className="dd-project">
      <button className="dd-item" data-close onClick={createProject}>
        <Icon name="plus" size={14} />
        Nuevo proyecto…
      </button>
      <button className="dd-item" data-close onClick={openProject}>
        <Icon name="folder" size={15} />
        Abrir archivo…
      </button>
      <div className="dd-sep" />
      <span className="dd-title">Recientes</span>
      <RecentItems list={list.filter((r) => r.file !== file)} onPick={(f) => (f ? openRecent(f) : reload())} />
    </Dropdown>
  );
}

function VersionRow({ v, current, only }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(v.name);
  const done = (text) => { setEditing(false); if (text.trim() && text !== v.name) renameVersion(v.id, text); else setDraft(v.name); };
  return (
    <div className={`ver ${current ? 'current' : ''}`}>
      <span className="ver-dot" />
      {editing ? (
        <input
          className="ver-input"
          autoFocus
          value={draft}
          maxLength={60}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => done(e.currentTarget.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setDraft(v.name); setEditing(false); } }}
        />
      ) : (
        <button className="ver-name" title={current ? 'La versión en uso' : 'Usar esta versión'} data-close={!current || undefined} onClick={() => switchVersion(v.id)} onDoubleClick={() => setEditing(true)}>
          {v.name}
        </button>
      )}
      <span className="ver-when">{when(v.updated)}</span>
      {/* Always the same width, so the dates line up whatever each row offers. */}
      <span className="ver-actions">
        {!editing && (
          <button className="icon-btn ver-edit" title="Cambiar el nombre" onClick={() => { setDraft(v.name); setEditing(true); }}>
            <Icon name="pencil" size={13} />
          </button>
        )}
        {!current && !only && (
          <button className="icon-btn ver-del" title="Borrar esta versión" onClick={() => deleteVersion(v.id)}>
            <Icon name="close" size={12} />
          </button>
        )}
      </span>
    </div>
  );
}

// The version in use, next to the project's name, with all the others.
export function VersionMenu() {
  const doc = useStore((s) => s.doc);
  if (!doc) return null;
  const cur = doc.versions.find((v) => v.id === doc.current);
  return (
    <Dropdown label={<span className="ver-label">{cur?.name}</span>} title="Versiones de este proyecto" className="dd-versions">
      <span className="dd-title">Versiones</span>
      {doc.versions.map((v) => <VersionRow key={v.id} v={v} current={v.id === doc.current} only={doc.versions.length < 2} />)}
      <div className="dd-sep" />
      <button className="dd-item" data-close onClick={newVersion}>
        <Icon name="plus" size={14} />
        Nueva versión a partir de esta
      </button>

    </Dropdown>
  );
}

export function Welcome() {
  const [list, reload] = useRecents();
  return (
    <div className="welcome">
      <span className="welcome-logo" role="img" aria-label="StoryND" />
      <h1>StoryND</h1>
      <p>Guion, fuentes y visuales en un lienzo libre.</p>
      <div className="welcome-actions">
        <button className="primary" onClick={createProject}>Nuevo proyecto</button>
        <button onClick={openProject}>Abrir proyecto</button>
      </div>
      {list.length > 0 && (
        <div className="welcome-recents">
          <span className="dd-title">Recientes</span>
          <RecentItems list={list.slice(0, 8)} onPick={(file) => (file ? openRecent(file) : reload())} />
        </div>
      )}
      <p className="hint">Cada proyecto es un archivo <b>.storyboard</b>; sus imágenes se guardan en una carpeta al lado.</p>
      {api.isMock && <p className="hint">Modo navegador (prueba): las imágenes no se guardan al recargar.</p>}
    </div>
  );
}
