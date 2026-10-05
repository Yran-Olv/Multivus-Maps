import type { ShareService } from '@multivus/services'

export class WebShareService implements ShareService {
  async share(input: { title: string; text: string; url?: string }): Promise<'shared' | 'copied' | 'cancelled'> {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: input.title, text: input.text, url: input.url })
        return 'shared'
      } catch {
        return 'cancelled'
      }
    }
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(input.text)
      return 'copied'
    }
    return 'cancelled'
  }
}
