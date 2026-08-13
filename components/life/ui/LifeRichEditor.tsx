'use client'

// Notion-style inline editor, matching the feature set of
// habdullahjaved/notion-text-editor: slash menu, bubble menu, headings, lists,
// task lists, quote, code block, rule, highlight.
// Replaces LifeMarkdownEditor (CodeMirror) — that was a source editor, which
// is a different product from an inline one.
//
// Tiptap v3 notes: StarterKit already bundles link/underline/list-keymap, and
// BubbleMenu moved to the @tiptap/react/menus subpath.

import Highlight from '@tiptap/extension-highlight'
import Placeholder from '@tiptap/extension-placeholder'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import Typography from '@tiptap/extension-typography'
import { Extension, type Editor } from '@tiptap/core'
import { EditorContent, ReactRenderer, useEditor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import Suggestion from '@tiptap/suggestion'
import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react'

interface SlashCommand {
  title: string
  hint: string
  run: (editor: Editor) => void
}

const SLASH_COMMANDS: SlashCommand[] = [
  { title: 'Text', hint: 'Plain paragraph', run: (e) => e.chain().focus().setParagraph().run() },
  { title: 'Heading 1', hint: 'Big section', run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run() },
  { title: 'Heading 2', hint: 'Medium section', run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run() },
  { title: 'Heading 3', hint: 'Small section', run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run() },
  { title: 'Bullet list', hint: 'Unordered', run: (e) => e.chain().focus().toggleBulletList().run() },
  { title: 'Numbered list', hint: 'Ordered', run: (e) => e.chain().focus().toggleOrderedList().run() },
  { title: 'To-do list', hint: 'Checkboxes', run: (e) => e.chain().focus().toggleTaskList().run() },
  { title: 'Quote', hint: 'Blockquote', run: (e) => e.chain().focus().toggleBlockquote().run() },
  { title: 'Code block', hint: 'Monospaced', run: (e) => e.chain().focus().toggleCodeBlock().run() },
  { title: 'Divider', hint: 'Horizontal rule', run: (e) => e.chain().focus().setHorizontalRule().run() },
]

interface SlashListHandle {
  onKeyDown: (event: KeyboardEvent) => boolean
}

const SlashList = forwardRef<
  SlashListHandle,
  { items: SlashCommand[]; command: (item: SlashCommand) => void }
>(function SlashList({ items, command }, ref) {
  const [active, setActive] = useState(0)

  useEffect(() => setActive(0), [items])

  useImperativeHandle(ref, () => ({
    onKeyDown: (event) => {
      if (event.key === 'ArrowDown') {
        setActive((i) => (i + 1) % items.length)
        return true
      }
      if (event.key === 'ArrowUp') {
        setActive((i) => (i - 1 + items.length) % items.length)
        return true
      }
      if (event.key === 'Enter') {
        if (items[active]) command(items[active])
        return true
      }
      return false
    },
  }))

  if (!items.length) return null

  return (
    <div className="life-slash">
      {items.map((item, i) => (
        <button
          key={item.title}
          type="button"
          className={`life-slash-item${i === active ? ' is-active' : ''}`}
          onMouseEnter={() => setActive(i)}
          onClick={() => command(item)}
        >
          <span className="life-slash-title">{item.title}</span>
          <span className="life-slash-hint">{item.hint}</span>
        </button>
      ))}
    </div>
  )
})

/** `/` opens the block menu, exactly as Notion does. */
const SlashMenu = Extension.create({
  name: 'slashMenu',
  addProseMirrorPlugins() {
    return [
      Suggestion<SlashCommand>({
        editor: this.editor,
        char: '/',
        startOfLine: false,
        items: ({ query }) =>
          SLASH_COMMANDS.filter((item) =>
            item.title.toLowerCase().includes(query.toLowerCase()),
          ),
        command: ({ editor, range, props }) => {
          editor.chain().focus().deleteRange(range).run()
          props.run(editor)
        },
        render: () => {
          let component: ReactRenderer<SlashListHandle> | null = null
          let el: HTMLElement | null = null

          const place = (rect?: DOMRect | null) => {
            if (!el || !rect) return
            el.style.top = `${rect.bottom + 6}px`
            el.style.left = `${rect.left}px`
          }

          return {
            onStart: (props) => {
              component = new ReactRenderer(SlashList, {
                props,
                editor: props.editor,
              })
              el = document.createElement('div')
              el.className = 'life-slash-anchor'
              el.appendChild(component.element)
              // Portalled to the shell, not body — every --life-* variable is
              // scoped to .life-shell.
              ;(document.querySelector('.life-shell') ?? document.body).appendChild(el)
              place(props.clientRect?.())
            },
            onUpdate: (props) => {
              component?.updateProps(props)
              place(props.clientRect?.())
            },
            onKeyDown: (props) => {
              if (props.event.key === 'Escape') {
                el?.remove()
                return true
              }
              return component?.ref?.onKeyDown(props.event) ?? false
            },
            onExit: () => {
              el?.remove()
              el = null
              component?.destroy()
              component = null
            },
          }
        },
      }),
    ]
  },
})

export function LifeRichEditor({
  content,
  onChange,
  docKey,
  placeholder = "Write something, or press '/' for blocks…",
}: {
  content: string
  onChange?: (html: string) => void
  /** Changing this reloads the document — pass the page id. */
  docKey?: string
  placeholder?: string
}) {
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const editor = useEditor(
    {
      immediatelyRender: false, // SSR: ProseMirror needs the DOM
      extensions: [
        StarterKit,
        TaskList,
        TaskItem.configure({ nested: true }),
        Highlight,
        Typography,
        Placeholder.configure({ placeholder }),
        SlashMenu,
      ],
      content,
      onUpdate: ({ editor: e }) => onChangeRef.current?.(e.getHTML()),
      editorProps: { attributes: { class: 'life-rich-content' } },
    },
    [docKey],
  )

  if (!editor) return <div className="life-rich" />

  const mark = (name: string, attrs?: Record<string, unknown>) =>
    editor.isActive(name, attrs) ? ' is-on' : ''

  return (
    <div className="life-rich">
      <BubbleMenu editor={editor}>
        <div className="life-bubble">
          <button type="button" className={`life-bubble-btn${mark('bold')}`} onClick={() => editor.chain().focus().toggleBold().run()}>
            <strong>B</strong>
          </button>
          <button type="button" className={`life-bubble-btn${mark('italic')}`} onClick={() => editor.chain().focus().toggleItalic().run()}>
            <em>I</em>
          </button>
          <button type="button" className={`life-bubble-btn${mark('strike')}`} onClick={() => editor.chain().focus().toggleStrike().run()}>
            <s>S</s>
          </button>
          <button type="button" className={`life-bubble-btn${mark('code')}`} onClick={() => editor.chain().focus().toggleCode().run()}>
            {'</>'}
          </button>
          <button type="button" className={`life-bubble-btn${mark('highlight')}`} onClick={() => editor.chain().focus().toggleHighlight().run()}>
            H
          </button>
          <span className="life-bubble-sep" />
          <button type="button" className={`life-bubble-btn${mark('heading', { level: 1 })}`} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
            H1
          </button>
          <button type="button" className={`life-bubble-btn${mark('heading', { level: 2 })}`} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
            H2
          </button>
          <button type="button" className={`life-bubble-btn${mark('bulletList')}`} onClick={() => editor.chain().focus().toggleBulletList().run()}>
            •
          </button>
          <button type="button" className={`life-bubble-btn${mark('taskList')}`} onClick={() => editor.chain().focus().toggleTaskList().run()}>
            ✓
          </button>
        </div>
      </BubbleMenu>

      <EditorContent editor={editor} />
    </div>
  )
}
