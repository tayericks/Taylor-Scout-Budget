const CHUNK_SIZE = 3000
function cookieDomain() {
  const host = window.location.hostname
  return host === 'taylorscout.com' || host.endsWith('.taylorscout.com') ? '.taylorscout.com' : undefined
}
function readCookie(name: string) {
  const prefix = `${encodeURIComponent(name)}=`
  const part = (document.cookie ? document.cookie.split('; ') : []).find(v => v.startsWith(prefix))
  return part ? decodeURIComponent(part.slice(prefix.length)) : null
}
function writeCookie(name: string, value: string) {
  const attrs = ['Path=/', 'SameSite=Lax', 'Secure', 'Max-Age=31536000']
  const domain = cookieDomain(); if (domain) attrs.push(`Domain=${domain}`)
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; ${attrs.join('; ')}`
}
function removeCookie(name: string) {
  const attrs = ['Path=/', 'SameSite=Lax', 'Secure', 'Max-Age=0']
  const domain = cookieDomain(); if (domain) attrs.push(`Domain=${domain}`)
  document.cookie = `${encodeURIComponent(name)}=; ${attrs.join('; ')}`
}
export function createSharedCookieStorage() {
  return {
    getItem(key: string) {
      const count = Number(readCookie(`${key}.chunks`) || 0)
      if (count > 0) return Array.from({length:count},(_,i)=>readCookie(`${key}.${i}`)||'').join('')
      const direct = readCookie(key)
      if (direct) return direct
      const local = window.localStorage.getItem(key)
      if (local) this.setItem(key, local)
      return local
    },
    setItem(key: string, value: string) {
      const chunks = Math.max(1, Math.ceil(value.length / CHUNK_SIZE))
      writeCookie(`${key}.chunks`, String(chunks))
      for (let i=0;i<chunks;i++) writeCookie(`${key}.${i}`, value.slice(i*CHUNK_SIZE,(i+1)*CHUNK_SIZE))
      removeCookie(key)
      window.localStorage.setItem(key,value)
    },
    removeItem(key: string) {
      const count = Number(readCookie(`${key}.chunks`) || 0)
      for (let i=0;i<count;i++) removeCookie(`${key}.${i}`)
      removeCookie(`${key}.chunks`); removeCookie(key); window.localStorage.removeItem(key)
    }
  }
}
