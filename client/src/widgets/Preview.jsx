import { useEffect, useRef, useState } from 'react';

export default function Preview({ language = 'html', content = '', fileName = 'file', previewTrigger = 0 }) {
  const iframeRef = useRef(null);
  const [logs, setLogs] = useState([]);
  const [pyodideReady, setPyodideReady] = useState(false);
  const [pyLoading, setPyLoading] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const pyodideRef = useRef(null);
  const runIdRef = useRef(0);

  useEffect(() => {
    const onMessage = (ev) => {
      const d = ev.data || {};
      if (d && d.source === 'preview' && d.level) {
        addLog(d.level, ...(d.args || []));
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    if (previewTrigger == null) return;
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewTrigger]);

  const addLog = (level, ...args) => {
    setLogs(l => [...l, { id: Date.now() + Math.random(), level, args }]);
  };

  const clearLogs = () => setLogs([]);

  const ensurePyodide = async () => {
    if (pyodideRef.current) return pyodideRef.current;
    addLog('info', '🌱 Loading Pyodide (first time)...');
    setPyLoading(true);
    try {
      if (!window.loadPyodide) {
        await new Promise((res, rej) => {
          const s = document.createElement('script');
          s.src = 'https://cdn.jsdelivr.net/pyodide/v0.23.4/full/pyodide.js';
          s.onload = res;
          s.onerror = rej;
          document.head.appendChild(s);
        });
      }
      const pyodide = await window.loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.23.4/full/' });
      pyodide.setStdout({ batched: (s) => addLog('log', s) });
      pyodide.setStderr({ batched: (s) => addLog('error', s) });
      pyodideRef.current = pyodide;
      setPyodideReady(true);
      addLog('success', '✅ Pyodide ready!');
      return pyodide;
    } finally {
      setPyLoading(false);
    }
  };

  const run = async () => {
    if (isRunning) return;
    
    runIdRef.current += 1;
    const rid = runIdRef.current;
    setIsRunning(true);
    clearLogs();
    
    if (!content) {
      addLog('info', '📝 No content to run');
      setIsRunning(false);
      return;
    }

    try {
      addLog('info', `🚀 Running ${language.toUpperCase()}...`);

      if (language === 'html') {
        const doc = wrapHtmlForPreview(content);
        reloadIframe(doc);
        addLog('success', `✅ Rendered HTML (${fileName})`);
      } else if (language === 'javascript') {
        const doc = wrapJsForPreview(content);
        reloadIframe(doc);
        addLog('success', `✅ Executed JavaScript (${fileName})`);
      } else if (language === 'python') {
        const pyodide = await ensurePyodide();
        await pyodide.runPythonAsync(content);
        addLog('success', '✅ Python execution finished');
      } else {
        const doc = wrapHtmlForPreview('<pre>' + escapeHtml(content) + '</pre>');
        reloadIframe(doc);
        addLog('info', `👀 Previewing ${fileName}`);
      }
    } catch (err) {
      addLog('error', `❌ ${err?.toString?.() || String(err)}`);
    } finally {
      if (runIdRef.current === rid) {
        setIsRunning(false);
      }
    }
  };

  const reloadIframe = (srcdoc) => {
    try {
      const ifr = iframeRef.current;
      if (!ifr) return;
      ifr.srcdoc = srcdoc;
    } catch (e) {
      addLog('error', '❌ Could not reload iframe: ' + e?.message);
    }
  };

  const getLanguageColor = () => {
    const colors = {
      html: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
      javascript: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
      python: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
      default: 'bg-slate-500/20 text-slate-300 border-slate-500/30'
    };
    return colors[language] || colors.default;
  };

  const getLogLevelStyles = (level) => {
    const styles = {
      error: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
      info: 'text-sky-300 bg-sky-500/10 border-sky-500/20',
      success: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
      log: 'text-slate-200 bg-slate-500/10 border-slate-500/20',
      warn: 'text-amber-300 bg-amber-500/10 border-amber-500/20'
    };
    return styles[level] || styles.log;
  };

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Preview Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-700/50 bg-slate-800/80 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
            <span className="text-sm font-semibold text-slate-200">Live Preview</span>
          </div>
          <div className={`px-3 py-1 rounded-full text-xs font-medium border ${getLanguageColor()}`}>
            {language.toUpperCase()}
          </div>
          {fileName && (
            <div className="text-sm text-slate-400 font-mono max-w-32 truncate" title={fileName}>
              {fileName}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Status Indicators */}
          <div className="flex items-center gap-4 text-xs">
            {language === 'python' && !pyodideReady && !pyLoading && (
              <div className="flex items-center gap-2 text-slate-400">
                <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse"></div>
                <span>Pyodide Required</span>
              </div>
            )}
            {(pyLoading || (language === 'python' && !pyodideReady)) && (
              <div className="flex items-center gap-2 text-slate-300">
                <div className="w-3 h-3 border-2 border-t-slate-200 border-slate-600 rounded-full animate-spin"></div>
                <span>Loading Pyodide...</span>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={clearLogs}
              className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-700/50 border border-slate-600/50 hover:border-slate-500/50 transition-all duration-200 flex items-center gap-2"
              disabled={logs.length === 0}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
              Clear
            </button>
            
            <button
              onClick={run}
              disabled={isRunning || pyLoading}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
                isRunning 
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 cursor-not-allowed' 
                  : 'bg-gradient-to-r from-emerald-500 to-green-500 text-white border border-emerald-400 hover:from-emerald-600 hover:to-green-600 shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40'
              }`}
            >
              {isRunning ? (
                <>
                  <div className="w-4 h-4 border-2 border-t-white border-emerald-300 rounded-full animate-spin"></div>
                  Running...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Run Code
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 min-h-0 flex">
        {/* Preview Area */}
        <div className="flex-1 h-full border-r border-slate-700/50 relative p-2 min-w-0">
          <div className="absolute inset-0 bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center rounded-lg overflow-hidden">
            <div className="text-center text-slate-500">
              <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <p className="text-sm">Preview will appear here</p>
            </div>
          </div>
          <iframe 
            ref={iframeRef} 
            title="preview" 
            sandbox="allow-scripts" 
            className="w-full h-full bg-white relative z-10 rounded-lg shadow-xl" 
            style={{ boxSizing: 'border-box', display: 'block' }}
          />
        </div>

        {/* Console Panel */}
        <div className="w-96 h-full flex flex-col border-l border-slate-700/50 bg-slate-800/50 backdrop-blur-sm">
          <div className="flex items-center justify-between p-3 border-b border-slate-700/50">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
              <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Console Output
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span>{logs.length} messages</span>
              {logs.length > 0 && (
                <button
                  onClick={clearLogs}
                  className="w-6 h-6 rounded hover:bg-slate-700/50 flex items-center justify-center transition-colors"
                  title="Clear all"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
          
          <div className="flex-1 overflow-auto p-3 space-y-2">
            {logs.length === 0 ? (
              <div className="text-center text-slate-500 py-8">
                <svg className="w-8 h-8 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="text-sm">Console output will appear here</p>
              </div>
            ) : (
              logs.map(l => (
                <div 
                  key={l.id} 
                  className={`p-3 rounded-lg border text-sm font-mono break-words ${getLogLevelStyles(l.level)}`}
                >
                  <div className="flex items-start gap-2">
                    <span className="flex-shrink-0 mt-0.5">
                      {l.level === 'error' && '❌'}
                      {l.level === 'info' && 'ℹ️'}
                      {l.level === 'success' && '✅'}
                      {l.level === 'warn' && '⚠️'}
                      {l.level === 'log' && '📝'}
                    </span>
                    <div className="flex-1 min-w-0">
                      {l.args.map((a, i) => (
                        <span key={i} className="whitespace-pre-wrap">
                          {typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)}
                          {i < l.args.length - 1 ? ' ' : ''}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function escapeHtml(s) {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function wrapHtmlForPreview(html) {
  const forwarder = `
  <script>
  (function(){
    const parentWindow = window.parent;
    ['log','error','warn','info'].forEach(k => {
      const orig = console[k];
      console[k] = function(){
        try { parentWindow.postMessage({ source: 'preview', level: k, args: Array.from(arguments) }, '*'); } catch(e){}
        try { orig.apply(console, arguments); } catch(e){}
      };
    });
    window.addEventListener('error', function(e) { 
      try { parentWindow.postMessage({ source:'preview', level:'error', args:[e.message + ' at ' + e.filename + ':' + e.lineno] }, '*'); } catch(e){} 
    });
  })();
  </script>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>body { margin: 20px; font-family: system-ui, sans-serif; }</style></head><body>${html}${forwarder}</body></html>`;
}

function wrapJsForPreview(js) {
  const forwarder = `
  <script>
  (function(){
    const parentWindow = window.parent;
    ['log','error','warn','info'].forEach(k => {
      const orig = console[k];
      console[k] = function(){
        try { parentWindow.postMessage({ source: 'preview', level: k, args: Array.from(arguments) }, '*'); } catch(e){}
        try { orig.apply(console, arguments); } catch(e){}
      };
    });
    window.addEventListener('error', function(e) { 
      try { parentWindow.postMessage({ source:'preview', level:'error', args:[e.message + ' at ' + e.filename + ':' + e.lineno] }, '*'); } catch(e){} 
    });
  })();
  </script>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>body { margin: 20px; font-family: system-ui, sans-serif; }</style></head><body><script>${js}</script>${forwarder}</body></html>`;
}