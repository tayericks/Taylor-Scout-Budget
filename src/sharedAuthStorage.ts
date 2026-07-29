function cookieDomain() {
  const host = window.location.hostname
  return host === 'taylorscout.com' || host.endsWith('.taylorscout.com') ? '.taylorscout.com' : undefined
}

function readCookie(name: string) {
  const prefix = `${encodeURIComponent(name)}=`
  const parts = document.cookie ? document.cookie.split('; ') : []
  for (const part of parts) {
    if (part.startsWith(prefix)) return decodeURIComponent(part.slice(prefix.length))
  }
  return null
}

function writeCookie(name: string, value: string, maxAge = 60 * 60 * 24 * 365) {
  const domain = cookieDomain()
  const attrs = ['Path=/', `Max-Age=${maxAge}`, 'SameSite=Lax']
  if (window.location.protocol === 'https:') attrs.push('Secure')
  if (domain) attrs.push(`Domain=${domain}`)
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; ${attrs.join('; ')}`
}

function deleteCookie(name: string) {
  const domain = cookieDomain()
  const attrs = ['Path=/', 'Max-Age=0', 'SameSite=Lax']
  if (window.location.protocol === 'https:') attrs.push('Secure')
  if (domain) attrs.push(`Domain=${domain}`)
  document.cookie = `${encodeURIComponent(name)}=; ${attrs.join('; ')}`
}

export function createSharedCookieStorage() {
  const chunkSize = 3000
  const countKey = (key: string) => `${key}__chunks`
  const chunkKey = (key: string, index: number) => `${key}__${index}`

  const removeCookies = (key: string) => {
    const count = Number(readCookie(countKey(key)) || 0)
    for (let i = 0; i < Math.max(count, 12); i += 1) deleteCookie(chunkKey(key, i))
    deleteCookie(countKey(key))

    // Remove the incompatible cookie names used by the previous Budget build.
    const legacyCount = Number(readCookie(`${key}.chunks`) || 0)
    for (let i = 0; i < Math.max(legacyCount, 12); i += 1) deleteCookie(`${key}.${i}`)
    deleteCookie(`${key}.chunks`)
    deleteCookie(key)
  }

  return {
    getItem(key: string) {
      const count = Number(readCookie(countKey(key)) || 0)
      if (count > 0) {
        let value = ''
        for (let i = 0; i < count; i += 1) value += readCookie(chunkKey(key, i)) || ''
        if (value) return value
      }

      // Migrate any same-origin session into the shared parent-domain cookies.
      const localValue = window.localStorage.getItem(key)
      if (localValue) {
        this.setItem(key, localValue)
        return localValue
      }
      return null
    },
    setItem(key: string, value: string) {
      const text = String(value ?? '')
      removeCookies(key)
      const chunks: string[] = []
      for (let i = 0; i < text.length; i += chunkSize) chunks.push(text.slice(i, i + chunkSize))
      writeCookie(countKey(key), String(chunks.length))
      chunks.forEach((chunk, index) => writeCookie(chunkKey(key, index), chunk))
      window.localStorage.setItem(key, text)
    },
    removeItem(key: string) {
      removeCookies(key)
      window.localStorage.removeItem(key)
    },
  }
}
