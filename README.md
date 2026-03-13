# LenguAI - Aprende Idiomas con Novelas Visuales

Una plataforma interactiva de aprendizaje de idiomas que utiliza el formato de novela visual para crear experiencias inmersivas. Habla con un compañero de viaje AI que te guía a través de escenarios del mundo real mientras practicas tu idioma objetivo.

## Características

- **Novela Visual Interactiva**: Escenas generadas por IA que se adaptan a la conversación
- **Text-to-Speech**: Escucha la pronunciación correcta de las respuestas
- **Speech-to-Text**: Practica tu pronunciación hablando directamente
- **Corrección Natural**: El AI reformula tus errores de forma conversacional (sin corregirte explícitamente)
- **Respuestas Sugeridas**: 3 opciones de respuesta para guiar tu práctica
- **Multilingüe**: Soporta español, inglés, portugués, francés, chino y tailandés

## Requisitos Previos

- [Node.js](https://nodejs.org/) v18+ o [Bun](https://bun.sh/)
- Cuenta en un proveedor de AI (ver sección de configuración)

## Instalación

```bash
# Clonar el repositorio
git clone https://github.com/munonzito/lenguai.git
cd lenguai

# Instalar dependencias
npm install
# o con bun
bun install

# Copiar archivo de variables de entorno
cp .env.example .env

# Configurar tus API keys en .env (ver sección siguiente)

# Iniciar servidor de desarrollo
npm run dev
# o con bun
bun dev
```

La aplicación estará disponible en `http://localhost:3000`

## Configuración de Proveedores

### Opción 1: Azure OpenAI (Configuración Actual)

Esta es la configuración por defecto del proyecto.

```env
AZURE_OPENAI_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxx
AZURE_OPENAI_ENDPOINT=https://tu-recurso.openai.azure.com/
AZURE_OPENAI_DEPLOYMENT=gpt-4o
AZURE_OPENAI_AUDIO_DEPLOYMENT=gpt-4o-audio-preview
```

**Para obtener credenciales:**
1. Crear un recurso de Azure OpenAI en [portal.azure.com](https://portal.azure.com)
2. Desplegar los modelos `gpt-4o` y `gpt-4o-audio-preview`
3. Copiar el endpoint y la API key desde el portal

### Opción 2: OpenAI Directo

Si prefieres usar la API de OpenAI directamente:

```env
OPENAI_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxx
```

**Nota:** Deberás modificar `server/utils/tools.ts` para usar el TTS de OpenAI en lugar de `gpt-audio`:

```typescript
// Reemplazar generateSpeech() con:
export async function generateSpeech(text: string): Promise<string | null> {
  const openai = getOpenAI();
  const response = await openai.audio.speech.create({
    model: "tts-1",
    voice: "alloy",
    input: text,
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  return `data:audio/mp3;base64,${buffer.toString('base64')}`;
}
```

### Generación de Imágenes (Replicate)

Para la generación de escenas visuales, se usa Replicate:

```env
REPLICATE_API_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxx
```

**Para obtener credenciales:**
1. Crear cuenta en [replicate.com](https://replicate.com)
2. Ir a Account Settings > API tokens
3. Crear un nuevo token

---

## Ideas para Cambiar Proveedores

El proyecto está diseñado para ser modular. Aquí hay ideas para usar proveedores alternativos:

### Alternativas para LLM (Chat)

| Proveedor | Ventajas | Cambios Necesarios |
|-----------|----------|-------------------|
| **Anthropic Claude** | Excelente para roleplay y conversación | Modificar `server/utils/openai.ts` para usar el SDK de Anthropic |
| **Google Gemini** | Buena relación costo/rendimiento | Usar `@google/generative-ai` SDK |
| **Groq** | Muy rápido, económico | Compatible con API de OpenAI, solo cambiar endpoint |
| **Ollama (Local)** | Gratis, privado, sin límites | Usar `ollama` SDK, requiere GPU local |

### Alternativas para Text-to-Speech

| Proveedor | Ventajas | Implementación |
|-----------|----------|----------------|
| **ElevenLabs** | Voces muy naturales, multilingüe | `elevenlabs` SDK |
| **Google Cloud TTS** | Económico, muchos idiomas | `@google-cloud/text-to-speech` |
| **Coqui TTS (Local)** | Gratis, open source | Requiere servidor local |
| **Minimax** (comentado en código) | Buena calidad, económico | Ya implementado, descomentar en `tools.ts` |

### Alternativas para Speech-to-Text

| Proveedor | Ventajas | Implementación |
|-----------|----------|----------------|
| **OpenAI Whisper API** | Alta precisión | `openai.audio.transcriptions.create()` |
| **Deepgram** | Tiempo real, económico | `@deepgram/sdk` |
| **AssemblyAI** | Buena precisión multilingüe | `assemblyai` SDK |
| **Whisper Local** | Gratis, privado | `whisper.cpp` o `faster-whisper` |

### Alternativas para Generación de Imágenes

| Proveedor | Ventajas | Implementación |
|-----------|----------|----------------|
| **DALL-E 3** | Alta calidad, integrado con OpenAI | `openai.images.generate()` |
| **Stability AI** | Económico, rápido | API REST directa |
| **Midjourney** | Mejor calidad artística | Requiere integración con Discord |
| **Stable Diffusion Local** | Gratis, sin límites | ComfyUI o Automatic1111 |

---

## Estructura del Proyecto

```
lenguai/
├── app/
│   └── app.vue              # Componente principal de la aplicación
├── server/
│   ├── api/
│   │   └── chat/
│   │       └── visual-novel/ # Endpoint principal del chat
│   ├── types/
│   │   └── chat.ts          # Tipos TypeScript
│   └── utils/
│       ├── openai.ts        # Cliente de OpenAI/Azure
│       ├── replicate.ts     # Cliente de Replicate
│       └── tools.ts         # Funciones de TTS, STT e imágenes
├── public/                   # Archivos estáticos
├── nuxt.config.ts           # Configuración de Nuxt
└── tailwind.config.ts       # Configuración de Tailwind CSS
```

## Scripts Disponibles

```bash
npm run dev      # Servidor de desarrollo
npm run build    # Compilar para producción
npm run preview  # Previsualizar build de producción
```

## Tecnologías Utilizadas

- **Framework**: [Nuxt 4](https://nuxt.com/) (Vue 3)
- **Estilos**: [Tailwind CSS](https://tailwindcss.com/)
- **LLM**: OpenAI / Azure OpenAI
- **Imágenes**: Replicate (z-image-turbo)
- **TTS**: Azure OpenAI gpt-audio
- **STT**: Replicate (whisper)

## Contribuir

Las contribuciones son bienvenidas. Por favor:

1. Haz fork del repositorio
2. Crea una rama para tu feature (`git checkout -b feature/nueva-funcionalidad`)
3. Commit tus cambios (`git commit -m 'Añadir nueva funcionalidad'`)
4. Push a la rama (`git push origin feature/nueva-funcionalidad`)
5. Abre un Pull Request

## Licencia

MIT
