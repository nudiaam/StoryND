# StoryND

Aplicación de escritorio para pasar de un **guion** a un **storyboard con style frames** y comprobar el **ritmo** del vídeo, sin perder el hilo entre:

- **qué se dice**: el guion y la narración;
- **de dónde sale**: fuentes, citas y referencias;
- **cómo se ve**: bocetos, style frames, paletas, tipografías y moodboards.

Todo vive en un tablero libre (como Miro), ordenado en **zonas** que se leen de izquierda a derecha, con una vista de **Guion** para escribir y reordenar el texto, y una de **Previsualizar** para ver el vídeo montado con sus tiempos.

> Hecha para Windows con Electron. La interfaz está en español.

---

## Qué hace

### Tres vistas
| Vista | Para qué |
|---|---|
| **Guion** | Pegar el guion y trabajarlo como texto: cada párrafo es un **momento**. Se divide en zonas, se reordenan frases y zonas arrastrando, y se ajustan los segundos de cada una. |
| **Tablero** | Cada zona es una tabla de momentos en columnas, con sus filas: **boceto**, **transición**, **style frame**, **narración** y **fuente**. Alrededor, notas, textos, imágenes sueltas y flechas a mano alzada. |
| **Previsualizar** | El vídeo montado: los bocetos (o style frames) en orden, con la narración en un teleprompter, línea de tiempo por zonas, velocidad y duración de cada plano. |

### En el tablero
- **Zonas** con nombre, color y orden; se colocan donde quieras y se pueden ensanchar.
- **Momentos**: número, duración (estimada por las palabras o fijada a mano), bocetos con sus transiciones, style frame, narración con formato (negrita, cursiva, colores), y fuentes (citas y enlaces).
- **Momentos clave**: se marcan con una estrella y destacan en el tablero, el guion y la previsualización.
- **Descripción y apuntes** de cada momento (qué pasa / ideas sueltas), visibles desde el boceto.
- **Descartes**: lo que se quita no se pierde; se recupera arrastrándolo de vuelta.
- **Estilo general**: paleta de colores con su **distribución 60 / 30 / 10** (dominante, secundario, acento), tipografías con escala tipográfica, y fotos de referencia.
- **Paleta e imágenes de cada momento**, en un desplegable desde su cabecera (puede seguir a la paleta general o tener la suya).
- **Moodboard de cada zona**, en un desplegable desde su cabecera.
- **Franja de estilo** a la derecha: la paleta y los moodboards siempre a la vista mientras trabajas.
- **Flechas a mano alzada** que se pegan a lo que unen y lo siguen; con texto e imágenes.
- **Imágenes, vídeos y enlaces** de YouTube / Vimeo en cualquier casilla: arrastrar mueve, con **Alt** copia.
- Notas, textos grandes, capas, cuadrícula, alinear y repartir, deshacer y rehacer.
- Modo **claro y oscuro**.

La guía completa, pantalla por pantalla, está en **[COMO_USAR.md](COMO_USAR.md)**.

### Proyectos
- Cada proyecto es **un archivo** `Nombre.storyboard` (JSON) y una carpeta al lado, `Nombre.storyboard-media`, con sus imágenes y vídeos. Se guarda solo, mientras trabajas.
- **Versiones** dentro del mismo archivo, para probar otra idea sin perder la anterior.
- En **[Ejemplo/](Ejemplo)** hay un proyecto completo, *Caballos de carreras*, para probarlo todo.

---

## Instalar y abrir

Hace falta **[Node.js](https://nodejs.org/) 20 o superior** (incluye `npm`).

```bash
git clone <url-del-repositorio>
cd StoryND
npm install
npm start
```

`npm start` compila la interfaz y abre la app.

### En Windows, sin consola
- **`Crear acceso directo.vbs`**: doble clic una vez y tendrás **StoryND** en el escritorio, con su icono. A partir de ahí, se abre desde ese acceso directo.
- **`Storyboard.vbs`**: abre la app sin ventana negra (es lo que usa el acceso directo; la primera vez instala lo necesario).
- **`Asociar archivos .storyboard.vbs`**: una sola vez, para que los `.storyboard` se abran con doble clic y lleven el icono de StoryND (solo para tu usuario). **`Quitar asociacion .storyboard.vbs`** lo deshace.
- **`Iniciar con consola (para errores).bat`**: lo mismo, pero con la consola visible por si algo falla.

### Para desarrollar
| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de Vite con recarga en caliente + la app de Electron apuntando a él. |
| `npm run web` | Solo la interfaz en el navegador (`http://localhost:5173`). Sin Electron, la app usa un **modo de prueba** que guarda el proyecto en el navegador, útil para probar sin tocar archivos reales. |
| `npm run build` | Compila la interfaz en `dist/`. |
| `npm start` | Compila y abre la app de escritorio. |

---

## Cómo está hecha

```
electron/          Proceso principal de Electron
  main.cjs         Ventana, archivos .storyboard, versiones, recientes, protocolo sb://
  preload.cjs      Puente seguro (window.api) entre la interfaz y el sistema de archivos
  icon.png, storyboard.ico
src/               Interfaz (React)
  App.jsx          Barra superior, herramientas, atajos, vistas
  store.js         Estado (zustand + immer), deshacer/rehacer y migración de formatos antiguos
  actions.js       Todas las operaciones sobre el proyecto
  layout.js        Cálculo de posiciones del tablero (zonas, momentos, moodboards)
  api.js           Acceso a archivos (Electron) o modo de prueba en el navegador
  canvas/          Tablero (React Flow): zonas, momentos, notas, flechas, alineación
  ScriptView.jsx   Vista Guion
  PreviewView.jsx  Vista Previsualizar
  FocusView.jsx    Un momento en detalle
  Palette.jsx      Distribución 60/30/10 y referencias de cada momento
  StyleStrip.jsx   Franja de estilo
  styles.css       Estilos; todos los colores son variables (modo claro y oscuro)
Ejemplo/           Proyecto de ejemplo
Iconos/            Icono de la app y el script que lo dibuja
docs/              Plan inicial y páginas de propuestas de diseño
```

- **Electron 44** para la app de escritorio, con `contextIsolation` y una política de seguridad de contenido (CSP) estricta en la versión compilada.
- **React 19** + **[React Flow](https://reactflow.dev/) 12** para el tablero.
- **zustand** + **immer** para el estado, con historial para deshacer.
- **Vite** para compilar.
- Las imágenes y vídeos del proyecto se sirven con un protocolo propio, `sb://asset/<nombre>`, que admite peticiones parciales para poder avanzar en los vídeos.

### Formato del archivo `.storyboard`

```json
{
  "app": "storyboard",
  "format": 3,
  "media": "Nombre.storyboard-media",
  "current": "<id de la versión en uso>",
  "versions": [
    { "id": "…", "name": "Versión 1", "created": "…", "updated": "…", "data": { "zones": [], "moments": {}, "free": [], "arrows": [], "settings": {} } }
  ]
}
```

Los proyectos de formatos anteriores se actualizan solos al abrirlos (`migrate` en `src/store.js`).

### Propuestas de diseño
Las decisiones visuales se tomaron comparando versiones en páginas HTML interactivas. Están en **[docs/propuestas/](docs/propuestas)**; se ven con `npm run web` abriendo `http://localhost:5173/docs/propuestas/<página>.html`.

---

## Pendiente
- Adaptación a **vídeo vertical**, cambiable en un proyecto ya empezado.
- Un tema **gris neutro** para revisar la teoría del color sin que la interfaz influya.

---

## Licencia
[MIT](LICENSE): se puede usar, copiar, modificar y distribuir libremente.
