/**
 * hostAccess.js — ONE place that decides who may set up / run / cancel games.
 *   canStaff(member): admins, anyone who can moderate, Event Host / Mod / Admin / Staff / Game Host roles
 *   canHost(member):  canStaff + Server Boosters
 * Role names are matched loosely (decorations/emoji ignored, whole words only), so "✧ Royal Staff ✧"
 * and "Game Hosts" both count. EVENT_HOST_ROLE (exact name) still works too.
 */
const EXTRA = (process.env.EVENT_HOST_ROLE || 'Event Host').toLowerCase().trim();
const STAFF_WORDS = /\b(mods?|moderators?|admins?|administrators?|staff|hosts?)\b/;
const clean = n => String(n || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

function canStaff(member) {
  if (!member) return false;
  const p = member.permissions;
  if (p && (p.has('Administrator') || p.has('ManageGuild') || p.has('ModerateMembers') || p.has('ManageMessages'))) return true;
  if (member.guild?.ownerId && member.guild.ownerId === member.id) return true;
  return !!member.roles?.cache?.some(r => clean(r.name) === clean(EXTRA) || STAFF_WORDS.test(clean(r.name)));
}

function isBooster(member) {
  if (!member) return false;
  if (member.premiumSince || member.premiumSinceTimestamp) return true;
  return !!member.roles?.cache?.some(r => r.tags?.premiumSubscriberRole || /\bboosters?\b/.test(clean(r.name)));
}

const canHost = member => canStaff(member) || isBooster(member);

module.exports = { canStaff, canHost, isBooster };
