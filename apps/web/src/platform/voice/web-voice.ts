import type { VoiceService } from '@multivus/services'

export class WebVoiceService implements VoiceService {
  private enabled = true
  private lastSpokenText: string | null = null
  private lastSpokenTime = 0
  private ptVoice: SpeechSynthesisVoice | null = null

  constructor() {
    this.initVoice()
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = () => {
        this.initVoice()
      }
    }
  }

  private initVoice(): void {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    const voices = window.speechSynthesis.getVoices()
    this.ptVoice =
      voices.find((v) => v.lang === 'pt-BR') ||
      voices.find((v) => v.lang.startsWith('pt')) ||
      null
  }

  speak(text: string, force = false): void {
    if (!this.enabled || !text.trim()) return
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return

    const now = Date.now()
    // Deduplicação: se for exatamente o mesmo texto falado nos últimos 8 segundos, ignora
    if (!force && this.lastSpokenText === text && now - this.lastSpokenTime < 8000) {
      return
    }

    try {
      window.speechSynthesis.cancel() // Interrompe fala anterior para aviso imediato
      const utterance = new SpeechSynthesisUtterance(text)
      if (this.ptVoice) {
        utterance.voice = this.ptVoice
      }
      utterance.lang = 'pt-BR'
      utterance.rate = 1.05 // Levemente acelerado para fluidez em moto/carro
      utterance.pitch = 1.0

      this.lastSpokenText = text
      this.lastSpokenTime = now

      window.speechSynthesis.speak(utterance)
    } catch (err) {
      console.warn('Falha na síntese de voz (TTS):', err)
    }
  }

  stop(): void {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    if (!enabled) {
      this.stop()
    }
  }

  isEnabled(): boolean {
    return this.enabled
  }
}
