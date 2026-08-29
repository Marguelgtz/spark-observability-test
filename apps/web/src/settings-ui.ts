function node<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

export function renderSettingsPlaceholder(): HTMLElement {
  const main = node('main', 'settings-page centered-state');
  main.dataset.testid = 'settings-view';
  const section = node('section', 'status-state');
  section.append(
    node('p', 'eyebrow', 'SETTINGS'),
    node('h1', undefined, 'Dashboard preferences are coming next.'),
    node('p', 'state-copy', 'This route is reserved for persisted window, preview, density, collapse, and repository defaults. Account identity and GitHub access remain under the avatar menu.'),
  );
  main.append(section);
  return main;
}
