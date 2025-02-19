/**
 *
 * @param {AsyncIterable<Uint8Array<ArrayBufferLike>>} iterable
 * @returns {ReadableStream}
 */
function iterableToStream(iterable) {
  return new ReadableStream({
    async pull(controller) {
      const iterator = iterable[Symbol.asyncIterator]()
      const { value, done } = await iterator.next()
      if (value) {
        controller.enqueue(value)
      }
      if (done) {
        controller.close()
      }
    },
  })
}

/**
 * Takes body from fetch response as body and `onUploadProgress` handler
 * and returns async iterable that emits body chunks and emits
 * `onUploadProgress`.
 *
 * @param {ReadableStream | null} body
 * @param {import('./types.js').ProgressFn} onUploadProgress
 * @returns {AsyncIterable<Uint8Array>}
 */
const iterateBodyWithProgress = async function* (body, onUploadProgress) {
  if (body instanceof ReadableStream) {
    const reader = body.getReader()
    const total = 0 // If the total size is unknown
    const lengthComputable = false
    let loaded = 0

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        loaded += value.byteLength
        yield value // Yield the chunk
        onUploadProgress({ total, loaded, lengthComputable })
      }
    } finally {
      reader.releaseLock() // Ensure the reader lock is released
    }
  }
}

/**
 * Takes fetch options and wraps request body to track upload progress if
 * `onUploadProgress` is supplied. Otherwise returns options as is.
 *
 * @param {import('./types.js').FetchOptions} options
 * @returns {import('./types.js').FetchOptions}
 */
const withUploadProgress = (options) => {
  const { onUploadProgress, body } = options

  const rsp = new Response(body)
  // @ts-expect-error web streams from node and web have different types
  const source = iterateBodyWithProgress(rsp.body, onUploadProgress)
  const stream = iterableToStream(source)
  return {
    ...options,
    body: stream,
  }
}

/**
 * @type {import('./types.js').FetchWithUploadProgress}
 */
export const fetchWithUploadProgress = (url, init = {}) => {
  return fetch(url, withUploadProgress(init))
}
