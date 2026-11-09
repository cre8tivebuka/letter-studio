// Resolve public assets under both a domain root and a GitHub Pages project path.
export const assetUrl=(path:string)=>import.meta.env.BASE_URL+path.replace(/^\/+/, '');
