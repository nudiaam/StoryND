# StoryND

**Del guion al storyboard, en un solo sitio.** StoryND es una aplicación de escritorio para preparar vídeos con voz en off: escribes el guion, lo divides en partes, le pones bocetos, style frames, transiciones, fuentes y estilo, y lo previsualizas con sus tiempos para comprobar el ritmo.

![El tablero de StoryND](docs/img/02-zona.png)

## Cómo funciona

1. **Guion.** Pegas el guion y cada párrafo se convierte en un *momento*. Lo divides en *zonas* (gancho, problema, explicación, cierre…).
2. **Tablero.** Cada zona es una tabla: una columna por momento, con su **boceto**, sus **transiciones**, su **style frame**, la **narración** y sus **fuentes**. Alrededor, notas, textos, imágenes y **flechas** a mano alzada, como en Miro.
3. **Estilo.** Paleta con su reparto **60 / 30 / 10**, tipografías y moodboards, siempre a la vista en una franja lateral; y paleta e imágenes propias para cada momento.
4. **Previsualizar.** El vídeo montado, con la narración como teleprompter y una línea de tiempo para ajustar cuánto dura cada momento.

| Guion | Previsualizar |
|---|---|
| ![Vista Guion](docs/img/09-guion.png) | ![Vista Previsualizar](docs/img/10-previsualizar.png) |
| **Estilo general** | **Flechas con anclas y etiquetas** |
| ![Estilo general](docs/img/03-estilo-general.png) | ![Flecha](docs/img/06-flecha.png) |

Además: momentos clave, descripción y apuntes de cada momento, descartes que se recuperan arrastrando, versiones dentro del mismo archivo, imágenes / vídeos / enlaces de YouTube y Vimeo en cualquier sitio, y modo claro y oscuro.

**👉 El manual completo, con capturas, está en [COMO_USAR.md](COMO_USAR.md).**

## Instalar

Hace falta **[Node.js](https://nodejs.org/) 20 o superior** y Windows.

1. Descarga el proyecto (**Code → Download ZIP**) y descomprímelo.
2. Doble clic en **`Crear acceso directo.vbs`**: aparece **StoryND** en el escritorio.
3. Ábrela desde ahí. La primera vez instala lo que necesita y tarda un poco.

Para probarlo todo, abre **`Ejemplo/Caballos de carreras.storyboard`** (desde la app: clic en el nombre del proyecto → Abrir archivo).

Desde la consola también se puede:

```bash
npm install
npm start
```

## Para desarrollar

| Comando | Qué hace |
|---|---|
| `npm run dev` | Vite con recarga en caliente + la app de Electron. |
| `npm run web` | Solo la interfaz en el navegador (`http://localhost:5173`), con un modo de prueba que guarda en el navegador. |
| `npm run build` | Compila la interfaz en `dist/`. |
| `npm start` | Compila y abre la app. |

Hecha con **Electron**, **React**, **[React Flow](https://reactflow.dev/)** y **zustand**. El código está en `src/` (interfaz) y `electron/` (ventana, archivos y versiones). Cada proyecto es un archivo `.storyboard` (JSON) con una carpeta de imágenes al lado. En `docs/` están el plan inicial y las páginas con las que se decidió el diseño.

**Pendiente:** adaptación a vídeo vertical y un tema gris neutro para revisar la teoría del color.

## Novedades

**Versión actual: v0.3.0** (18 de octubre de 2026): moodboards en casillas en todas partes (arrastrar a donde quieras y escalar ancho y alto), la franja de estilo ordenable, descripción y apuntes editables desde el boceto y ventanas que aceptan imágenes en toda su superficie. La versión que tienes se ve abajo a la derecha del tablero.

Todo lo que trae cada versión: **[CHANGELOG.md](CHANGELOG.md)**.

## Licencia
[MIT](LICENSE): se puede usar, copiar, modificar y distribuir libremente.
