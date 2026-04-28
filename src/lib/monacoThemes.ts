// One Dark Pro / One Light Monaco temos.
//
// Spalvos suderintos su VS Code "Atom One Dark Pro" ir "Atom One Light"
// paletėmis. Naudojama tiek paprastame redaktoriuje (CodeEditor), tiek
// Git diff peržiūroje (DiffViewer), kad rezultatas būtų vienodas.
//
// Registracijos funkciją kviečiame iš Editor `beforeMount` callback'o.
// Monaco viduje globaliai įsimena temas, tad tas pats `defineTheme`
// gali būti pakviečiamas kelis kartus be problemų.

import type { Monaco } from '@monaco-editor/react';

export const ONE_DARK_PRO = 'one-dark-pro';
export const ONE_LIGHT = 'one-light';

interface MonacoTheme {
  base: 'vs' | 'vs-dark' | 'hc-black' | 'hc-light';
  inherit: boolean;
  rules: Array<{ token: string; foreground?: string; background?: string; fontStyle?: string }>;
  colors: Record<string, string>;
}

// ─── One Dark Pro ─────────────────────────────────────────
// Pagrindas: #282c34 fonas, #abb2bf tekstas. Akcentai – cyan/red/green/yellow/purple.
const oneDarkPro: MonacoTheme = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: '', foreground: 'abb2bf', background: '282c34' },
    { token: 'comment', foreground: '5c6370', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'c678dd' },
    { token: 'keyword.control', foreground: 'c678dd' },
    { token: 'keyword.operator', foreground: '56b6c2' },
    { token: 'operator', foreground: '56b6c2' },
    { token: 'string', foreground: '98c379' },
    { token: 'string.escape', foreground: '56b6c2' },
    { token: 'number', foreground: 'd19a66' },
    { token: 'constant', foreground: 'd19a66' },
    { token: 'constant.language', foreground: 'd19a66' },
    { token: 'constant.numeric', foreground: 'd19a66' },
    { token: 'variable', foreground: 'e06c75' },
    { token: 'variable.predefined', foreground: 'd19a66' },
    { token: 'variable.parameter', foreground: 'abb2bf' },
    { token: 'function', foreground: '61afef' },
    { token: 'entity.name.function', foreground: '61afef' },
    { token: 'support.function', foreground: '61afef' },
    { token: 'type', foreground: 'e5c07b' },
    { token: 'type.identifier', foreground: 'e5c07b' },
    { token: 'class', foreground: 'e5c07b' },
    { token: 'entity.name.class', foreground: 'e5c07b' },
    { token: 'interface', foreground: 'e5c07b' },
    { token: 'tag', foreground: 'e06c75' },
    { token: 'attribute.name', foreground: 'd19a66' },
    { token: 'attribute.value', foreground: '98c379' },
    { token: 'delimiter', foreground: 'abb2bf' },
    { token: 'delimiter.html', foreground: 'abb2bf' },
    { token: 'delimiter.xml', foreground: 'abb2bf' },
    { token: 'metatag', foreground: 'e06c75' },
    { token: 'regexp', foreground: '98c379' },
    { token: 'annotation', foreground: '7f848e' },
  ],
  colors: {
    'editor.background': '#282c34',
    'editor.foreground': '#abb2bf',
    'editor.lineHighlightBackground': '#2c313a',
    'editor.lineHighlightBorder': '#00000000',
    'editor.selectionBackground': '#3e4451',
    'editor.inactiveSelectionBackground': '#3a3f4b',
    'editor.findMatchBackground': '#42557b',
    'editor.findMatchHighlightBackground': '#314365',
    'editorCursor.foreground': '#528bff',
    'editorWhitespace.foreground': '#3b4048',
    'editorIndentGuide.background': '#3b4048',
    'editorIndentGuide.activeBackground': '#545862',
    'editorLineNumber.foreground': '#495162',
    'editorLineNumber.activeForeground': '#abb2bf',
    'editorBracketMatch.background': '#515a6b50',
    'editorBracketMatch.border': '#515a6b',
    'editorGutter.background': '#282c34',
    'editorGutter.modifiedBackground': '#e2c08d',
    'editorGutter.addedBackground': '#98c379',
    'editorGutter.deletedBackground': '#e06c75',
    // Diff specific
    'diffEditor.insertedTextBackground': '#98c37920',
    'diffEditor.removedTextBackground': '#e06c7530',
    'diffEditor.insertedLineBackground': '#98c37915',
    'diffEditor.removedLineBackground': '#e06c7520',
    'diffEditorGutter.insertedLineBackground': '#98c37925',
    'diffEditorGutter.removedLineBackground': '#e06c7530',
    'diffEditorOverview.insertedForeground': '#98c379a0',
    'diffEditorOverview.removedForeground': '#e06c75a0',
    // Misc chrome
    'scrollbarSlider.background': '#4e566660',
    'scrollbarSlider.hoverBackground': '#5a637580',
    'scrollbarSlider.activeBackground': '#747d91a0',
    'minimap.background': '#21252b',
  },
};

// ─── One Light ────────────────────────────────────────────
// Pagrindas: #fafafa fonas, #383a42 tekstas.
const oneLight: MonacoTheme = {
  base: 'vs',
  inherit: true,
  rules: [
    { token: '', foreground: '383a42', background: 'fafafa' },
    { token: 'comment', foreground: 'a0a1a7', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'a626a4' },
    { token: 'keyword.control', foreground: 'a626a4' },
    { token: 'keyword.operator', foreground: '0184bc' },
    { token: 'operator', foreground: '0184bc' },
    { token: 'string', foreground: '50a14f' },
    { token: 'string.escape', foreground: '0184bc' },
    { token: 'number', foreground: '986801' },
    { token: 'constant', foreground: '986801' },
    { token: 'constant.language', foreground: '986801' },
    { token: 'constant.numeric', foreground: '986801' },
    { token: 'variable', foreground: 'e45649' },
    { token: 'variable.predefined', foreground: '986801' },
    { token: 'variable.parameter', foreground: '383a42' },
    { token: 'function', foreground: '4078f2' },
    { token: 'entity.name.function', foreground: '4078f2' },
    { token: 'support.function', foreground: '4078f2' },
    { token: 'type', foreground: 'c18401' },
    { token: 'type.identifier', foreground: 'c18401' },
    { token: 'class', foreground: 'c18401' },
    { token: 'entity.name.class', foreground: 'c18401' },
    { token: 'interface', foreground: 'c18401' },
    { token: 'tag', foreground: 'e45649' },
    { token: 'attribute.name', foreground: '986801' },
    { token: 'attribute.value', foreground: '50a14f' },
    { token: 'delimiter', foreground: '383a42' },
    { token: 'delimiter.html', foreground: '383a42' },
    { token: 'delimiter.xml', foreground: '383a42' },
    { token: 'metatag', foreground: 'e45649' },
    { token: 'regexp', foreground: '50a14f' },
    { token: 'annotation', foreground: 'a0a1a7' },
  ],
  colors: {
    'editor.background': '#fafafa',
    'editor.foreground': '#383a42',
    'editor.lineHighlightBackground': '#f0f0f1',
    'editor.lineHighlightBorder': '#00000000',
    'editor.selectionBackground': '#d4d4d4',
    'editor.inactiveSelectionBackground': '#e5e5e6',
    'editor.findMatchBackground': '#f0c674',
    'editor.findMatchHighlightBackground': '#f7e2a8',
    'editorCursor.foreground': '#526fff',
    'editorWhitespace.foreground': '#d4d4d5',
    'editorIndentGuide.background': '#e5e5e6',
    'editorIndentGuide.activeBackground': '#bfbfbf',
    'editorLineNumber.foreground': '#9d9d9f',
    'editorLineNumber.activeForeground': '#383a42',
    'editorBracketMatch.background': '#d4d4d480',
    'editorBracketMatch.border': '#a0a1a7',
    'editorGutter.background': '#fafafa',
    'editorGutter.modifiedBackground': '#c18401',
    'editorGutter.addedBackground': '#50a14f',
    'editorGutter.deletedBackground': '#e45649',
    // Diff specific
    'diffEditor.insertedTextBackground': '#50a14f25',
    'diffEditor.removedTextBackground': '#e4564925',
    'diffEditor.insertedLineBackground': '#50a14f15',
    'diffEditor.removedLineBackground': '#e4564915',
    'diffEditorGutter.insertedLineBackground': '#50a14f30',
    'diffEditorGutter.removedLineBackground': '#e4564930',
    'diffEditorOverview.insertedForeground': '#50a14fa0',
    'diffEditorOverview.removedForeground': '#e45649a0',
    // Misc chrome
    'scrollbarSlider.background': '#c0c0c060',
    'scrollbarSlider.hoverBackground': '#a0a0a080',
    'scrollbarSlider.activeBackground': '#808080a0',
    'minimap.background': '#f3f3f4',
  },
};

let registered = false;

/**
 * Užregistruoja One Dark Pro ir One Light temas Monaco instancijoje.
 * Idempotentiška: kelis kartus pakviestas neperdarinės temų.
 */
export function registerMonacoThemes(monaco: Monaco): void {
  if (registered) return;
  monaco.editor.defineTheme(ONE_DARK_PRO, oneDarkPro);
  monaco.editor.defineTheme(ONE_LIGHT, oneLight);
  registered = true;
}

/** Grąžina temos pavadinimą pagal Mantine color scheme. */
export function themeForColorScheme(
  colorScheme: 'light' | 'dark',
): typeof ONE_DARK_PRO | typeof ONE_LIGHT {
  return colorScheme === 'dark' ? ONE_DARK_PRO : ONE_LIGHT;
}
