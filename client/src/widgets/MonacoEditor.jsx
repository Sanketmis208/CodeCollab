import { useEffect, useRef } from 'react';
import * as monaco from 'monaco-editor';
// Vite-friendly worker imports. The `?worker` suffix tells Vite to bundle
// these as WebWorker files and return a constructor when imported.
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

// Provide Monaco with a worker factory. Monaco throws the runtime error you
// saw when neither `MonacoEnvironment.getWorkerUrl` nor
// `MonacoEnvironment.getWorker` is defined in the browser.
// We set `getWorker` (preferred for bundlers that can return worker constructors).
if (typeof self !== 'undefined' && !self.MonacoEnvironment) {
  self.MonacoEnvironment = {
    getWorker(_moduleId, label) {
      if (label === 'typescript' || label === 'javascript') {
        return new TsWorker();
      }
      return new EditorWorker();
    },
  };
}

export default function MonacoEditor({ fileId, value, language = 'javascript', onChange, onSave, onCursorChange, remoteCursors = {} }) {
  const containerRef = useRef(null);
  const editorRef = useRef(null);
  const saveTimer = useRef(null);
  const modelsRef = useRef({}); // fileId -> ITextModel
  const activeFileIdRef = useRef(null);
  const overlaysRef = useRef(new Map()); // userId -> DOM node
  const decorationsRef = useRef([]);

  useEffect(() => {
    const ed = monaco.editor.create(containerRef.current, {
      value: '',
      language,
      theme: 'vs-dark',
      minimap: { enabled: false },
      automaticLayout: true,
      fontSize: 14,
      // VS Code-like quality-of-life editor options
      wordWrap: 'on',
      tabSize: 2,
      insertSpaces: true,
      detectIndentation: false,
      formatOnPaste: true,
      formatOnType: true,
      // enable quick suggestions and snippet behavior
      quickSuggestions: true,
      suggestOnTriggerCharacters: true,
      acceptSuggestionOnEnter: 'on',
      snippetSuggestions: 'inline',
      tabCompletion: 'on',
      renderWhitespace: 'all',
      renderIndentGuides: true,
      smoothScrolling: true,
    });
    editorRef.current = ed;

    // Provide a simple HTML snippet completion (doctype/template) so typing
    // '!' in an HTML file offers a doctype/template suggestion similar to Emmet in VS Code.
    // This is a lightweight improvement; for full Emmet support consider
    // integrating an Emmet extension such as `emmet-monaco-es`.
    const htmlProvider = monaco.languages.registerCompletionItemProvider('html', {
      triggerCharacters: ['!', '<'],
      provideCompletionItems: (model, position) => {
        try {
          const line = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
          // only show when user types a lone '!' or starts a new line with '!'
          if (!/\b!$/.test(line) && !/^\s*!$/.test(line)) return { suggestions: [] };
        } catch (e) {
          return { suggestions: [] };
        }

        return {
          suggestions: [
            {
              label: '!doctype',
              kind: monaco.languages.CompletionItemKind.Snippet,
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              insertText:
                '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>${1:Document}</title>\n</head>\n<body>\n\n</body>\n</html>',
              documentation: 'HTML5 doctype + starter template'
            }
          ]
        };
      }
    });

    const sub = ed.onDidChangeModelContent(() => {
      const v = ed.getValue();
      const fid = activeFileIdRef.current;
      onChange?.(v, fid);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => onSave?.(v, fid), 800);
    });

    // Cursor selection change -> notify parent
    const selSub = ed.onDidChangeCursorSelection((e) => {
      try {
        const sel = ed.getSelection();
        if (onCursorChange) {
          onCursorChange({ startLineNumber: sel.startLineNumber, startColumn: sel.startColumn, endLineNumber: sel.endLineNumber, endColumn: sel.endColumn });
        }
      } catch (e) { /* ignore */ }
    });

    // Ctrl/Cmd+S: format then save (emulates VS Code behaviour)
    const saveKeybinding = ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_S, async () => {
      try {
        // run builtin format action if available
        const formatAction = ed.getAction && ed.getAction('editor.action.formatDocument');
        if (formatAction && formatAction.run) await formatAction.run();
      } catch (e) {
        // ignore formatting failures
      }
      const fid = activeFileIdRef.current;
      onSave?.(ed.getValue(), fid);
    });

    // Try to dynamically activate Emmet (optional dependency). We import lazily
    // so the editor still works if the package isn't installed.
    let emmetDisposable = null;
    (async () => {
      try {
        const emmet = await import('emmet-monaco-es');
        // emmet-monaco-es exports helpers like emmetHTML / emmetCSS in many builds.
        // Call any found registrars for typical languages.
        if (emmet && typeof emmet.emmetHTML === 'function') {
          emmetDisposable = emmet.emmetHTML(monaco, 'html');
        }
        if (emmet && typeof emmet.emmetCSS === 'function') {
          emmetDisposable = emmetDisposable || emmet.emmetCSS(monaco, 'css');
        }
        // some builds provide a single `enableEmmet` entry
        if (emmet && typeof emmet.enableEmmet === 'function') {
          const d = emmet.enableEmmet(monaco);
          if (d) emmetDisposable = d;
        }
      } catch (e) {
        // optional dependency might not be installed; that's fine.
      }
    })();

    return () => {
      sub.dispose();
      try { selSub.dispose(); } catch (e) { /* ignore */ }
      try { htmlProvider.dispose(); } catch (e) { /* ignore */ }
      try { if (emmetDisposable && typeof emmetDisposable.dispose === 'function') emmetDisposable.dispose(); } catch (e) { /* ignore */ }
      try { ed._standaloneKeybindingService && ed._standaloneKeybindingService.addDynamicKeybinding; } catch (e) { /* noop */ }
      try {
        // dispose all created models
        Object.values(modelsRef.current || {}).forEach(m => m && !m.isDisposed() && m.dispose());
      } catch (e) {
        /* ignore */
      }
      try { ed.removeCommand && ed.removeCommand(saveKeybinding); } catch (e) { /* ignore */ }
      ed.dispose();
    };
  }, []);

  // Render remote cursors as decorations + floating labels
  useEffect(() => {
    const ed = editorRef.current;
    if (!ed) return;

    // Clear previous overlays
    for (const node of overlaysRef.current.values()) {
      try { node.remove(); } catch (e) {}
    }
    overlaysRef.current.clear();

    const model = modelsRef.current[fileId];
    const newDecorations = [];

    Object.values(remoteCursors || {}).forEach(rc => {
      if (!rc || rc.fileId !== fileId) return;
      const uid = rc.userId;
      const sel = rc.selection;
      if (!sel) return;
      const line = sel.startLineNumber || 1;
      const col = sel.startColumn || 1;

      // decoration at the cursor position (zero-width)
      newDecorations.push({
        range: new monaco.Range(line, col, line, col),
        options: { className: 'remote-cursor-decoration', stickiness: monaco.editor.TrackedRangeStickiness.Never }
      });

      // create floating label
      const dom = document.createElement('div');
      dom.className = 'remote-cursor-label';
      dom.textContent = rc.username || (uid || '').slice(0,6);
      dom.style.position = 'fixed';
      dom.style.zIndex = '9999';
      dom.style.padding = '2px 6px';
      dom.style.borderRadius = '6px';
      dom.style.background = stringToColor(uid || rc.username || 'x');
      dom.style.color = '#000';
      dom.style.fontSize = '11px';
      dom.style.pointerEvents = 'none';
      dom.style.transform = 'translate(-50%, -100%)';
      document.body.appendChild(dom);
      overlaysRef.current.set(uid, dom);

      // position it if visible
      try {
        const pos = ed.getScrolledVisiblePosition({ lineNumber: line, column: col });
        const rect = ed.getDomNode() && ed.getDomNode().getBoundingClientRect();
        if (pos && rect) {
          const left = Math.round(rect.left + pos.left);
          const top = Math.round(rect.top + pos.top) - 8; // slightly above cursor
          dom.style.left = `${left}px`;
          dom.style.top = `${top}px`;
          dom.style.display = '';
        } else {
          dom.style.display = 'none';
        }
      } catch (e) { dom.style.display = 'none'; }
    });

    // apply decorations
    try {
      decorationsRef.current = model ? model.deltaDecorations(decorationsRef.current, newDecorations) : [];
    } catch (e) { /* ignore */ }

    // Update overlay positions on scroll/layout changes
    const updateOverlayPositions = () => {
      const edDom = ed.getDomNode();
        for (const rc of Object.values(remoteCursors || {})) {
        if (!rc || rc.fileId !== fileId) continue;
        const uid = rc.userId;
        const sel = rc.selection;
        const dom = overlaysRef.current.get(uid);
        if (!dom) continue;
        try {
          const pos = ed.getScrolledVisiblePosition({ lineNumber: sel.startLineNumber, column: sel.startColumn });
          const rect = ed.getDomNode() && ed.getDomNode().getBoundingClientRect();
          if (pos && rect) {
            const left = Math.round(rect.left + pos.left);
            const top = Math.round(rect.top + pos.top) - 8;
            dom.style.left = `${left}px`;
            dom.style.top = `${top}px`;
            dom.style.display = '';
          } else {
            dom.style.display = 'none';
          }
        } catch (e) { dom.style.display = 'none'; }
      }
    };

    const sc = ed.onDidScrollChange(updateOverlayPositions);
    const lu = ed.onDidLayoutChange(updateOverlayPositions);
    // also on content change (lines shifting)
    const mc = ed.onDidChangeModelContent(updateOverlayPositions);
    // run once
    updateOverlayPositions();

    return () => {
      try { sc.dispose(); } catch (e) {}
      try { lu.dispose(); } catch (e) {}
      try { mc.dispose(); } catch (e) {}
      for (const node of overlaysRef.current.values()) { try { node.remove(); } catch (e) {} }
      overlaysRef.current.clear();
      try { if (model) model.deltaDecorations(decorationsRef.current, []); } catch (e) {}
      decorationsRef.current = [];
    };
  }, [remoteCursors, fileId]);

  function stringToColor(s) {
    let hash = 0;
    for (let i = 0; i < s.length; i++) hash = s.charCodeAt(i) + ((hash << 5) - hash);
    const h = Math.abs(hash) % 360;
    return `hsl(${h}, 90%, 70%)`;
  }

  // Manage per-file models and switching
  useEffect(() => {
    const ed = editorRef.current;
    if (!ed) return;
    // update active file id ref
    activeFileIdRef.current = fileId ?? null;

    if (!fileId) return;

    // create model if missing
    if (!modelsRef.current[fileId]) {
      modelsRef.current[fileId] = monaco.editor.createModel(value ?? '', language);
    } else {
      // ensure language is set for existing model
      monaco.editor.setModelLanguage(modelsRef.current[fileId], language);
    }

    // set the editor's model to the file's model
    ed.setModel(modelsRef.current[fileId]);

    // If model was just created and value differs, ensure it's initialized
    // Use pushEditOperations instead of setValue so undo/redo history works
    // (setValue resets the model's undo stack which breaks Ctrl+Z behavior).
    const model = modelsRef.current[fileId];
    if (model && model.getValue() === '' && (value ?? '') !== '') {
      try {
        const fullRange = model.getFullModelRange();
        model.pushEditOperations([], [{ range: fullRange, text: value || '' }], () => null);
      } catch (e) {
        // fallback to setValue if pushEditOperations fails for some reason
        try { model.setValue(value || ''); } catch (e2) { /* ignore */ }
      }
    }
  }, [fileId, language]);

  // Apply external value updates (e.g. remote collaborator changes).
  // We only set the model value when the incoming `value` differs from
  // the current model value to avoid unnecessary edits. We attempt to
  // preserve the selection/cursor position when updating.
  useEffect(() => {
    const ed = editorRef.current;
    if (!ed) return;
    if (!fileId) return;
    const model = modelsRef.current[fileId];
    if (!model) return;
    try {
      const incoming = value ?? '';
      const current = model.getValue();
      if (incoming !== current) {
        // preserve selection
        const sel = ed.getSelection ? ed.getSelection() : null;
        try {
          const fullRange = model.getFullModelRange();
          model.pushEditOperations([], [{ range: fullRange, text: incoming }], () => null);
          if (sel && ed.setSelection) ed.setSelection(sel);
        } catch (e) {
          // fallback to setValue if pushEditOperations fails
          try {
            model.setValue(incoming);
            if (sel && ed.setSelection) ed.setSelection(sel);
          } catch (e2) { /* ignore */ }
        }
      }
    } catch (e) {
      // best-effort; ignore errors to avoid breaking the editor
    }
  }, [value, fileId]);

  // The parent containers use min-h-0 / h-full; render the editor to fill its parent
  return <div className="h-full" ref={containerRef} />;
}
