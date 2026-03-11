import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import TextAlign from '@tiptap/extension-text-align';
import { useEffect, useMemo } from 'react';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
  Code,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Undo,
  Redo,
  ImageIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface TipTapEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  className?: string;
  editable?: boolean;
}

export function TipTapEditor({
  content,
  onChange,
  placeholder = 'Write your email...',
  className,
  editable = true,
}: TipTapEditorProps) {
  // Memoize extensions array to prevent recreation and duplicate warnings
  const extensions = useMemo(
    () => [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-[#37bd7e] underline cursor-pointer hover:text-[#2da56b]',
        },
      }),
      Image.configure({
        HTMLAttributes: {
          class: 'max-w-full h-auto rounded-lg',
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
    ],
    [placeholder]
  );

  const editor = useEditor({
    extensions,
    content,
    editable,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'prose prose-invert max-w-none focus:outline-none min-h-[200px] p-4',
      },
    },
  });

  // Update editor content when prop changes externally
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  // Sync editable prop — TipTap doesn't auto-update on prop change
  useEffect(() => {
    if (editor && editor.isEditable !== editable) {
      editor.setEditable(editable);
    }
  }, [editable, editor]);

  if (!editor) {
    return null;
  }

  return (
    <div className={cn('border border-gray-800 rounded-lg bg-gray-900/50', className)}>
      {/* Toolbar */}
      {editable && (
        <div className="border-b border-gray-800 p-2 flex flex-wrap gap-1">
          {/* Text Formatting */}
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            isActive={editor.isActive('bold')}
            icon={<Bold className="w-4 h-4" />}
            title="Bold (Ctrl+B)"
          />
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            isActive={editor.isActive('italic')}
            icon={<Italic className="w-4 h-4" />}
            title="Italic (Ctrl+I)"
          />
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            isActive={editor.isActive('underline')}
            icon={<UnderlineIcon className="w-4 h-4" />}
            title="Underline (Ctrl+U)"
          />

          <div className="w-px h-6 bg-gray-700 mx-1" />

          {/* Lists */}
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            isActive={editor.isActive('bulletList')}
            icon={<List className="w-4 h-4" />}
            title="Bullet List"
          />
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            isActive={editor.isActive('orderedList')}
            icon={<ListOrdered className="w-4 h-4" />}
            title="Numbered List"
          />

          <div className="w-px h-6 bg-gray-700 mx-1" />

          {/* Block Formatting */}
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            isActive={editor.isActive('blockquote')}
            icon={<Quote className="w-4 h-4" />}
            title="Quote"
          />
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            isActive={editor.isActive('codeBlock')}
            icon={<Code className="w-4 h-4" />}
            title="Code Block"
          />

          <div className="w-px h-6 bg-gray-700 mx-1" />

          {/* Link */}
          <ToolbarButton
            onClick={() => {
              const url = window.prompt('Enter URL:');
              if (url) {
                editor.chain().focus().setLink({ href: url }).run();
              }
            }}
            isActive={editor.isActive('link')}
            icon={<LinkIcon className="w-4 h-4" />}
            title="Add Link"
          />

          {/* Image */}
          <ToolbarButton
            onClick={() => {
              const url = window.prompt('Enter image URL:');
              if (url) {
                editor.chain().focus().setImage({ src: url }).run();
              }
            }}
            icon={<ImageIcon className="w-4 h-4" />}
            title="Add Image"
          />

          <div className="w-px h-6 bg-gray-700 mx-1" />

          {/* Text Alignment */}
          <ToolbarButton
            onClick={() => editor.chain().focus().setTextAlign('left').run()}
            isActive={editor.isActive({ textAlign: 'left' })}
            icon={<AlignLeft className="w-4 h-4" />}
            title="Align Left"
          />
          <ToolbarButton
            onClick={() => editor.chain().focus().setTextAlign('center').run()}
            isActive={editor.isActive({ textAlign: 'center' })}
            icon={<AlignCenter className="w-4 h-4" />}
            title="Align Center"
          />
          <ToolbarButton
            onClick={() => editor.chain().focus().setTextAlign('right').run()}
            isActive={editor.isActive({ textAlign: 'right' })}
            icon={<AlignRight className="w-4 h-4" />}
            title="Align Right"
          />

          <div className="w-px h-6 bg-gray-700 mx-1" />

          {/* Undo/Redo */}
          <ToolbarButton
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            icon={<Undo className="w-4 h-4" />}
            title="Undo (Ctrl+Z)"
          />
          <ToolbarButton
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            icon={<Redo className="w-4 h-4" />}
            title="Redo (Ctrl+Y)"
          />
        </div>
      )}

      {/* Editor Content */}
      <EditorContent editor={editor} />
    </div>
  );
}

interface ToolbarButtonProps {
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  icon: React.ReactNode;
  title: string;
}

function ToolbarButton({ onClick, isActive, disabled, icon, title }: ToolbarButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'p-2 rounded hover:bg-gray-800 transition-colors',
        isActive && 'bg-[#37bd7e]/20 text-[#37bd7e]',
        disabled && 'opacity-50 cursor-not-allowed',
        !isActive && !disabled && 'text-gray-400'
      )}
    >
      {icon}
    </button>
  );
}
