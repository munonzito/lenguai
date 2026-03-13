<script setup lang="ts">
import { computed, ref } from 'vue'

interface ChatResponse {
  text: string
  suggested_responses: string[]
  language_detected?: string
  image_url?: string | null
  audio_url?: string | null
  user_transcription?: string
}

const currentImage = ref<string>('https://placehold.co/1024x768?text=Welcome+to+LenguAI')
const currentText = ref<string>('Where do you want to go today?')
const suggestedOptions = ref<string[]>(['To the market', 'To the library', 'Surprise me'])
const showOptions = ref<boolean>(true) // Show options initially, hide while waiting for audio
const isLoading = ref(false)
const loadingStatus = ref<string>('')
const isRecording = ref(false)
const mediaRecorder = ref<MediaRecorder | null>(null)
const audioChunks = ref<Blob[]>([])
const audioPlayer = ref<HTMLAudioElement | null>(null)
const isAudioPlaying = ref(false)
const isAudioEnded = ref(false)
const currentAudioUrl = ref<string | null>(null)
const currentWordIndex = ref<number>(-1)
const wordTimings = ref<{ word: string; startTime: number; endTime: number }[]>([])

// History state
const conversationHistory = ref<{ role: 'user' | 'assistant'; content: string }[]>([])

type CountryOption = {
  country: string
  label: string
  flag: string
  seedPrompt: string
}

const countryOptions: CountryOption[] = [
  {
    country: 'France',
    label: 'France',
    flag: '🇫🇷',
    seedPrompt:
      "Crée un décor dans un lieu aléatoire en France, et fais du jeu de rôle avec l’utilisateur tout en lui enseignant le français."
  },
  {
    country: 'United States',
    label: 'United States',
    flag: '🇺🇸',
    seedPrompt:
      'Create a setting in a random place in the United States, and roleplay with the user while you teach them English.'
  },
  {
    country: 'Spain',
    label: 'Spain',
    flag: '🇪🇸',
    seedPrompt:
      'Crea un escenario en un lugar aleatorio de España y haz roleplay con el usuario mientras le enseñas español.'
  },
  {
    country: 'Italy',
    label: 'Italy',
    flag: '🇮🇹',
    seedPrompt:
      "Crea un'ambientazione in un luogo casuale in Italia e fai roleplay con l'utente mentre gli insegni l'italiano."
  },
  {
    country: 'Brasil',
    label: 'Brasil',
    flag: '🇧🇷',
    seedPrompt:
      'Crie um cenário em um lugar aleatório no Brasil e faça roleplay com o usuário enquanto você ensina português.'
  }
]

const isEmptyState = computed(() => conversationHistory.value.length === 0 && !isLoading.value)

// Helper: Calculate Weighted Timings
const calculateWordTimings = (text: string, duration: number) => {
  const words = text.split(' ')
  const timings = []
  
  // 1. Calculate Weights
  let totalWeight = 0
  const weights = words.map(word => {
    // Base weight is character length
    // FIX: Set a minimum weight (e.g., 4) so short words don't get tiny durations
    // Short words (2-3 chars) take almost as much "mental time" to process as 4-5 char words in speech rhythm
    let weight = Math.max(word.length, 3) 
    
    // Add weight for punctuation
    if (word.includes(',') || word.includes(';')) weight += 3
    if (word.includes('.') || word.includes('!') || word.includes('?')) weight += 5
    totalWeight += weight
    return weight
  })

  // 2. Distribute Duration
  const timePerUnit = duration / totalWeight
  let currentTime = 0

  for (let i = 0; i < words.length; i++) {
    const wordDuration = weights[i] * timePerUnit
    timings.push({
      word: words[i],
      startTime: currentTime,
      endTime: currentTime + wordDuration
    })
    currentTime += wordDuration
  }
  
  return timings
}

// Audio playback logic
const playAudio = (url: string) => {
  // If resuming the same audio
  if (currentAudioUrl.value === url && audioPlayer.value) {
    if (audioPlayer.value.paused) {
      audioPlayer.value.play().catch(e => console.error("Resume interrupted:", e))
      isAudioPlaying.value = true
      isAudioEnded.value = false
    } else {
      audioPlayer.value.pause()
      isAudioPlaying.value = false
    }
    return
  }

  // Stop existing audio if playing different url
  if (audioPlayer.value) {
    audioPlayer.value.pause()
    audioPlayer.value.currentTime = 0
  }

  // Create new audio instance
  currentAudioUrl.value = url
  const audio = new Audio(url)
  audioPlayer.value = audio
  
  // Reset karaoke state
  currentWordIndex.value = -1
  isAudioPlaying.value = true
  isAudioEnded.value = false

  // Wait for metadata to calculate timings
  audio.addEventListener('loadedmetadata', () => {
    if (!audio.duration || !currentText.value) return
    wordTimings.value = calculateWordTimings(currentText.value, audio.duration)
  })

  // Sync loop
  audio.addEventListener('timeupdate', () => {
    const time = audio.currentTime
    // Find the word active at this time
    // We search through timings to find where time falls between start/end
    const index = wordTimings.value.findIndex(t => time >= t.startTime && time < t.endTime)
    
    // Only update if index changed and is valid (>=0). 
    // If findIndex returns -1 (e.g. at end), we might want to keep the last word or clear.
    // Let's keep the valid index.
    if (index !== -1) {
       currentWordIndex.value = index
    }
  })

  audio.addEventListener('ended', () => {
    isAudioPlaying.value = false
    isAudioEnded.value = true
    currentWordIndex.value = -1 // Reset highlight on end
  })
  
  audio.addEventListener('error', (e) => {
    console.error("Error playing audio:", e)
    isAudioPlaying.value = false
  })

  audio.play().catch(e => console.error("Play request interrupted:", e))
}

const replayAudio = () => {
    if (currentAudioUrl.value) {
        // Reset player state to force a fresh start
        if (audioPlayer.value) {
            audioPlayer.value.currentTime = 0
            audioPlayer.value.play().catch(e => console.error("Replay interrupted:", e))
            isAudioPlaying.value = true
            isAudioEnded.value = false
        } else {
            // Fallback if player instance lost
            playAudio(currentAudioUrl.value)
        }
    }
}

// Send message to backend
const sendMessage = async (text?: string, audioBlob?: Blob) => {
  // Stop audio when sending new message
  if (audioPlayer.value) {
    audioPlayer.value.pause()
    isAudioPlaying.value = false
  }
  isLoading.value = true
  showOptions.value = false // Hide options while processing
  try {
    
    if (text) {
      // Add user message to history
      conversationHistory.value.push({ role: 'user', content: text })
    }
    
    // Construct payload with full history
    let payload: any = {
      messages: conversationHistory.value
    }

    if (audioBlob) {
        // Convert blob to base64 data URI
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
            const base64data = reader.result as string;
            // Send base64 as the "audioUrl" (Replicate supports data URIs for some inputs)
            payload.audioUrl = base64data;
            await executeRequest(payload);
        }
        return; 
    }

    await executeRequest(payload);

  } catch (error) {
    console.error('Error sending message:', error)
    showOptions.value = true // Show options on error
    isLoading.value = false
  } finally {
    // isLoading.value = false // Handled in stream end or error
  }
}

const executeRequest = async (payload: any) => {
    try {
        const response = await fetch('/api/chat/visual-novel', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        })

        if (!response.ok) {
            console.error('[ERROR] Request failed:', response.status);
            throw new Error('Failed to fetch')
        }

        if (!response.body) {
            throw new Error('ReadableStream not supported')
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        
        console.log('[SSE Client] Starting to read stream')
        
        while (true) {
            const { done, value } = await reader.read()
            if (done) {
                console.log('[SSE Client] Stream ended')
                break
            }
            
            const chunk = decoder.decode(value, { stream: true })
            console.log('[SSE Client] Received chunk:', chunk.substring(0, 200))
            
            buffer += chunk
            const events = buffer.split('\n\n')
            buffer = events.pop() || '' // Keep incomplete event in buffer
            
            for (const eventBlock of events) {
                if (!eventBlock.trim()) continue
                
                console.log('[SSE Client] Processing event block:', eventBlock.substring(0, 200))
                
                const lines = eventBlock.split('\n')
                let eventType = ''
                let eventData = null
                
                for (const line of lines) {
                    if (line.startsWith('event: ')) {
                        eventType = line.substring(7).trim()
                        console.log('[SSE Client] Event type:', eventType)
                    } else if (line.startsWith('data: ')) {
                        try {
                            eventData = JSON.parse(line.substring(6))
                            console.log('[SSE Client] Event data:', eventData)
                        } catch (e) {
                            console.error('[SSE Client] Failed to parse event data:', e, 'Raw:', line.substring(6))
                        }
                    }
                }
                
                if (eventType && eventData) {
                    if (eventType === 'status') {
                        loadingStatus.value = eventData.message
                        console.log('Status:', eventData.message)
                    } else if (eventType === 'image') {
                        // Progressive: Show image immediately when ready
                        if (eventData.image_url) {
                            currentImage.value = eventData.image_url
                            console.log('Image updated immediately')
                        }
                    } else if (eventType === 'text') {
                        // Progressive: Show text immediately when ready
                        currentText.value = eventData.text
                        
                        // Update History with Assistant Response
                        conversationHistory.value.push({ role: 'assistant', content: eventData.text })

                        if (eventData.user_transcription) {
                            conversationHistory.value.splice(conversationHistory.value.length - 1, 0, { 
                                role: 'user', 
                                content: eventData.user_transcription 
                            })
                        }
                        
                        console.log('Text updated immediately')
                        // Note: Options still hidden, waiting for audio
                    } else if (eventType === 'audio') {
                        // Progressive: Play audio and show options when ready
                        if (eventData.audio_url) {
                            playAudio(eventData.audio_url)
                        }
                        
                        if (eventData.suggested_responses) {
                            suggestedOptions.value = eventData.suggested_responses
                        }
                        
                        // Now show options and finish loading
                        showOptions.value = true
                        isLoading.value = false
                        loadingStatus.value = ''
                        console.log('Audio ready, showing options')
                    } else if (eventType === 'done') {
                        // Conversation saved successfully
                        console.log('Stream completed successfully')
                    } else if (eventType === 'error') {
                        // Handle error event
                        console.error('Stream error:', eventData.message)
                        showOptions.value = true // Show options even on error
                        isLoading.value = false
                        loadingStatus.value = ''
                    }
                }
            }
        }
    } catch (e) {
        console.error("Stream error:", e)
        showOptions.value = true // Show options even on stream error
        isLoading.value = false
        loadingStatus.value = ''
    }
}

const handleOptionClick = (option: string) => {
  sendMessage(option)
}

const handleCountryClick = (option: CountryOption) => {
  sendMessage(option.seedPrompt)
}

// Recording Logic
const startRecording = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    mediaRecorder.value = new MediaRecorder(stream)
    audioChunks.value = []
    
    mediaRecorder.value.ondataavailable = (event) => {
      audioChunks.value.push(event.data)
    }
    
    mediaRecorder.value.start()
    isRecording.value = true
  } catch (err) {
    console.error("Error accessing microphone:", err)
  }
}

const stopRecording = () => {
  if (!mediaRecorder.value) return
  
  mediaRecorder.value.onstop = () => {
    const audioBlob = new Blob(audioChunks.value, { type: 'audio/wav' })
    sendMessage(undefined, audioBlob)
  }
  
  mediaRecorder.value.stop()
  isRecording.value = false
}

const toggleRecording = () => {
  if (isRecording.value) {
    stopRecording()
  } else {
    startRecording()
  }
}
</script>

<template>
  <div class="h-screen w-full bg-slate-900 relative overflow-hidden font-sans">

    <!-- Scene Background (soft) -->
    <div class="absolute inset-0 z-0">
      <img
        :src="currentImage"
        alt="Scene background"
        class="absolute inset-0 w-full h-full object-cover transition-opacity duration-700 blur-md scale-105 opacity-35"
      />
      <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent"></div>
    </div>

    <!-- Scene Card (centered, rounded) -->
    <div class="absolute left-1/2 top-8 z-[1] w-full max-w-5xl -translate-x-1/2 px-4">
      <div class="rounded-3xl overflow-hidden shadow-2xl border border-white/20 bg-black/10">
        <div class="aspect-[16/9] w-full">
          <img :src="currentImage" alt="Scene" class="w-full h-full object-cover" />
        </div>
      </div>
    </div>

    <!-- Header (over scene) -->
    <div class="absolute top-0 inset-x-0 z-10 w-full p-4 flex justify-between items-center bg-gradient-to-b from-black/30 to-transparent">
      <div class="text-white/80 font-bold tracking-wider text-sm bg-black/20 px-3 py-1 rounded-full backdrop-blur-sm">
        LenguAI
      </div>
      <!-- Settings or Progress could go here -->
    </div>

    <!-- Bottom Panel (fixed height; does not overlap the scene) -->
    <div class="absolute inset-x-0 bottom-0 z-10 w-full px-4 md:px-8 pb-8">
      <div class="w-full max-w-6xl mx-auto flex flex-col justify-end gap-6 max-h-[80vh] overflow-y-auto">

        <!-- Interaction Area: Floating Choices -->
        <div v-if="isEmptyState" class="w-full">
          <div class="text-white/90 font-semibold tracking-wide text-base md:text-lg mb-3">
            Where do you want to go today?
          </div>
          <div class="grid grid-cols-2 md:grid-cols-5 gap-2 md:gap-3">
            <button
              v-for="option in countryOptions"
              :key="option.country"
              @click="handleCountryClick(option)"
              :disabled="isLoading"
              class="group flex items-center gap-2 bg-surface/90 hover:bg-white text-slate-800 py-3 px-3 rounded-2xl shadow-lg border-2 border-transparent hover:border-primary/20 transition-all duration-300 transform hover:-translate-y-0.5 hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span class="text-xl leading-none">{{ option.flag }}</span>
              <span class="font-semibold text-sm md:text-base truncate">{{ option.label }}</span>
            </button>
          </div>
        </div>

        <div v-else-if="showOptions" class="flex flex-col items-end gap-3 pr-2">
          <button
            v-for="(option, index) in suggestedOptions"
            :key="index"
            @click="handleOptionClick(option)"
            :disabled="isLoading"
            class="group relative max-w-[90%] md:max-w-[70%] bg-surface/90 hover:bg-white text-slate-800 text-left py-3 px-5 rounded-2xl rounded-tr-sm shadow-lg border-2 border-transparent hover:border-primary/20 transition-all duration-300 transform hover:-translate-y-1 hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span class="text-primary font-bold mr-2 group-hover:text-secondary transition-colors">{{ index + 1 }}.</span>
            <span class="font-medium">{{ option }}</span>
          </button>
        </div>

        <!-- Narrative Box (Glassmorphism) -->
        <div class="bg-surface/80 backdrop-blur-xl border border-white/40 rounded-3xl p-6 md:p-8 shadow-2xl animate-fade-in-up relative overflow-hidden">
        
        <!-- Decorative Top Line -->
        <div class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-secondary to-primary opacity-50"></div>

        <div class="flex flex-col md:flex-row gap-6 items-center md:items-start">
            
            <!-- Tutor Avatar / Label -->
            <div class="flex-shrink-0 flex flex-col items-center gap-2">
                <div class="w-12 h-12 md:w-14 md:h-14 rounded-full bg-gradient-to-br from-primary to-indigo-700 flex items-center justify-center shadow-md text-white font-bold text-xl">
                    AI
                </div>
                <span class="text-xs font-bold text-slate-500 uppercase tracking-widest">Tutor</span>
            </div>

            <!-- Text Content -->
            <div class="flex-grow">
                <!-- Loading State -->
                <p v-if="isLoading" class="text-slate-800 text-lg md:text-xl leading-relaxed font-serif font-medium flex items-center">
                    {{ loadingStatus || 'Writing story...' }}
                    <span class="inline-block w-1.5 h-5 ml-1 bg-slate-400 animate-pulse"></span>
                </p>

                <!-- Karaoke / Word Highlight Mode -->
                <p v-else-if="isAudioPlaying && wordTimings.length > 0" class="text-slate-800 text-lg md:text-xl leading-relaxed font-serif font-semibold flex flex-wrap gap-x-1.5">
                    <span 
                        v-for="(item, index) in wordTimings" 
                        :key="index"
                        :class="[
                            'relative inline-block transition-transform duration-200 rounded px-0.5 text-slate-700',
                            currentWordIndex === index 
                                ? 'bg-primary/10 text-primary shadow-sm transform -translate-y-0.5 scale-[1.03] ring-1 ring-primary/15' 
                                : ''
                        ]"
                    >
                        {{ item.word }}
                    </span>
                </p>

                <!-- Static Text Fallback (When not highlighting) -->
                <p v-else class="text-slate-800 text-lg md:text-xl leading-relaxed font-serif font-medium">
                    {{ currentText }}
                </p>

                <!-- Audio Controls (Small, subtle) -->
                <div v-if="!isLoading && currentAudioUrl" class="mt-4 flex gap-3">
                    <!-- Play/Pause Button -->
                     <button 
                        @click="currentAudioUrl && playAudio(currentAudioUrl)"
                        class="p-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
                        title="Play/Pause narration"
                    >
                        <svg v-if="isAudioPlaying" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
                        <svg v-else xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                    </button>

                    <!-- Replay Button (Only if finished or paused) -->
                    <button 
                        v-if="isAudioEnded || (!isAudioPlaying && currentAudioUrl)"
                        @click="replayAudio"
                        class="p-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
                        title="Replay from start"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3"/></svg>
                    </button>
                </div>
            </div>

            <!-- Mic Button (Integrated) -->
            <div class="flex-shrink-0">
                 <button 
                    @click="toggleRecording"
                    :disabled="isLoading"
                    :class="[
                    'rounded-full p-4 transition-all duration-300 shadow-md flex items-center justify-center border-2',
                    isRecording 
                        ? 'bg-red-50 text-red-500 border-red-200 animate-pulse scale-110' 
                        : 'bg-white text-primary border-indigo-100 hover:border-primary hover:bg-indigo-50 hover:scale-105'
                    ]"
                    :title="isRecording ? 'Stop Recording' : 'Speak your answer'"
                >
                    <!-- Mic Icon -->
                    <svg v-if="!isRecording" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
                    <!-- Stop Icon -->
                    <svg v-else xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="6" width="12" height="12" rx="2"></rect></svg>
                </button>
            </div>

        </div>
      </div>

      </div>
    </div>

  </div>
</template>

<style>
/* Animation Utilities */
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-fade-in-up {
  animation: fadeInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

/* Custom Scrollbar for text if needed */
::-webkit-scrollbar {
  width: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}
</style>
