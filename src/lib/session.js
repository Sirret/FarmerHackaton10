// Demo "login": which account this browser uses per role. One click on an account
// square sets it (spec: phone + PIN later; role switcher in the prototype).
// Stored in localStorage as a per-viewer convenience; missing storage just means "not chosen".
import { href } from './url.js';

export const ROLE_PAGE = { farmer: '/farmer', leader: '/kafo', buyer: '/buyer', admin: '/admin' };
export const UNREGISTERED = 'unregistered';

const key = (role) => `ks.session.${role}`;

export function getSession(role) {
  try {
    return localStorage.getItem(key(role));
  } catch {
    return null;
  }
}

export function setSession(role, userId) {
  try {
    localStorage.setItem(key(role), userId);
  } catch {
    /* storage blocked: the page falls back to asking again */
  }
}

/** Log in as an account and open its page (reloads when already on it, so every part switches). */
export function loginAs(role, userId) {
  setSession(role, userId);
  const target = href(ROLE_PAGE[role]);
  const strip = (p) => p.replace(/\/$/, '');
  if (strip(window.location.pathname) === strip(target)) window.location.reload();
  else window.location.href = target;
}
