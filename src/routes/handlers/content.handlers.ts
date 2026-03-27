import type { Context } from 'hono'
import { parseQueryParams } from '../../middleware/queryParser'
import { handleError } from '../../middleware/errorHandler'
import { transformRestToGraphQL } from '../../utils/queryTransformer'
import { formatGraphQLResponse } from '../../utils/responseFormatter'
import { buildGraphQLQuery } from '../../services/query.builder'
import { executeGraphQLQuery } from '../../services/graphql.client'
import { buildFieldSelection } from '../../services/introspection'

/**
 * Shared handler for contentByPath endpoint
 * Used by both preview and published routers
 */
export async function handleContentByPath(c: Context) {
  const startTime = Date.now()

  try {
    // Get auth from context (set by middleware)
    const mode = c.get('mode') as 'edit' | 'ext_preview' | 'public'
    const previewToken = c.get('previewToken') as string | undefined
    const authMethod = c.get('authMethod') as string

    // Parse query parameters
    const restParams = parseQueryParams(c)

    // Get query parameters
    const url = c.req.query('url')
    const base = c.req.query('base') || ''

    if (!url) {
      return c.json({
        error: 'BadRequest',
        message: 'Missing required query parameter: url',
        statusCode: 400
      }, 400)
    }

    // Prepare URL variations (with and without trailing slash)
    const urlNoSlash = url.endsWith('/') ? url.slice(0, -1) : url
    const urlWithSlash = url.endsWith('/') ? url : `${url}/`

    // Build field selection based on requested fields or auto-expansion
    let itemFields = `
      __typename
      _id
      _metadata {
        key
        version
        locale
        displayName
        types
        url {
          default
          hierarchical
          base
        }
      }
    `.trim()

    // If fields are requested or expand is set, enhance the field selection
    if (restParams.fields && restParams.fields.length > 0) {
      // User specified fields - combine with base fields
      const baseFields = ['__typename', '_id']
      const allFields = [...new Set([...baseFields, ...restParams.fields])]
      itemFields = allFields.join('\n        ')
    } else if (restParams.expand === 'auto' || restParams.expand === 'auto_with_fulltext' || restParams.expand === 'full') {
      // Auto-expand fields - use introspection on _Content type
      try {
        const autoFields = await buildFieldSelection('_Content', restParams.depth || 0, new Set(), restParams.expand)
        itemFields = autoFields
      } catch (error) {
        console.warn('Could not auto-expand fields for _Content:', error)
        // Fall back to default fields
      }
    }

    // Build GraphQL query for path-based lookup with dynamic field selection
    const graphqlQuery = `
      query contentByPath($base: String, $url: String!, $urlNoSlash: String!) {
        _Content(
          where: {
            _metadata: { url: { base: { eq: $base } } }
            _and: [
              {
                _or: [
                  { _metadata: { url: { default: { eq: $url } } } }
                  { _metadata: { url: { default: { eq: $urlNoSlash } } } }
                  { _metadata: { url: { hierarchical: { eq: $url } } } }
                  { _metadata: { url: { hierarchical: { eq: $urlNoSlash } } } }
                ]
              }
            ]
          }
        ) {
          item {
            ${itemFields}
          }
        }
      }
    `.trim()

    const variables = {
      base,
      url: urlWithSlash,
      urlNoSlash
    }

    console.log('ContentByPath Query:', graphqlQuery)
    console.log('ContentByPath Variables:', JSON.stringify(variables, null, 2))

    // Execute GraphQL query with auth from middleware
    const graphqlResponse = await executeGraphQLQuery(graphqlQuery, variables, {
      mode,
      previewToken,
      useStoredQueries: restParams.useStoredQueries
    })

    // Format response
    const executionTime = Date.now() - startTime
    const restResponse = formatGraphQLResponse(graphqlResponse, '_Content', executionTime)

    // Return 404 if no content found
    if (!restResponse.item) {
      return c.json({
        error: 'NotFound',
        message: `No content found for path: ${url}`,
        statusCode: 404
      }, 404)
    }

    // Add mode headers
    c.header('X-Content-Mode', mode)
    c.header('X-Auth-Method', authMethod)

    return c.json(restResponse)
  } catch (error) {
    return handleError(error as Error, c)
  }
}

/**
 * Shared handler for content type list endpoint
 * Used by both preview and published routers
 */
export async function handleContentTypeList(c: Context) {
  const startTime = Date.now()

  try {
    // Get auth from context (set by middleware)
    const mode = c.get('mode') as 'edit' | 'ext_preview' | 'public'
    const previewToken = c.get('previewToken') as string | undefined
    const authMethod = c.get('authMethod') as string

    // Get content type from path
    const contentType = c.req.param('contentType')

    // Parse query parameters
    const restParams = parseQueryParams(c)

    // Transform to GraphQL variables
    const graphqlVariables = transformRestToGraphQL(restParams)

    // Build GraphQL query with fragment support and auto-expansion
    const graphqlQuery = await buildGraphQLQuery(
      contentType,
      graphqlVariables,
      restParams.fields,
      restParams.fragments,
      restParams.expand,
      restParams.depth || 0
    )

    console.log('GraphQL Query:', graphqlQuery)
    console.log('GraphQL Variables:', JSON.stringify(graphqlVariables, null, 2))

    // Execute GraphQL query with auth from middleware
    const graphqlResponse = await executeGraphQLQuery(graphqlQuery, graphqlVariables, {
      mode,
      previewToken,
      useStoredQueries: restParams.useStoredQueries
    })

    // Format response
    const executionTime = Date.now() - startTime
    const restResponse = formatGraphQLResponse(graphqlResponse, contentType, executionTime)

    // Add mode headers
    c.header('X-Content-Mode', mode)
    c.header('X-Auth-Method', authMethod)

    return c.json(restResponse)
  } catch (error) {
    return handleError(error as Error, c)
  }
}

/**
 * Shared handler for content type by ID endpoint
 * Used by both preview and published routers
 */
export async function handleContentTypeById(c: Context) {
  const startTime = Date.now()

  try {
    // Get auth from context (set by middleware)
    const mode = c.get('mode') as 'edit' | 'ext_preview' | 'public'
    const previewToken = c.get('previewToken') as string | undefined
    const authMethod = c.get('authMethod') as string

    const contentType = c.req.param('contentType')
    const id = c.req.param('id')

    // Parse query parameters
    const restParams = parseQueryParams(c)

    // Force IDs parameter to single ID
    restParams.ids = [id]

    // Transform to GraphQL variables
    const graphqlVariables = transformRestToGraphQL(restParams)

    // Build GraphQL query with fragment support and auto-expansion
    const graphqlQuery = await buildGraphQLQuery(
      contentType,
      graphqlVariables,
      restParams.fields,
      restParams.fragments,
      restParams.expand,
      restParams.depth || 0
    )

    console.log('GraphQL Query:', graphqlQuery)
    console.log('GraphQL Variables:', JSON.stringify(graphqlVariables, null, 2))

    // Execute GraphQL query with auth from middleware
    const graphqlResponse = await executeGraphQLQuery(graphqlQuery, graphqlVariables, {
      mode,
      previewToken,
      useStoredQueries: restParams.useStoredQueries
    })

    // Format response
    const executionTime = Date.now() - startTime
    const restResponse = formatGraphQLResponse(graphqlResponse, contentType, executionTime)

    // For single item lookup, return 404 if no items found
    if (!restResponse.items || restResponse.items.length === 0) {
      return c.json({
        error: 'NotFound',
        message: `${contentType} with id '${id}' not found`,
        statusCode: 404
      }, 404)
    }

    // Add mode headers
    c.header('X-Content-Mode', mode)
    c.header('X-Auth-Method', authMethod)

    // Return the single item
    return c.json({
      ...restResponse,
      item: restResponse.items[0]
    })
  } catch (error) {
    return handleError(error as Error, c)
  }
}
