import 'dotenv/config'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { cors } from 'hono/cors'
import { serveStatic } from '@hono/node-server/serve-static'
import { cacheMiddleware } from './middleware/cache'
import contentRoutes from './routes/content'
import previewRoutes from './routes/preview'
import publishedRoutes from './routes/published'
import healthRoutes from './routes/health'
import graphqlRoutes from './routes/graphql'
import { graphqlConfig } from './config/graphql.config'

const app = new Hono()

// Middleware
app.use('*', logger())
app.use('*', cors())
app.use('/api/*', cacheMiddleware) // Cache API routes for 120 seconds

// Routes
app.get('/', (c) => {
  return c.json({
    message: 'GraphQL REST API Wrapper',
    version: '2.0.0',
    endpoints: {
      health: '/health',
      preview: '/api/preview/:contentType',
      published: '/api/published/:contentType',
      graphql: 'POST /graphql (raw GraphQL passthrough)',
      legacy: '/api/:contentType (deprecated)',
      docs: '/docs (interactive API documentation)'
    }
  })
})

app.route('/health', healthRoutes)

// Documentation
app.get('/docs', serveStatic({ path: './public/docs.html' }))

// New routes - authentication determined by path
app.route('/api/preview', previewRoutes)
app.route('/api/published', publishedRoutes)

// Legacy routes - kept for backward compatibility (deprecated)
app.route('/api', contentRoutes)

app.route('/graphql', graphqlRoutes)

// Start server
const port = Number(process.env.PORT) || 3000
console.log(`Server is running on http://localhost:${port}`)
console.log(`GraphQL endpoint: ${graphqlConfig.endpoint}`)

serve({
  fetch: app.fetch,
  port
})
