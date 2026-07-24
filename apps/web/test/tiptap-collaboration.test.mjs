import assert from "node:assert/strict"
import test from "node:test"
import { getSchema } from "@tiptap/core"
import { StarterKit } from "@tiptap/starter-kit"
import {
  prosemirrorJSONToYXmlFragment,
  yXmlFragmentToProsemirrorJSON,
} from "@tiptap/y-tiptap"
import * as Y from "yjs"

const field = "richContent"
const schema = getSchema([StarterKit.configure({ undoRedo: false })])

function sync(source, target) {
  Y.applyUpdate(target, Y.encodeStateAsUpdate(source), "test-sync")
}

test("Tiptap rich content converges after concurrent Yjs edits", () => {
  const aliceDocument = new Y.Doc()
  const bobDocument = new Y.Doc()
  const aliceContent = aliceDocument.getXmlFragment(field)
  const bobContent = bobDocument.getXmlFragment(field)

  prosemirrorJSONToYXmlFragment(
    schema,
    {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Launch notes" }],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              marks: [{ type: "bold" }],
              text: "Ready together",
            },
          ],
        },
      ],
    },
    aliceContent,
  )
  sync(aliceDocument, bobDocument)

  const initialBobContent = yXmlFragmentToProsemirrorJSON(bobContent)
  assert.equal(initialBobContent.content[0].content[0].text, "Launch notes")
  assert.equal(initialBobContent.content[1].content[0].marks[0].type, "bold")

  const aliceParagraphText = aliceContent.get(1).get(0)
  const bobParagraphText = bobContent.get(1).get(0)
  aliceParagraphText.insert(0, "Alice ")
  bobParagraphText.insert(bobParagraphText.length, " Bob")

  sync(aliceDocument, bobDocument)
  sync(bobDocument, aliceDocument)

  const aliceJSON = yXmlFragmentToProsemirrorJSON(aliceContent)
  const bobJSON = yXmlFragmentToProsemirrorJSON(bobContent)
  const finalText = aliceJSON.content[1].content
    .map((node) => node.text || "")
    .join("")

  assert.equal(finalText.includes("Alice"), true)
  assert.equal(finalText.includes("Bob"), true)
  assert.equal(JSON.stringify(bobJSON), JSON.stringify(aliceJSON))

  aliceDocument.destroy()
  bobDocument.destroy()
})
