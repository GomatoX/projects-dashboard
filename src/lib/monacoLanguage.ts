// Monaco kalbos atpažinimas pagal failo plėtinį arba pavadinimą.
// Bendras tarp `CodeEditor` ir `DiffViewerModal`.

const langMap: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  json: 'json',
  css: 'css',
  scss: 'scss',
  less: 'less',
  html: 'html',
  xml: 'xml',
  md: 'markdown',
  py: 'python',
  rs: 'rust',
  go: 'go',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  yml: 'yaml',
  yaml: 'yaml',
  toml: 'ini',
  env: 'ini',
  sql: 'sql',
  graphql: 'graphql',
  dockerfile: 'dockerfile',
  makefile: 'makefile',
  gitignore: 'ini',
  php: 'php',
  rb: 'ruby',
  java: 'java',
  kt: 'kotlin',
  swift: 'swift',
  c: 'c',
  cpp: 'cpp',
  h: 'c',
  mts: 'typescript',
  mjs: 'javascript',
  cjs: 'javascript',
  svelte: 'html',
  vue: 'html',
};

export function getMonacoLanguage(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';

  // Specialūs failo vardai
  const name = path.split('/').pop()?.toLowerCase() || '';
  if (name === 'dockerfile') return 'dockerfile';
  if (name === 'makefile') return 'makefile';
  if (name === '.gitignore') return 'ini';
  if (name === '.env' || name.startsWith('.env.')) return 'ini';

  return langMap[ext] || 'plaintext';
}
