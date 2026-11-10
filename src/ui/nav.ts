export function nav(current: string): string {
  const link = (href: string, key: string, text: string) => `<a class="nav" href="${href}"${key === current ? ' aria-current="page"' : ''}>${text}</a>`;
  return `<header class="top"><div class="wrap"><a class="logo" href="./index.html">Damage Report<span class="hand">field notes</span></a>${link('./index.html', 'home', 'Check a file')}${link('./how-it-works.html', 'how', 'How it works')}${link('./scoreboard.html', 'score', 'Scoreboard')}${link('./study.html', 'study', 'Study')}</div></header>`;
}
export const footer = `<footer><div class="wrap">Free and open source (MIT). Your files never leave your computer. <a href="./how-it-works.html#limits">What this tool cannot do</a>.</div></footer>`;
