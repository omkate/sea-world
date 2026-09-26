import { MANIFEST } from '../../assets/AssetLibrary';

/** Attribution for every third-party model in use (required by CC BY; courtesy for CC0). */
export function mountCredits(root: HTMLElement): void {
  const button = document.createElement('button');
  button.className = 'credits-toggle';
  button.type = 'button';
  button.textContent = 'Credits';
  const panel = document.createElement('aside');
  panel.className = 'credits-panel';
  panel.hidden = true;
  panel.setAttribute('aria-label', '3D model credits');
  const heading = document.createElement('h2');
  heading.textContent = '3D models';
  const list = document.createElement('ul');
  for (const m of MANIFEST) {
    const li = document.createElement('li');
    const title = document.createElement('a');
    title.href = m.source;
    title.target = '_blank';
    title.rel = 'noopener';
    title.textContent = m.title;
    const author = document.createElement('a');
    author.href = m.authorUrl;
    author.target = '_blank';
    author.rel = 'noopener';
    author.textContent = m.author;
    const license = document.createElement('a');
    license.href = m.licenseUrl;
    license.target = '_blank';
    license.rel = 'noopener';
    license.textContent = m.license;
    const mods = document.createElement('small');
    mods.textContent = m.modifications;
    li.append(title, ' by ', author, ' · ', license, document.createElement('br'), mods);
    list.append(li);
  }
  panel.append(heading, list);
  button.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    button.setAttribute('aria-expanded', String(!panel.hidden));
  });
  root.append(button, panel);
}
