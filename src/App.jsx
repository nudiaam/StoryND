import { useEffect, useRef, useState } from 'react';
import { ReactFlowProvider, useReactFlow } from '@xyflow/react';
import { useStore, setUi, notify } from './store.js';
import { addFree, addFreeImages, addWindow, addZone, deleteArrows, orderedMoments } from './actions.js';
import { computeLayout } from './layout.js';
import { GRID } from './layout.js';
import { api, assetUrl } from './api.js';
import { importFromUrl, isEditableTarget, isVideoName, naturalCompare } from './util.js';
import { embedUrl, isLink, mediaUrl } from './media.js';
import StyleStrip from './StyleStrip.jsx';
import Icon from './Icon.jsx';
import Canvas from './canvas/Canvas.jsx';
import ScriptView from './ScriptView.jsx';
import PreviewView from './PreviewView.jsx';
import FocusView from './FocusView.jsx';
import { PopoverHost } from './Popovers.jsx';
import { toggleTheme } from './theme.js';
import ImportShotsDialog from './dialogs/ImportShotsDialog.jsx';
import { FormatBar } from './RichText.jsx';
import { ColorGhost } from './Palette.jsx';
import { ProjectMenu, VersionMenu, Welcome, openRecent, setFlush } from './Files.jsx';


async function importBocetos() {
  const list = orderedMoments(useStore.getState().project);
  if (!list.length) {
    notify('Primero pega el guion en la vista Guion: los bocetos se colocan uno por momento.');
    return;
  }
  const paths = await api.pickImages();
  if (!paths.length) return;
  const items = (await api.importPaths(paths)).sort((a, b) => naturalCompare(a.original, b.original));
  if (!items.length) return;
  const firstEmpty = list.find((x) => !x.moment.shots.length) ?? list[0];
  setUi({ importShots: { items, startMomentId: firstEmpty.moment.id } });
}

// Saves 600 ms after the last change, and once more right before closing.
function useAutosave() {
  useEffect(() => {
    let timer = null;
    let lastSaved = useStore.getState().project;

    const flush = async () => {
      clearTimeout(timer);
      timer = null;
      const { project, setSaveState } = useStore.getState();
      if (!project) return;
      if (project === lastSaved) {
        setSaveState('saved');
        return;
      }
      setSaveState('saving');
      try {
        await api.save(project);
        lastSaved = project;
        setSaveState('saved');
      } catch (err) {
        console.error(err);
        setSaveState('error');
      }
    };
    setFlush(flush);

    const unsub = useStore.subscribe((s, prev) => {
      if (s.project === prev.project || !s.project) return;
      // A project or version just opened: nothing to save yet.
      if (!prev.project || s.file !== prev.file || s.doc?.current !== prev.doc?.current) {
        lastSaved = s.project;
        return;
      }
      useStore.getState().setSaveState('pending');
      clearTimeout(timer);
      timer = setTimeout(flush, 600);
    });

    // A .storyboard double-clicked in the Explorer while the app is open.
    api.onOpenFile((file) => openRecent(file));

    api.onFlush(async () => {
      await flush();
      api.closeReady();
    });

    return () => {
      unsub();
      clearTimeout(timer);
    };
  }, []);
}

const TOOL_KEYS = { v: 'select', n: 'note', t: 'text', l: 'arrow' };

function useShortcuts() {
  useEffect(() => {
    const onKey = (e) => {
      const { ui, undo, redo } = useStore.getState();
      if (e.key === 'Escape') {
        if (ui.lightbox) setUi({ lightbox: null });
        else if (ui.focusMoment && !isEditableTarget(document.activeElement)) setUi({ focusMoment: null });
        else if (ui.isolate) setUi({ isolate: null });
        else setUi({ tool: 'select', selectedArrow: null, editingArrow: null });
        return;
      }
      if (isEditableTarget(document.activeElement)) return;
      if (e.ctrlKey || e.metaKey) {
        const k = e.key.toLowerCase();
        if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
        if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
        // Outside a text field, never paint the whole interface as selected text.
        if (k === 'a') e.preventDefault();
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && ui.selectedArrow) {
        deleteArrows([ui.selectedArrow]);
        setUi({ selectedArrow: null });
        return;
      }
      if (ui.view === 'board' && !e.altKey) {
        const tool = TOOL_KEYS[e.key.toLowerCase()];
        if (tool) setUi({ tool });
      }
    };
    window.addEventListener('keydown', onKey);
    // The board pans with Space, even with Shift held inside a text field,
    // and that swallowed the space: while typing, the board never hears it.
    const keepSpace = (e) => { if (e.code === 'Space' && isEditableTarget(e.target)) e.stopPropagation(); };
    document.body.addEventListener('keydown', keepSpace);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.removeEventListener('keydown', keepSpace);
    };
  }, []);
}

// Ctrl+V on the board, where the pointer is: images and videos become loose
// media, a video or image address becomes loose media too, other text a note.
function PasteHandler() {
  const { screenToFlowPosition } = useReactFlow();
  const pointer = useRef(null);
  useEffect(() => {
    const onMove = (e) => {
      pointer.current = e.target.closest?.('.canvas') ? { x: e.clientX, y: e.clientY } : null;
    };
    const onPaste = async (e) => {
      const { project, ui } = useStore.getState();
      if (isEditableTarget(document.activeElement) || !project || ui.view !== 'board') return;
      const at = pointer.current || { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      const c = screenToFlowPosition(at);
      const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/') || f.type.startsWith('video/'));
      if (files.length) {
        e.preventDefault();
        const assets = [];
        for (const f of files) assets.push(await api.importBuffer(f.name, f.type, new Uint8Array(await f.arrayBuffer())));
        addFreeImages(assets, c.x - 120, c.y - 90);
        return;
      }
      const text = e.clipboardData?.getData('text/plain')?.trim();
      if (!text) return;
      e.preventDefault();
      const media = /^https?:\/\/\S+$/i.test(text) ? await importFromUrl(text) : [];
      if (media.length) addFreeImages(media, c.x - 120, c.y - 90);
      else addFree({ type: 'note', x: c.x - 110, y: c.y - 75, text });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('paste', onPaste);
    };
  }, [screenToFlowPosition]);
  return null;
}

// Top bar: file and views only.
function TopBar() {
  const view = useStore((s) => s.ui.view);
  const saveState = useStore((s) => s.saveState);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const theme = useStore((s) => s.ui.theme);
  const still = useStore((s) => s.ui.still);
  const saveLabel = { saving: 'Guardando…', pending: 'Guardando…', error: 'Error al guardar', saved: 'Guardado' }[saveState];

  return (
    <header className="topbar">
      <div className="tb-left">
        <ProjectMenu />
        <VersionMenu />
      </div>
      <div className="views">
        <button className={view === 'script' ? 'on' : ''} onClick={() => setUi({ view: 'script' })}>Guion</button>
        <button className={view === 'board' ? 'on' : ''} onClick={() => setUi({ view: 'board' })}>Tablero</button>
        <button className={view === 'preview' ? 'on' : ''} onClick={() => setUi({ view: 'preview' })}>Previsualizar</button>
      </div>
      <div className="tb-right">
        <span className={`save-state ${saveState}`}>{saveLabel}</span>
        {/* Videos on the board and the strip: moving (on) or still (off). */}
        <button
          className={`switch-btn ${still ? '' : 'on'}`}
          role="switch"
          aria-checked={!still}
          onClick={() => {
            try { localStorage.setItem('sb-still', still ? '0' : '1'); } catch { /* only for this session */ }
            setUi({ still: !still });
          }}
        >
          <span className="switch-label">Vídeos</span>
          <span className="switch" aria-hidden="true"><span className="switch-knob" /></span>
        </button>
        <button className="ghost icon" title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'} onClick={toggleTheme}>
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
        </button>
        <button className="ghost icon" disabled={!canUndo} title="Deshacer (Ctrl+Z)" onClick={() => useStore.getState().undo()}><Icon name="undo" /></button>
        <button className="ghost icon" disabled={!canRedo} title="Rehacer (Ctrl+Y)" onClick={() => useStore.getState().redo()}><Icon name="redo" /></button>
      </div>
    </header>
  );
}

const TOOLS = [
  { id: 'select', icon: 'select', label: 'Selección', key: 'V' },
  { id: 'note', icon: 'note', label: 'Nota', key: 'N' },
  { id: 'text', icon: 'text', label: 'Texto grande', key: 'T' },
  { id: 'arrow', icon: 'arrow', label: 'Flecha a mano alzada', key: 'L' },
];

// Vertical tool bar on the left of the board.
function ToolBar() {
  const tool = useStore((s) => s.ui.tool);
  const { screenToFlowPosition, setCenter, getZoom } = useReactFlow();

  const addImages = async () => {
    const paths = await api.pickMedia();
    const res = await api.importPaths(paths);
    if (!res.length) return;
    const c = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    addFreeImages(res.map((r) => r.asset), c.x - 120, c.y - 90);
  };

  // A new zone at the end, and the view goes to it.
  const addZoneAndShow = () => {
    const id = addZone();
    const l = computeLayout(useStore.getState().project).zones[id];
    if (l) setCenter(l.x + l.w / 2, l.y + l.h / 2, { zoom: Math.min(getZoom(), 0.8), duration: 300 });
  };

  const addWindowAtCenter = () => {
    const c = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    const snap = (v) => Math.round(v / GRID) * GRID;
    addWindow(snap(c.x - 240), snap(c.y - 180));
  };

  return (
    <nav className="toolbar-v">
      {TOOLS.map((t) => (
        <button key={t.id} className={tool === t.id ? 'on' : ''} title={`${t.label} (${t.key})`} onClick={() => setUi({ tool: t.id })}>
          <Icon name={t.icon} />
        </button>
      ))}
      <div className="tv-sep" />
      <button title="Imagen o vídeo suelto" onClick={addImages}><Icon name="image" /></button>
      <button title="Importar bocetos (varios a la vez)" onClick={importBocetos}><Icon name="import" /></button>
      <div className="tv-sep" />
      <button title="Nueva zona" onClick={addZoneAndShow}><Icon name="zone" /></button>
      <button title="Nueva ventana (personajes, paleta, tipografía…)" onClick={addWindowAtCenter}><Icon name="window" /></button>
    </nav>
  );
}

// Installed fonts offered while typing in a typography card.
function FontSuggestions() {
  const fonts = useStore((s) => s.ui.fontList);
  return (
    <datalist id="sb-fonts">
      {fonts.map((f) => <option key={f} value={f} />)}
    </datalist>
  );
}

// Small notice at the bottom that goes away on its own (no pop-ups).
function Toast() {
  const toast = useStore((s) => s.ui.toast);
  const pastLen = useStore((s) => s.past.length);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => {
      if (useStore.getState().ui.toast?.id === toast.id) setUi({ toast: null });
    }, 5000);
    return () => clearTimeout(t);
  }, [toast]);
  if (!toast) return null;
  return (
    <div className="toast" role="status">
      <span>{toast.text}</span>
      {toast.action && (
        <button className="ghost" onClick={() => { toast.action.run(); setUi({ toast: null }); }}>{toast.action.label}</button>
      )}
      {toast.undo && pastLen === toast.pastLen && (
        <button className="ghost" onClick={() => { useStore.getState().undo(); setUi({ toast: null }); }}>Deshacer</button>
      )}
      <button className="ghost icon-close" title="Cerrar" onClick={() => setUi({ toast: null })}><Icon name="close" size={14} /></button>
    </div>
  );
}

// ui.lightbox is a picture, or { asset, rot } for one turned in its spot.
function Lightbox() {
  const open = useStore((s) => s.ui.lightbox);
  if (!open) return null;
  const asset = open.asset ?? open;
  const rot = open.rot || 0;
  // Turned on its side, it fits the screen the other way round.
  const turned = rot ? { transform: `rotate(${rot}deg)`, ...(rot % 180 ? { maxWidth: '92vh', maxHeight: '92vw' } : {}) } : undefined;
  return (
    <div className="lightbox" onClick={() => setUi({ lightbox: null })}>
      {embedUrl(asset) ? (
        <iframe
          className="lightbox-embed"
          src={embedUrl(asset)}
          title="Vídeo"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          onClick={(e) => e.stopPropagation()}
        />
      ) : isLink(asset) || isVideoName(asset) ? (
        <video src={mediaUrl(asset)} style={turned} controls autoPlay loop onClick={(e) => e.stopPropagation()} />
      ) : (
        <img src={assetUrl(asset)} style={turned} alt="" />
      )}
    </div>
  );
}

function Workspace() {
  const view = useStore((s) => s.ui.view);
  const importShots = useStore((s) => s.ui.importShots);
  const focusMoment = useStore((s) => s.ui.focusMoment);
  const stripPos = useStore((s) => s.project.settings.stripPos);
  return (
    <ReactFlowProvider>
      <div className="app">
        <TopBar />
        <div className="main">
          <div className={`board strip-${stripPos}`}>
            <StyleStrip />
            <div className="board-canvas">
              <ToolBar />
              <Canvas />
            </div>
          </div>
          {view === 'script' && <ScriptView />}
          {view === 'preview' && <PreviewView />}
        </div>
        {focusMoment && view !== 'script' && <FocusView />}
        {importShots && <ImportShotsDialog />}
        <Lightbox />
        <PasteHandler />
        <PopoverHost />
        <FormatBar />
        <ColorGhost />
      </div>
    </ReactFlowProvider>
  );
}

export default function App() {
  const hasProject = useStore((s) => !!s.project);
  const where = useStore((s) => `${s.file}#${s.doc?.current}`);
  const [booting, setBooting] = useState(true);

  useAutosave();
  useShortcuts();

  useEffect(() => {
    api.openLast()
      .then((r) => { if (r?.data) useStore.getState().load(r); })
      .finally(() => setBooting(false));
  }, []);

  if (booting) return null;
  // Remount the workspace when another project or version is opened so the view resets.
  return (
    <>
      {hasProject ? <Workspace key={where} /> : <Welcome />}
      <Toast />
    </>
  );
}
