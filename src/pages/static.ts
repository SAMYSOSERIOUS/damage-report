import '../ui/style.css';
import { nav, footer } from '../ui/nav';
const page = location.pathname.includes('study') ? 'study' : 'how';
document.getElementById('nav')!.innerHTML = nav(page);
document.getElementById('foot')!.innerHTML = footer;
