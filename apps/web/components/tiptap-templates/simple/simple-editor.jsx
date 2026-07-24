"use client"

import { useEffect, useRef, useState } from "react"
import { EditorContent, EditorContext, useEditor } from "@tiptap/react"
import { StarterKit } from "@tiptap/starter-kit"
import { TaskItem, TaskList } from "@tiptap/extension-list"
import { TextAlign } from "@tiptap/extension-text-align"
import { Typography } from "@tiptap/extension-typography"
import { Highlight } from "@tiptap/extension-highlight"
import { Subscript } from "@tiptap/extension-subscript"
import { Superscript } from "@tiptap/extension-superscript"
import { Placeholder } from "@tiptap/extension-placeholder"
import { Selection } from "@tiptap/extensions"
import Collaboration from "@tiptap/extension-collaboration"
import CollaborationCaret from "@tiptap/extension-collaboration-caret"

import { Button } from "@/components/tiptap-ui-primitive/button"
import { Spacer } from "@/components/tiptap-ui-primitive/spacer"
import {
  Toolbar,
  ToolbarGroup,
  ToolbarSeparator,
} from "@/components/tiptap-ui-primitive/toolbar"

import { HorizontalRule } from "@/components/tiptap-node/horizontal-rule-node/horizontal-rule-node-extension"
import "@/components/tiptap-node/blockquote-node/blockquote-node.scss"
import "@/components/tiptap-node/code-block-node/code-block-node.scss"
import "@/components/tiptap-node/horizontal-rule-node/horizontal-rule-node.scss"
import "@/components/tiptap-node/list-node/list-node.scss"
import "@/components/tiptap-node/heading-node/heading-node.scss"
import "@/components/tiptap-node/paragraph-node/paragraph-node.scss"

import { HeadingDropdownMenu } from "@/components/tiptap-ui/heading-dropdown-menu"
import { ListDropdownMenu } from "@/components/tiptap-ui/list-dropdown-menu"
import { BlockquoteButton } from "@/components/tiptap-ui/blockquote-button"
import { CodeBlockButton } from "@/components/tiptap-ui/code-block-button"
import {
  ColorHighlightPopover,
  ColorHighlightPopoverContent,
  ColorHighlightPopoverButton,
} from "@/components/tiptap-ui/color-highlight-popover"
import {
  LinkPopover,
  LinkContent,
  LinkButton,
} from "@/components/tiptap-ui/link-popover"
import { MarkButton } from "@/components/tiptap-ui/mark-button"
import { TextAlignButton } from "@/components/tiptap-ui/text-align-button"
import { UndoRedoButton } from "@/components/tiptap-ui/undo-redo-button"

import { ArrowLeftIcon } from "@/components/tiptap-icons/arrow-left-icon"
import { HighlighterIcon } from "@/components/tiptap-icons/highlighter-icon"
import { LinkIcon } from "@/components/tiptap-icons/link-icon"

import { useIsBreakpoint } from "@/hooks/use-is-breakpoint"
import { useWindowSize } from "@/hooks/use-window-size"
import { useCursorVisibility } from "@/hooks/use-cursor-visibility"

import "@/components/tiptap-templates/simple/simple-editor.scss"

export const RICH_CONTENT_FIELD = "richContent"
const PAGERELAY_HIGHLIGHTS = [
  {
    label: "Deep teal",
    value: "#1a535c",
    colorValue: "#1a535c",
    border: "#1a535c",
  },
  {
    label: "Mint",
    value: "#4ecdc4",
    colorValue: "#4ecdc4",
    border: "#4ecdc4",
  },
  {
    label: "Soft white",
    value: "#f7fff7",
    colorValue: "#f7fff7",
    border: "#1a535c",
  },
  {
    label: "Coral",
    value: "#ff6b6b",
    colorValue: "#ff6b6b",
    border: "#ff6b6b",
  },
  {
    label: "Yellow",
    value: "#ffe66d",
    colorValue: "#ffe66d",
    border: "#ffe66d",
  },
]

function renderCollaboratorCaret(user) {
  const caret = document.createElement("span")
  caret.classList.add("collaboration-carets__caret")
  caret.style.borderColor = user.color

  const label = document.createElement("strong")
  label.classList.add("collaboration-carets__label")
  label.style.backgroundColor = user.color
  label.style.color = user.foreground || "#f7fff7"
  label.textContent = user.name
  caret.append(label)

  return caret
}

const MainToolbarContent = ({
  onHighlighterClick,
  onLinkClick,
  isMobile,
}) => (
  <>
    <Spacer />
    <ToolbarGroup>
      <UndoRedoButton action="undo" />
      <UndoRedoButton action="redo" />
    </ToolbarGroup>
    <ToolbarSeparator />
    <ToolbarGroup>
      <HeadingDropdownMenu modal={false} levels={[1, 2, 3, 4]} />
      <ListDropdownMenu
        modal={false}
        types={["bulletList", "orderedList", "taskList"]}
      />
      <BlockquoteButton />
      <CodeBlockButton />
    </ToolbarGroup>
    <ToolbarSeparator />
    <ToolbarGroup>
      <MarkButton type="bold" />
      <MarkButton type="italic" />
      <MarkButton type="strike" />
      <MarkButton type="code" />
      <MarkButton type="underline" />
      {!isMobile ? (
        <ColorHighlightPopover
          colors={PAGERELAY_HIGHLIGHTS}
          useColorValue
        />
      ) : (
        <ColorHighlightPopoverButton onClick={onHighlighterClick} />
      )}
      {!isMobile ? <LinkPopover /> : <LinkButton onClick={onLinkClick} />}
    </ToolbarGroup>
    <ToolbarSeparator />
    <ToolbarGroup>
      <MarkButton type="superscript" />
      <MarkButton type="subscript" />
    </ToolbarGroup>
    <ToolbarSeparator />
    <ToolbarGroup>
      <TextAlignButton align="left" />
      <TextAlignButton align="center" />
      <TextAlignButton align="right" />
      <TextAlignButton align="justify" />
    </ToolbarGroup>
    <Spacer />
  </>
)

const MobileToolbarContent = ({ type, onBack }) => (
  <>
    <ToolbarGroup>
      <Button variant="ghost" onClick={onBack}>
        <ArrowLeftIcon className="tiptap-button-icon" />
        {type === "highlighter" ? (
          <HighlighterIcon className="tiptap-button-icon" />
        ) : (
          <LinkIcon className="tiptap-button-icon" />
        )}
      </Button>
    </ToolbarGroup>
    <ToolbarSeparator />
    {type === "highlighter" ? (
      <ColorHighlightPopoverContent
        colors={PAGERELAY_HIGHLIGHTS}
        useColorValue
      />
    ) : (
      <LinkContent />
    )}
  </>
)

export function SimpleEditor({
  document: collaborationDocument,
  provider,
  user,
  editable,
  onContentChange,
  onReady,
  placeholder,
}) {
  const isMobile = useIsBreakpoint()
  const { height } = useWindowSize()
  const [mobileView, setMobileView] = useState("main")
  const toolbarRef = useRef(null)

  const editor = useEditor(
    {
      immediatelyRender: false,
      editable,
      editorProps: {
        attributes: {
          id: "live-editor",
          autocomplete: "off",
          autocorrect: "on",
          autocapitalize: "sentences",
          spellcheck: "true",
          "aria-label": "Shared live document",
          "aria-describedby": "editor-help",
          class: "simple-editor",
        },
      },
      extensions: [
        StarterKit.configure({
          horizontalRule: false,
          undoRedo: false,
          link: {
            openOnClick: false,
            enableClickSelection: true,
          },
        }),
        HorizontalRule,
        TextAlign.configure({ types: ["heading", "paragraph"] }),
        TaskList,
        TaskItem.configure({ nested: true }),
        Highlight.configure({ multicolor: true }),
        Typography,
        Superscript,
        Subscript,
        Selection,
        Placeholder.configure({ placeholder }),
        Collaboration.configure({
          document: collaborationDocument,
          field: RICH_CONTENT_FIELD,
        }),
        CollaborationCaret.configure({
          provider,
          user,
          render: renderCollaboratorCaret,
        }),
      ],
      onCreate: ({ editor: createdEditor }) => {
        onReady?.(createdEditor)
        onContentChange?.(createdEditor.getText())
      },
      onUpdate: ({ editor: updatedEditor }) => {
        onContentChange?.(updatedEditor.getText())
      },
    },
    [collaborationDocument, provider],
  )

  const rect = useCursorVisibility({
    editor,
    overlayHeight: toolbarRef.current?.getBoundingClientRect().height ?? 0,
  })

  useEffect(() => {
    if (!editor) return
    editor.setEditable(editable)
    provider.awareness.setLocalStateField("user", editable ? user : null)
  }, [editable, editor, provider, user])

  useEffect(() => {
    if (!isMobile && mobileView !== "main") setMobileView("main")
  }, [isMobile, mobileView])

  return (
    <div
      className="simple-editor-wrapper pagerelay-simple-editor"
      data-read-only={!editable}
    >
      <EditorContext.Provider value={{ editor }}>
        {editable && (
          <Toolbar
            ref={toolbarRef}
            style={
              isMobile
                ? { bottom: `calc(100% - ${height - rect.y}px)` }
                : undefined
            }
          >
            {mobileView === "main" ? (
              <MainToolbarContent
                onHighlighterClick={() => setMobileView("highlighter")}
                onLinkClick={() => setMobileView("link")}
                isMobile={isMobile}
              />
            ) : (
              <MobileToolbarContent
                type={mobileView === "highlighter" ? "highlighter" : "link"}
                onBack={() => setMobileView("main")}
              />
            )}
          </Toolbar>
        )}
        <EditorContent
          editor={editor}
          role="presentation"
          className="simple-editor-content"
        />
      </EditorContext.Provider>
    </div>
  )
}
