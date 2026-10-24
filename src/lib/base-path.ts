/** Префикс для путей к файлам из public/ (next не добавляет basePath к обычным <img>). */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || '';

export const withBasePath = (path: string) =>
  /^(https?:)?\/\//.test(path) || !path.startsWith('/') ? path : encodeURI(`${BASE_PATH}${path}`);
