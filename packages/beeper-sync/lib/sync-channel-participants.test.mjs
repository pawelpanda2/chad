/**
 * Regression: outbound-only chats must still create a contact from participants
 * (Story 106 — 26-08-01_nn_latina had only isSender messages).
 */
import assert from "node:assert/strict";

function participantContactsFromChat(chatInfo) {
  const items =
    chatInfo.participants?.items ??
    (Array.isArray(chatInfo.participants) ? chatInfo.participants : []);
  return items
    .filter((p) => p && !p.isSelf && p.id)
    .map((p) => ({
      senderID: p.id,
      displayName: p.fullName || p.phoneNumber || chatInfo.title || p.id,
      username: p.phoneNumber || undefined,
    }));
}

const chat = {
  title: "26-08-01_nn_latina",
  participants: {
    items: [
      {
        id: "@other",
        isSelf: false,
        fullName: "26-08-01_nn_latina",
        phoneNumber: "+48572549017",
      },
      { id: "@me", isSelf: true, fullName: "Me" },
    ],
  },
};

const contacts = participantContactsFromChat(chat);
assert.equal(contacts.length, 1);
assert.equal(contacts[0].displayName, "26-08-01_nn_latina");
assert.equal(contacts[0].username, "+48572549017");

const selfOnly = participantContactsFromChat({
  title: "x",
  participants: { items: [{ id: "@me", isSelf: true }] },
});
assert.equal(selfOnly.length, 0);

console.log("sync-channel-participants.test.mjs: ok");
