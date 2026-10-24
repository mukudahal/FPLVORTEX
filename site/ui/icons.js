const paths = {
  pitch:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 12h18M8 3v5H3m13-5v5h5M8 21v-5H3m13 5v-5h5"/><circle cx="12" cy="12" r="3"/>',
  table:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16"/>',
  trophy:'<path d="M8 3h8v6a4 4 0 0 1-8 0V3Zm0 2H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4m-4 2v7m-4 1h8"/>',
  transfer:'<path d="M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4"/>',
  medical:'<rect x="3" y="6" width="18" height="15" rx="2"/><path d="M8 6V3h8v3m-4 5v6m-3-3h6"/>',
  play:'<rect x="2" y="5" width="20" height="14" rx="4"/><path d="m10 9 5 3-5 3V9Z"/>',
  arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
  warning:'<path d="m12 3 10 18H2L12 3Zm0 6v5m0 3h.01"/>',
  chevron:'<path d="m9 5 7 7-7 7"/>'
};
export function icon(name) {
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]??paths.arrow}</svg>`;
}
