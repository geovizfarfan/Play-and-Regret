/** Ping everyone who joined, right before a game starts (chunks of 50 mentions, mentions only those users). */
async function pingPlayers(channel, ids, text) {
  const list = [...new Set((ids || []).filter(Boolean))];
  if (list.length < 1) return;
  for (let i = 0; i < list.length; i += 50) {
    const chunk = list.slice(i, i + 50);
    await channel.send({ content: `${i === 0 ? `${text}\n` : ''}${chunk.map(id => `<@${id}>`).join(' ')}`, allowedMentions: { users: chunk } }).catch(() => {});
  }
}
module.exports = { pingPlayers };
