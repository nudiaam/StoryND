# StoryND — cómo usarla

## Abrir la app
La primera vez, doble clic en **`Crear acceso directo.vbs`**: deja **StoryND** en el escritorio, con su icono. Después, ábrela desde ahí (o con doble clic en **`Storyboard.vbs`**, que es lo mismo). Se abre sin ventana negra.

**Abrir proyectos con doble clic** (una sola vez): haz doble clic en **`Asociar archivos .storyboard.vbs`**. Desde entonces, los archivos `.storyboard` llevan el icono de StoryND y se abren con doble clic desde el Explorador (si la app ya está abierta, se abren en la misma ventana). Solo afecta a tu usuario de Windows; para deshacerlo, **`Quitar asociacion .storyboard.vbs`**.
Si algún día algo falla, abre **`Iniciar con consola (para errores).bat`**: es lo mismo pero con la consola visible, para ver el error.

## Proyecto de ejemplo
En la carpeta **`Ejemplo`** está **`Caballos de carreras.storyboard`**: un guion completo con zonas, bocetos, style frames, transiciones, fuentes, descartes, moodboards, paleta, tipografías, notas y dos versiones. Sirve para probarlo todo sin tocar tus proyectos.

## Proyectos y versiones
- Cada proyecto es **un archivo** `Nombre.storyboard`. Sus imágenes y vídeos se guardan en una carpeta al lado, `Nombre.storyboard-media` (no hace falta tocarla, pero si mueves el proyecto, mueve las dos cosas juntas). Se guarda solo.
- Al abrir la app sale el último proyecto. En la pantalla de inicio hay una lista de **recientes**.
- **Clic en el nombre del proyecto** (arriba a la izquierda): Nuevo proyecto, Abrir archivo y los recientes. La × de un reciente lo quita de la lista (no borra nada).
- **Versiones**: todas dentro del mismo archivo. Al lado del nombre está la versión en uso; clic para ver todas:
  - clic en una versión para trabajar en ella,
  - **Nueva versión a partir de esta**: una copia de la actual para probar otra idea sin perder la anterior,
  - el **lápiz** que aparece al pasar el ratón renombra cualquier versión (también doble clic en la actual),
  - la × borra una versión (no la actual); el aviso de abajo tiene **Deshacer**.
- Los proyectos de antes (una carpeta con `proyecto.storyboard.json`) se abren igual: la primera vez se crea dentro de esa carpeta un archivo `.storyboard` que sigue usando su carpeta `assets`. No se mueve ni se borra nada.

## Arriba: vistas
- **Guion | Tablero | Previsualizar**: las tres vistas.
- **Interruptor «Vídeos»** (arriba a la derecha, junto al sol/luna): encendido, los vídeos y las imágenes animadas (GIF, WebP) del tablero y de la franja de estilo se mueven; apagado, se quedan quietos (los vídeos no se reproducen ni al pasar el ratón), para que el ordenador no trabaje de más. Se recuerda en este ordenador. En Previsualizar los vídeos se reproducen siempre.
- Deshacer y rehacer (Ctrl+Z y Ctrl+Y).
- **☀ / ☾**: modo claro u oscuro. Al principio sigue al del sistema; luego recuerda tu elección.

## Vista Guion
- La primera vez, pega el guion entero. Cada párrafo (separado por una línea en blanco) es un momento.
- **Editar**: haz clic en el texto de una frase y escribe (con formato, como en el tablero).
- Cada zona tiene su título arriba y una línea de su color en el margen. Los segundos de cada frase se pueden cambiar haciendo clic.
- **Borrar una frase**: pasa el ratón por ella y pulsa la **×** de la derecha (borra también su momento del tablero; Deshacer en el aviso).
- **Seleccionar**: clic en el **hueco** de una frase (no en el texto). Como en el Explorador: **Mayús+clic** selecciona todas las del medio y **Ctrl+clic** añade o quita. Clic fuera de las frases quita la selección.
- **Mover**: arrastra desde el hueco de una frase seleccionada (se mueven todas las seleccionadas), también a otra zona; una línea marca dónde caerán.
- **Doble clic** en el hueco de una frase: la enseña en el tablero.
- **Añadir**: pasa el ratón entre dos frases, antes de la primera o después de la última de cada zona. Salen dos opciones, una a cada lado: **+ texto** (una frase nueva ahí, lista para escribir) y **+ zona** (entre frases, la zona nueva empieza ahí; antes de la primera o después de la última, crea una zona vacía delante o detrás).
- **Mover una zona**: pulsa en su fila de título (fuera del nombre) y arrástrala; una línea marca si irá antes o después de otra. Se lleva todas sus frases.
- **Zonas bloqueadas**: los separadores tienen un candado para evitar accidentes. Con el candado abierto:
  - arrastra un separador (⠿) para mover dónde empieza una zona,
  - la **×** de un separador une esa zona con la anterior.
- Al volver a abrir el proyecto, el candado está cerrado.

## Tablero
Cada momento es una columna. De arriba abajo: **Boceto · Transición · Style frame · Narración · Fuente**.

- **Añadir un momento**: haz clic en la **línea discontinua** que hay entre dos momentos (o al principio o al final).
- **Mover un momento**: arrastra su **número**. Puedes soltarlo en otra zona.
- **Mover una zona**: arrastra el **⠿** de su cabecera.
- **Borrar**: la **×** que aparece al pasar el ratón.
- **Bocetos**: suelta fotos en la fila Boceto o haz clic en el **+**. Se colocan en fila. Arrástralos de un momento a otro.
- **Transiciones**: en la fila Transición hay una llave bajo cada cambio de plano. Haz clic en su **+** para escribir. La última llave es el paso al siguiente momento.
- **Style frame**: uno por momento. Suelta la imagen en su fila (o arrastra ahí un boceto).
- Doble clic en una imagen para verla en grande.
- **Segundos**: junto al número de cada momento aparece su duración («~6,9 s» = estimada por el texto). Haz clic para escribir los tuyos; **↺** vuelve a la estimada.

## Texto con formato
- Todo el texto de dentro de las zonas (narración, citas, transiciones, palabras del moodboard) admite formato: **selecciona unas palabras** y aparece encima una barrita con **negrita**, *cursiva* y **A** (color del texto y color de fondo, de una paleta fija). También **Ctrl+B** y **Ctrl+I**.
- Notas y textos grandes: al seleccionarlos sale su barra con el **color de la nota**, alineación, negrita, cursiva y color del texto. **Doble clic** para escribir; si no estás escribiendo, el formato se aplica a todo el texto.
- Si cambias un texto desde la vista Guion, ese texto pierde el formato (se queda el texto nuevo, limpio).
- El texto que no cabe en su caja se corta; **pasa el ratón por encima** y la caja se queda quieta y deja hacer scroll con la rueda para leerlo entero.

## Herramientas (barra de la izquierda)
| Tecla | Herramienta |
|---|---|
| V | Selección (arrastrar en vacío = seleccionar varias cosas) |
| Mantener Espacio, o botón central del ratón | Mover la vista (con cualquier herramienta, también con la flecha) |
| N | Nota: clic donde quieras ponerla |
| T | Texto grande |
| L | **Flecha a mano alzada** |

Debajo: imagen suelta, **importar bocetos** (varios a la vez, con revisión de dónde va cada uno) y nueva zona (se añade al final y la vista va a ella).

- **Añadir una zona entre otras**: pasa el ratón por una zona y pulsa el **+** redondo que sale en el hueco a su derecha: crea una zona vacía justo después.
- **Textos con más contenido del que cabe** (narración, fuente, transición, palabras): la rueda del ratón encima los desplaza hasta el final, aunque solo sobre una línea; cuando ya no queda más, la rueda vuelve a hacer zoom. Sobre todo lo demás, la rueda siempre hace zoom.
- **Cuadrícula**: zonas, ventanas, notas e imágenes se colocan y miden en la cuadrícula (24 px), así que al moverlas o cambiarles el tamaño sus bordes quedan alineados entre sí.

- **Zoom**: rueda del ratón, como en Miro (se puede acercar hasta ×4).
- **Mapa** (arriba a la derecha): el botón de su esquina lo pliega y lo despliega; recuerda cómo lo dejaste.
- **Esc**: vuelve a Selección.

## Flechas
- Pulsa **L** y dibuja la flecha a mano con el botón izquierdo: la app suaviza el trazo y le pone la punta. Mientras tanto puedes seguir moviéndote con el **botón central** y haciendo zoom con la **rueda**.
- Cada extremo se **pega** a lo que tenga debajo (un boceto, una frase, una fuente, una nota, una zona…). Si mueves esa cosa, la flecha la sigue.
- Al terminar, la flecha queda seleccionada: **+ texto** para escribir qué relación es, **+ imagen** (o suelta imágenes encima) y **borrar**.
- Selecciona una flecha con un clic; **Supr** la borra.

## Franja de estilo
- Está siempre a la vista (en el lateral) mientras trabajas en el tablero. Muestra:
  - el **moodboard general**,
  - el moodboard de **la zona que tienes en pantalla**: al desplazarte por el tablero, cambia sola.
- El **ojo** de su cabecera abre **Mostrar**: marca qué ventanas generales salen en la franja (por ejemplo, una ventana de *Personajes* que hayas creado) y si quieres ver la zona en pantalla. Se guarda en el proyecto.
- **Puedes añadir imágenes desde la franja**: arrástralas encima o usa su **+ imágenes**. Van al moodboard correspondiente. Pasa el ratón por una y su **×** la borra.
- En «Estilo general» la franja muestra también la distribución **Dominante / Secundario / Acento**; puedes arrastrar sus colores a la barra o quitarlos con la ×.
- **Arriba / Lateral** para cambiarla de sitio; **» / ▴** para plegarla.
- Clic en el nombre de la zona para ir a ella; clic en una imagen o vídeo para verlo en grande.
- Los moodboards aceptan **vídeos** (mp4, webm, mov; se reproducen al pasar el ratón) y **colores** (+ color; clic en el color para cambiarlo).

## Previsualizar
- Pestaña **Previsualizar** arriba. Reproduce el storyboard para ver el pacing:
  - a la izquierda, el plano en grande,
  - a la derecha, la narración como **teleprompter**: avanza sola y se ilumina palabra a palabra al ritmo real; las transiciones salen en amarillo,
  - abajo, una **línea fina** para arrastrar por todo el vídeo, las **zonas** como capítulos y los **planos**.
- **Un clic** en una frase o en un plano: ir ahí. **Doble clic**: abre el mismo editor del momento que en el tablero, sin salir del previsualizador.
- **Duraciones**: cada momento dura lo que se tarda en leer su texto (o 2 s si no tiene) y se reparte entre sus bocetos.
  - **Arrastra el borde** derecho de un momento en la línea de tiempo para cambiar cuánto dura.
  - **Doble clic** en ese borde vuelve a la duración estimada.
  - O haz clic en los segundos de cada párrafo del guion (a la derecha) y escríbelos.
  - Si le das menos tiempo del que se tarda en leer el texto, aparece una **línea roja** debajo.
- **Bocetos / Style frames**: elige qué imágenes se reproducen.
- Teclado: **Espacio** reproduce o pausa, **← →** plano anterior y siguiente. Clic en la línea de tiempo para saltar.

## Colocar zonas y ventanas
- **Mover**: arrastra una zona o ventana por su **cabecera** (la parte vacía, no el título). Se ajusta a la cuadrícula.
- **Redimensionar**: haz clic en la cabecera para seleccionarla y arrastra sus esquinas. Al hacer una zona más grande, sus casillas (bocetos, narración, fuentes…) crecen con ella; la letra no cambia.
- **Trabajar aislado**: **doble clic** en una ventana general (en un hueco) la encuadra y apaga el resto del tablero. **Esc** o **Salir** (abajo) vuelve a donde estabas.
- **Zonas en fila**: una zona que nunca has movido va justo detrás de la anterior y la sigue cuando esta se mueve o crece. Si la mueves a otro sitio, se queda donde la dejes; si la sueltas **junto a su hueco** (detrás de la anterior), vuelve a engancharse.
- **Tamaño**: al hacer una zona más grande sus casillas crecen; más pequeña, encogen (hasta la mitad). La letra no cambia.
- El **número de color** de cada zona es su orden cronológico. Moverla de sitio no lo cambia; para cambiar el orden, arrastra ese número sobre otra zona.
- **Nueva ventana** (barra izquierda): ventanas generales extra (personajes, paleta, tipografía…), cada una con su moodboard.

## Imágenes, vídeos y enlaces en cualquier sitio
- **Ctrl+V** pega donde está el ratón: una imagen, un vídeo, o un **enlace** de YouTube / Vimeo / .mp4 (aparece como vídeo; no se descarga).
- **Una sola regla para todas las imágenes y vídeos**: arrastrar **mueve**; con **Alt** al soltar, **copia**. Vale para bocetos, style frames, imágenes de fuente, moodboards, la franja, descartes, imágenes de flechas e imágenes sueltas.
  - Suéltala en una casilla (Boceto, Style frame, Fuente, un moodboard, la franja, una flecha o Descartes) y pasa ahí.
  - Suéltala en el **lienzo vacío**, fuera de zonas y ventanas, y se queda ahí suelta.
  - Si la sueltas sobre una zona pero fuera de una casilla, vuelve a donde estaba.
- Todas las casillas aceptan vídeo. Doble clic para verlo en grande (YouTube y Vimeo con su reproductor). En el tablero, los enlaces de YouTube y Vimeo se ven con su miniatura y sus proporciones (la de Vimeo se pide una vez a Vimeo y se recuerda). Valen también los enlaces privados de Vimeo (`vimeo.com/123/abc…`).
- Los moodboards se ordenan solos en columnas (tipo Pinterest) que respetan la proporción de cada imagen. Arrastra la **esquina** de una imagen para que ocupe 1, 2 o 3 columnas.
- **Colocar**: arrastra una imagen dentro del moodboard y suéltala donde quieras, también **debajo de otra**: cada imagen se queda en su columna; mientras la llevas, el hueco te enseña dónde quedará.
- **Sonido de un vídeo**: los vídeos suenan silenciados. Pasa el ratón por uno (moodboard, boceto o style frame) y pulsa el **altavoz** de arriba a la izquierda para oírlo; al pasar por encima del altavoz sale la barra de **volumen** (uno para toda la app; se recuerda). En Previsualizar el altavoz está junto a Reproducir. Los de YouTube y Vimeo se oyen al verlos en grande (doble clic).
- **Texto en una imagen**: pasa el ratón por una imagen o vídeo del moodboard y pulsa **+ añadir texto** (abajo). Escribe (hasta 60 caracteres) y Enter. La imagen se queda limpia, con una pequeña **T** abajo que indica que tiene texto; al pasar el ratón el texto aparece sobre una franja de cristal que se lee en cualquier imagen. Clic en el texto para cambiarlo; vacío, se quita. También se ve en la franja de estilo.
- **Botones al pasar el ratón** (×, altavoz, + añadir texto, color, esquina de tamaño): aparecen cuando dejas el ratón quieto un momento sobre la imagen, nunca mientras arrastras, y no se pueden pulsar mientras no se ven. Así es fácil agarrar la imagen para moverla. En imágenes estrechas solo quedan la × y la esquina.
- **Copiar notas, textos e imágenes sueltas**: arrástralos con **Alt** pulsado; al soltar, el original se queda donde estaba y la copia aparece donde sueltas (también con varios seleccionados).
- **Capas**: los elementos sueltos (notas, textos grandes, imágenes) van por encima de las zonas; entre ellos, lo último que añades o tocas queda arriba del todo.
- **Tamaño**: arrastra la esquina de una imagen; el moodboard tiene columnas finas, así que puede ser pequeña (una columna) o grande. Suéltala fuera, en otro moodboard o en una casilla, para moverla ahí (con **Alt**, copia).
- Las **palabras** y los **colores** se arrastran desde los **cuatro puntitos** de su esquina superior izquierda (al hacer clic en ellos se edita la palabra o se cambia el color).

## Alinear
- Selecciona varias cosas (zonas, ventanas, notas, imágenes): **Mayús + clic**, o arrastra un recuadro en un hueco vacío.
- Encima aparece una barra: alinear a la izquierda / centro / derecha, arriba / medio / abajo, y **repartir** en horizontal o vertical (mismo espacio entre ellos).
- Una nota o un texto seleccionado muestra botones para alinear su **texto** (izquierda, centro, derecha).

## Estilo general
- Cuatro apartados: **Colores**, **Tipografía**, **Escala tipográfica** y **Fotos** (imágenes, vídeos y palabras).
- **Colores**: clic en un color para abrir el selector: el cuadro y el color en grande al lado, su **HEX** (se puede escribir), el cuentagotas, deslizadores **RGB / CMYK / HSB** (como Illustrator; los números también se escriben) y los colores del proyecto abajo. **Ordenar la paleta**: pulsa un color y arrástralo a otro sitio; los demás se apartan para enseñar dónde quedará.
- **Distribución 60 / 30 / 10**: encima de los colores hay una barra con tres tramos, **Dominante**, **Secundario** y **Acento**, cada uno del ancho de su parte. Arrastra un color de la paleta a un tramo para ponerlo ahí (puede haber varios en cada tramo; se reparten su parte). Pasa el ratón por un color de la barra y su **×** lo quita. Los colores de la paleta que ya están en la barra llevan un puntito.
- **Tipografía**: «+ tipografía» abre la lista de fuentes instaladas, cada una escrita en su propia letra; escribe para buscar, ↑ ↓ y Enter para elegir. Cada ficha enseña sus pesos (Light, Regular, Medium, Bold) y una frase de muestra. Clic en el nombre para cambiar la fuente. Hasta 3.
- **Escala tipográfica**: está plegada; ábrela con el icono **Tt** a la derecha de «Tipografía». Display, Título, Subtítulo, Cuerpo y Etiqueta, cada uno con su fuente, peso y tamaño, y su muestra real.
- **Fichas de palabra** del moodboard: el texto va centrado. Arrastra su esquina para cambiar el tamaño: a lo ancho va por columnas (como mínimo una columna, unos 150 px) y a lo alto es libre, hasta una franja fina. El cuadradito de color junto a los puntitos le cambia el color (colores fijos).

## Momentos clave
- La **estrella** de la cabecera del momento (sale al pasar el ratón) lo marca como clave; otra vez, lo desmarca. También desde el Guion, con la estrella junto a los segundos de cada frase.
- Un momento clave lleva la estrella rellena y su columna, en el tablero, un fondo del color de su zona (más marcado en modo oscuro). En el Guion, la frase lleva ese mismo fondo; en Previsualizar, sus planos llevan un borde del color de la zona.

## Paleta e imágenes de cada momento
- Junto a los segundos de cada momento hay un botón con su paleta en pequeño (discontinuo si aún no tiene) y cuántas imágenes tiene. Púlsalo y se abre encima del tablero:
  - **Paleta**: la barra Dominante / Secundario / Acento del momento; arrastra a ella los colores del proyecto (los de «Estilo general»). Si marcas **Igual que la general**, el momento usa la distribución de «Estilo general» y la sigue: si cambias la general, cambia también (y no se edita desde el momento). Desmárcalo para darle la suya; empieza siendo una copia de la general.
  - **Imágenes**: las referencias de ese momento. **+ añadir**, o suelta imágenes encima. Se arrastran a cualquier casilla como el resto.
- Un clic fuera o **Esc** lo cierra; arrastrar una imagen hacia él no lo cierra. La rueda del ratón encima lo desplaza a él, no al tablero. Lo mismo está en la vista de detalle, pestaña **Referencias**.
- **Fuente** ya solo tiene **+ cita** y **+ enlace**: las imágenes van a las imágenes del momento (las que tenías como fuente se han pasado ahí; si sueltas una imagen en Fuente, también va ahí).

## Moodboard de cada zona
- Está en la cabecera de la zona, a la derecha: el botón **Moodboard** con unas miniaturas y cuántas imágenes tiene. Púlsalo y se despliega encima de los momentos. Puedes soltar imágenes directamente sobre el botón.
- Lleva imágenes, vídeos y palabras (los colores van en la paleta). Como el desplegable del momento: se cierra con un clic fuera o Esc, no al arrastrar algo hacia él, y la rueda encima no mueve el tablero.
- Así la zona ya no tiene el moodboard debajo y ocupa menos.

## Ver un momento en detalle
- Pasa el ratón por un momento y pulsa **⤢**, o haz **doble clic** en cualquier hueco del momento.
- Se abre en grande para mirar y editar. A los lados, el anterior y el siguiente; **← →** para pasar.
- **Narración** arriba del todo. Debajo, a la misma altura y en dos columnas:
  - **Descripción**: qué pasa en el momento.
  - **Apuntes**: ideas sueltas sobre el momento (no describen lo que pasa).
- En el tablero, si un momento tiene descripción o apuntes, al pasar el ratón por su boceto salen dos iconitos en la esquina de abajo a la izquierda (líneas para la descripción, nota amarilla para los apuntes). Clic en uno para leerlo; **Editar** abre el momento.
- A la derecha, dos pestañas:
  - **Referencias**: la paleta del momento (su barra 60/30/10 y los colores del proyecto para arrastrar) y sus imágenes.
  - **Descartes**: arrastra aquí lo que no te convenza; también llegan solos los bocetos y style frames que quites o sustituyas. Para recuperar uno, arrástralo al boceto o al style frame. La **×** lo borra.
- En el tablero, junto a los segundos, el icono de **bandeja** dice cuántos descartes tiene el momento; suelta una imagen encima para descartarla.
- **Esc** para cerrar.

## Otros
- Si la narración no cabe en su caja, se corta con un degradado; pasa el ratón para hacer scroll, o haz clic y la caja crece para verla entera.
- **Ctrl+V** sobre el tablero pega una imagen o un texto copiado.
- Moodboard general (a la izquierda) y moodboard de cada zona (debajo de sus momentos).
