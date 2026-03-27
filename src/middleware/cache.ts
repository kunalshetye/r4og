import { Context, Next } from 'hono'

interface CacheEntry {
  data: any
  timestamp: number
  headers: Record<string, string>
}

class ResponseCache {
  private cache: Map<string, CacheEntry> = new Map()
  private ttl: number

  constructor(ttlSeconds: number = 120) {
    this.ttl = ttlSeconds * 1000 // Convert to milliseconds

    // Clean up expired entries every minute
    setInterval(() => this.cleanup(), 60000)
  }

  private generateKey(url: string, method: string): string {
    return `${method}:${url}`
  }

  get(url: string, method: string): CacheEntry | null {
    const key = this.generateKey(url, method)
    const entry = this.cache.get(key)

    if (!entry) {
      return null
    }

    const age = Date.now() - entry.timestamp
    if (age > this.ttl) {
      this.cache.delete(key)
      return null
    }

    return entry
  }

  set(url: string, method: string, data: any, headers: Record<string, string>): void {
    const key = this.generateKey(url, method)
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      headers
    })
  }

  private cleanup(): void {
    const now = Date.now()
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttl) {
        this.cache.delete(key)
      }
    }
  }

  clear(): void {
    this.cache.clear()
  }

  size(): number {
    return this.cache.size
  }
}

// Create singleton cache instance with 120 second TTL
const responseCache = new ResponseCache(120)

/**
 * Cache middleware for GET requests
 * Caches responses for 120 seconds to improve performance
 */
export const cacheMiddleware = async (c: Context, next: Next) => {
  const method = c.req.method

  // Only cache GET requests
  if (method !== 'GET') {
    return next()
  }

  const url = c.req.url

  // Check if we have a cached response
  const cached = responseCache.get(url, method)
  if (cached) {
    const age = Math.floor((Date.now() - cached.timestamp) / 1000)

    // Return cached response with cache headers
    return c.json(cached.data, {
      headers: {
        ...cached.headers,
        'X-Cache': 'HIT',
        'X-Cache-Age': age.toString(),
        'Cache-Control': `public, max-age=${120 - age}`
      }
    })
  }

  // Execute the request
  await next()

  // Cache successful responses (2xx status codes)
  if (c.res.status >= 200 && c.res.status < 300) {
    try {
      const clonedResponse = c.res.clone()
      const data = await clonedResponse.json()

      // Extract relevant headers
      const headers: Record<string, string> = {}
      clonedResponse.headers.forEach((value, key) => {
        headers[key] = value
      })

      responseCache.set(url, method, data, headers)

      // Add cache headers to the response
      c.res.headers.set('X-Cache', 'MISS')
      c.res.headers.set('Cache-Control', 'public, max-age=120')
    } catch (error) {
      // If we can't parse JSON, don't cache
      console.warn('Could not cache response:', error)
    }
  }
}

export { responseCache }
