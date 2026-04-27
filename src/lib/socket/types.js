/**
 * Safe defaults for a freshly registered device. Interactive so the user
 * sees what Claude wants to do, with Read-family tools auto-allowed because
 * they're inert and prompting for every Read would make any non-trivial
 * task painful. Deny patterns block the obvious foot-guns.
 */
export const DEFAULT_CLAUDE_PERMISSIONS = {
    mode: 'interactive',
    autoAllowTools: ['Read', 'Glob', 'Grep', 'LS', 'WebSearch', 'WebFetch'],
    denyPatterns: ['rm -rf /', 'mkfs', ':(){ :|:& };:', 'dd if=', '> /dev/sda'],
};
