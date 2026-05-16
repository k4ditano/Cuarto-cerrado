# 🔒 Cuarto Cerrado

Sala de juegos de misterio generados con IA. Cada partida es única: la IA inventa la trama, los puzzles, los sospechosos y las pistas al vuelo.

Modos incluidos:

- **🗺️ Mapdoku** — puzzle lógico estilo Einstein, deducción sobre rejilla
- **🔐 Escape Room narrativo** — habitación cerrada, examinar objetos, resolver puzzles
- **🕵️ Caso criminal** — sospechosos con retratos, interrogatorios, acusación
- **🖼️ Habitación visual** — imagen generada con objetos/símbolos ocultos
- **🧩 Cadena de acertijos** — riddles encadenados temáticamente
- **📜 Cifrados con historia** — mensaje codificado envuelto en mini-trama
- **🎭 Sorpréndeme** — la IA elige y combina

Backend: **Node + Express** que proxea a **Ollama Cloud** (texto) y **OpenAI Images** (imágenes). Las claves quedan en el servidor, nunca en el navegador.

---

## 🚀 Deploy en tu VPS

### Opción A — Docker (recomendado)

```bash
git clone <este-repo> cuarto-cerrado
cd cuarto-cerrado
cp .env.example .env
nano .env          # ← pon tus claves
docker compose up -d --build
```

Listo en `http://TU-VPS:3000`.

### Opción B — Node directo

```bash
git clone <este-repo> cuarto-cerrado
cd cuarto-cerrado
npm install
cp .env.example .env
nano .env
npm start
```

### Detrás de nginx (con HTTPS)

```nginx
server {
    server_name cuarto.tudominio.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
    listen 80;
}
```

Luego `certbot --nginx -d cuarto.tudominio.com`.

---

## 🔑 Variables de entorno (`.env`)

| Variable | Para qué | Default |
| --- | --- | --- |
| `OLLAMA_API_KEY` | Clave de Ollama Cloud ([sácala aquí](https://ollama.com/settings/keys)) | — |
| `OLLAMA_MODEL` | Modelo de texto | `gpt-oss:120b-cloud` |
| `OLLAMA_BASE_URL` | URL base | `https://ollama.com` |
| `OPENAI_API_KEY` | Clave de OpenAI | — |
| `OPENAI_IMAGE_MODEL` | Modelo de imagen | `gpt-image-1` |
| `OPENAI_IMAGE_QUALITY` | `low` / `medium` / `high` | `low` |
| `PORT` | Puerto del servidor | `3000` |
| `ACCESS_PIN` | PIN opcional para proteger la app | (vacío = abierto) |

> Si tienes un Ollama propio corriendo, pon `OLLAMA_BASE_URL=http://localhost:11434` y `OLLAMA_MODEL=gemma3:27b` (o el que prefieras). En ese caso `OLLAMA_API_KEY` puede ser cualquier valor no vacío.

---

## 💸 Coste estimado

Con `OPENAI_IMAGE_QUALITY=low` (~$0.006 / imagen) y modelos cloud de Ollama, una partida típica cuesta entre **5 y 30 céntimos**, según cuántas imágenes genere ese modo.

| Modo | Imágenes / partida |
| --- | --- |
| Mapdoku | 0 |
| Cadena de acertijos | 0 |
| Anagramas | 0 |
| Cifrados | 0 |
| Escape Room | 1–2 |
| Caso criminal | 4–5 (retratos) |
| Habitación visual | 1 |
| Sorpréndeme | variable |

## 👁 Visión: hotspots y narrador que ve

Algunos modos usan un **modelo de visión** (ej. Qwen2.5-VL o Gemma 3) para mejorar la experiencia:

- **Escape Room**: la IA, al generar la habitación, asigna a cada objeto una posición [x, y, w, h] sobre la imagen. Se renderizan como **marcas circulares** con pin rojo (verde al examinar) y tooltip en estilo manuscrito. Pulsa sobre la marca para examinar el objeto.
- **Narrador con visión**: al chatear con el narrador en escape room, la IA recibe la imagen junto a tu mensaje. Cuando preguntes "¿qué hay debajo de la lámpara?" realmente mira la imagen para responder.
- **Habitación Visual → pista visual**: cada pregunta tiene un botón **"👁 pista visual"** que pide a la IA mirar la imagen y darte una pista sin desvelar la respuesta.

### Configurar el modelo de visión

Por defecto: `OLLAMA_VISION_MODEL=qwen2.5vl:32b` (requiere Ollama local con ese modelo).

Alternativas si tienes Ollama local:
- `gemma3:27b` — multimodal de Google
- `llava:13b` — más ligero
- `qwen2.5vl:7b` — ligero

Si no tienes modelo de visión disponible, los hotspots **siguen funcionando** (vienen del JSON estructurado), pero las preguntas libres caerán al modelo de texto normal.

> En Ollama Cloud los modelos con visión disponibles cambian con frecuencia. Revisa [ollama.com/library](https://ollama.com/library) y filtra por `vision`.

## 📚 Archivo compartido (pool)

**Cada caso generado se guarda automáticamente** en `data/pool/<gameId>/` con un índice. La próxima vez que cualquier usuario abra ese modo:

1. Por defecto verá **"📚 Del archivo"** — coge un caso al azar del pool, sin generar y sin coste
2. Si prefiere algo nuevo, puede pulsar **"✨ Caso nuevo"** y se genera con IA

El cliente recuerda qué casos del pool ha jugado cada usuario (`localStorage`) para no repetir. Cuando agota su lista, vuelve a sacar de los ya jugados.

**Resultado:** sólo pagas la primera vez. Tu novia (y cualquier persona con quien compartas la URL) pueden jugar gratis indefinidamente sobre el archivo que tú vayas alimentando.

Para ver el archivo desde la app: en cualquier modo, pulsa **"📂 Explorar archivo"** en la pantalla de inicio.

## 🏆 Récords y favoritos

- Cada victoria en un caso del archivo queda **registrada** (nickname configurable en Ajustes + tiempo + pistas usadas).
- Tras ganar verás la **tabla de récords** de ese caso concreto, con los 5 mejores tiempos.
- En el explorador de archivo puedes dar **❤ like** a tus casos favoritos. Los más votados aparecen primero al ordenar por favoritos.

## 🌟 Caso del día (auto)

El servidor **promociona automáticamente** cada día un caso del archivo a "caso del día" para cada modo. Prioriza los favoritos. Aparece en un banner especial al abrir la app. Si el archivo de algún modo está vacío, ese modo se salta hasta que haya casos.

Se ejecuta al arrancar el servidor y se reevalúa cada hora.

## 📥 Importar archivo

En **Ajustes → Datos locales → "📥 Importar JSON"** puedes subir un archivo con casos pregenerados. Formatos aceptados:

```json
// (a) Un solo modo
{ "gameId": "mapdoku", "cases": [
  { "caseData": {...}, "difficulty": "medio", "title": "..." },
  ...
]}

// (b) Multi-modo
{
  "mapdoku":  [{ "caseData": {...}, "difficulty": "fácil", "title": "..." }, ...],
  "ciphers":  [{ "caseData": {...}, ... }, ...]
}
```

El `caseData` debe coincidir con la estructura interna que produce la IA para ese modo (mira los ejemplos en `data/pool/<gameId>/` después de generar uno).

---

## 🛠️ Cómo funciona

- `index.html` + `src/*` — frontend React (Babel inline, sin build step)
- `server.js` — Express. Endpoints:
  - `POST /api/chat` → Ollama
  - `POST /api/image` → OpenAI Images
  - `GET /api/config` → flags para el frontend
- El historial y las medallas se guardan en `localStorage` del navegador (privado por dispositivo).

Para añadir un modo nuevo: copia uno de los archivos en `src/*.jsx`, regístralo en `src/app.jsx` y añádelo al lobby.
