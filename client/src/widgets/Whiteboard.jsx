import { useEffect, useRef, useState } from 'react';
import { socket } from '../lib/socket.js';

export default function Whiteboard({ roomId }) {
  const canvasRef = useRef(null);
  const [ctx, setCtx] = useState(null);
  const drawing = useRef(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [brushColor, setBrushColor] = useState('#6366f1');
  const [brushSize, setBrushSize] = useState(2);
  const [drawingMode, setDrawingMode] = useState('draw');
  const [activeTool, setActiveTool] = useState('freehand');
  const [activeShape, setActiveShape] = useState(null);
  const [startPoint, setStartPoint] = useState(null);
  const [textInput, setTextInput] = useState('');
  const [isTextInputVisible, setIsTextInputVisible] = useState(false);
  const [textPosition, setTextPosition] = useState({ x: 0, y: 0 });
  const lastPoint = useRef({ x: 0, y: 0 });

  // New state for selection and objects
  const [objects, setObjects] = useState([]);
  const [selectedObject, setSelectedObject] = useState(null);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHandle, setResizeHandle] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Shape definitions
  const shapes = {
    rectangle: { name: 'Class', type: 'rectangle', category: 'uml' },
    circle: { name: 'Use Case', type: 'circle', category: 'uml' },
    actor: { name: 'Actor', type: 'actor', category: 'uml' },
    diamond: { name: 'Decision', type: 'diamond', category: 'uml' },
    arrow: { name: 'Arrow', type: 'arrow', category: 'arrow' },
    inheritance: { name: 'Inheritance', type: 'inheritance', category: 'arrow' },
    composition: { name: 'Composition', type: 'composition', category: 'arrow' },
    aggregation: { name: 'Aggregation', type: 'aggregation', category: 'arrow' },
    line: { name: 'Line', type: 'line', category: 'basic' },
    square: { name: 'Square', type: 'square', category: 'basic' },
    triangle: { name: 'Triangle', type: 'triangle', category: 'basic' },
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
    const c = canvas.getContext('2d');
    
    updateCanvasStyle(c);
    setCtx(c);

    const onRemote = (ev) => {
      if (ev.type === 'stroke') {
        drawRemoteStroke(c, ev);
      } else if (ev.type === 'shape') {
        const newObject = {
          id: Date.now().toString(),
          type: 'shape',
          shapeType: ev.shape,
          start: ev.start,
          end: ev.end,
          color: ev.color,
          size: ev.size,
          x: Math.min(ev.start.x, ev.end.x),
          y: Math.min(ev.start.y, ev.end.y),
          width: Math.abs(ev.end.x - ev.start.x),
          height: Math.abs(ev.end.y - ev.start.y),
        };
        setObjects(prev => [...prev, newObject]);
        try {
          drawShape(c, ev.shape, ev.start, ev.end, ev.color, ev.size);
        } catch (err) {
          console.error('Error drawing remote shape:', err, ev);
        }
      } else if (ev.type === 'text') {
        const newObject = {
          id: Date.now().toString(),
          type: 'text',
          text: ev.text,
          x: ev.x,
          y: ev.y,
          color: ev.color,
          size: ev.size,
          width: ev.text.length * ev.size * 2,
          height: ev.size * 4,
        };
        setObjects(prev => [...prev, newObject]);
        try {
          drawText(c, ev.text, ev.x, ev.y, ev.color, ev.size);
        } catch (err) {
          console.error('Error drawing remote text:', err, ev);
        }
      } else if (ev.type === 'clear') {
        clearCanvas(c, canvas.width, canvas.height, isDarkMode);
        setObjects([]);
        setSelectedObject(null);
      } else if (ev.type === 'delete') {
        setObjects(prev => prev.filter(obj => obj.id !== ev.id));
        redrawCanvas();
      } else if (ev.type === 'update') {
        setObjects(prev => prev.map(obj => obj.id === ev.id ? { ...obj, ...ev.updates } : obj));
        redrawCanvas();
      }
    };

    socket.on('whiteboard:event', onRemote);
    return () => socket.off('whiteboard:event', onRemote);
  }, [roomId, isDarkMode]);

  const redrawCanvas = () => {
    if (!ctx) return;
    const canvas = canvasRef.current;
    clearCanvas(ctx, canvas.width, canvas.height, isDarkMode);
    
    objects.forEach(obj => {
      if (obj.type === 'shape') {
        try {
          drawShape(ctx, obj.shapeType, obj.start, obj.end, obj.color, obj.size);
        } catch (err) {
          console.error('Error drawing shape during redraw:', err, obj);
        }
      } else if (obj.type === 'text') {
        try {
          drawText(ctx, obj.text, obj.x, obj.y, obj.color, obj.size);
        } catch (err) {
          console.error('Error drawing text during redraw:', err, obj);
        }
      }
    });

    // Redraw selection if needed
    if (selectedObject) {
      drawSelection(ctx, selectedObject);
    }
  };

  useEffect(() => {
    redrawCanvas();
  }, [objects, selectedObject, isDarkMode]);

  const updateCanvasStyle = (context = ctx) => {
    if (!context) return;
    
    context.lineWidth = brushSize;
    context.strokeStyle = drawingMode === 'erase' 
      ? (isDarkMode ? '#000000' : '#ffffff') 
      : brushColor;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.fillStyle = brushColor;
    context.font = `${brushSize * 4}px Arial`;
  };

  useEffect(() => {
    if (ctx) {
      updateCanvasStyle();
    }
  }, [isDarkMode, brushColor, brushSize, drawingMode]);

  const send = (ev) => socket.emit('whiteboard:event', { roomId, event: ev });

  // Drawing functions (keep existing drawShape, drawArrow, etc. functions)
  // Basic shape drawing implementation (helpers)
  const drawShape = (context, shapeType, start, end, color, size) => {
    const savedStyle = context.strokeStyle;
    const savedFill = context.fillStyle;
    const savedWidth = context.lineWidth;

    context.strokeStyle = color || context.strokeStyle;
    context.fillStyle = color || context.fillStyle;
    context.lineWidth = size || context.lineWidth;

    context.beginPath();
    switch (shapeType) {
      case 'rectangle':
        context.rect(start.x, start.y, end.x - start.x, end.y - start.y);
        break;
      case 'square': {
        const side = Math.min(Math.abs(end.x - start.x), Math.abs(end.y - start.y));
        const sx = start.x;
        const sy = start.y;
        context.rect(sx, sy, side * (end.x < start.x ? -1 : 1), side * (end.y < start.y ? -1 : 1));
        break;
      }
      case 'circle': {
        const cx = (start.x + end.x) / 2;
        const cy = (start.y + end.y) / 2;
        const rx = Math.abs(end.x - start.x) / 2;
        const ry = Math.abs(end.y - start.y) / 2;
        const r = Math.max(1, Math.min(rx, ry));
        context.arc(cx, cy, r, 0, Math.PI * 2);
        break;
      }
      case 'line':
        context.moveTo(start.x, start.y);
        context.lineTo(end.x, end.y);
        break;
      case 'arrow':
        drawArrow(context, start, end);
        break;
      case 'triangle':
        drawTriangle(context, start, end);
        break;
      case 'diamond':
        drawDiamond(context, start, end);
        break;
      case 'actor':
        drawActor(context, start, end);
        break;
      case 'inheritance':
        drawInheritanceArrow(context, start, end);
        break;
      case 'composition':
        drawCompositionArrow(context, start, end);
        break;
      case 'aggregation':
        drawAggregationArrow(context, start, end);
        break;
      default:
        // fallback to rectangle
        context.rect(start.x, start.y, end.x - start.x, end.y - start.y);
    }

    context.stroke();

    // restore
    context.strokeStyle = savedStyle;
    context.fillStyle = savedFill;
    context.lineWidth = savedWidth;
  };

  const drawArrow = (context, start, end) => {
    const headLength = 12;
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    // head
    context.moveTo(end.x, end.y);
    context.lineTo(end.x - headLength * Math.cos(angle - Math.PI / 6), end.y - headLength * Math.sin(angle - Math.PI / 6));
    context.moveTo(end.x, end.y);
    context.lineTo(end.x - headLength * Math.cos(angle + Math.PI / 6), end.y - headLength * Math.sin(angle + Math.PI / 6));
  };

  const drawTriangle = (context, start, end) => {
    const centerX = (start.x + end.x) / 2;
    context.moveTo(centerX, start.y);
    context.lineTo(end.x, end.y);
    context.lineTo(start.x, end.y);
    context.closePath();
  };

  const drawDiamond = (context, start, end) => {
    const cx = (start.x + end.x) / 2;
    const cy = (start.y + end.y) / 2;
    const w = Math.abs(end.x - start.x) / 2;
    const h = Math.abs(end.y - start.y) / 2;
    context.moveTo(cx, cy - h);
    context.lineTo(cx + w, cy);
    context.lineTo(cx, cy + h);
    context.lineTo(cx - w, cy);
    context.closePath();
  };

  const drawActor = (context, start, end) => {
    const size = Math.max(10, Math.min(Math.abs(end.x - start.x), Math.abs(end.y - start.y)));
    const headRadius = size / 6;
    const cx = start.x;
    const cy = start.y;
    context.beginPath();
    context.arc(cx, cy - size / 3, headRadius, 0, Math.PI * 2);
    context.moveTo(cx, cy - size / 3 + headRadius);
    context.lineTo(cx, cy + size / 3);
    context.moveTo(cx - size / 3, cy);
    context.lineTo(cx + size / 3, cy);
    context.moveTo(cx, cy + size / 3);
    context.lineTo(cx - size / 4, cy + size / 2);
    context.moveTo(cx, cy + size / 3);
    context.lineTo(cx + size / 4, cy + size / 2);
  };

  const drawInheritanceArrow = (context, start, end) => {
    drawArrow(context, start, end);
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    const size = 10;
    context.moveTo(end.x, end.y);
    context.lineTo(end.x - size * Math.cos(angle - Math.PI / 6), end.y - size * Math.sin(angle - Math.PI / 6));
    context.lineTo(end.x - size * Math.cos(angle + Math.PI / 6), end.y - size * Math.sin(angle + Math.PI / 6));
    context.closePath();
    context.stroke();
  };

  const drawCompositionArrow = (context, start, end) => {
    drawArrow(context, start, end);
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    const size = 8;
    const diamondPoints = [
      { x: end.x, y: end.y },
      { x: end.x - size * Math.cos(angle - Math.PI / 4), y: end.y - size * Math.sin(angle - Math.PI / 4) },
      { x: end.x - size * 2 * Math.cos(angle), y: end.y - size * 2 * Math.sin(angle) },
      { x: end.x - size * Math.cos(angle + Math.PI / 4), y: end.y - size * Math.sin(angle + Math.PI / 4) }
    ];
    context.beginPath();
    context.moveTo(diamondPoints[0].x, diamondPoints[0].y);
    diamondPoints.forEach(p => context.lineTo(p.x, p.y));
    context.closePath();
    context.fill();
  };

  const drawAggregationArrow = (context, start, end) => {
    drawArrow(context, start, end);
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    const size = 8;
    const diamondPoints = [
      { x: end.x, y: end.y },
      { x: end.x - size * Math.cos(angle - Math.PI / 4), y: end.y - size * Math.sin(angle - Math.PI / 4) },
      { x: end.x - size * 2 * Math.cos(angle), y: end.y - size * 2 * Math.sin(angle) },
      { x: end.x - size * Math.cos(angle + Math.PI / 4), y: end.y - size * Math.sin(angle + Math.PI / 4) }
    ];
    context.beginPath();
    context.moveTo(diamondPoints[0].x, diamondPoints[0].y);
    diamondPoints.forEach(p => context.lineTo(p.x, p.y));
    context.closePath();
    context.stroke();
  };

  // Draw a remote stroke (used for incoming realtime strokes)
  const drawRemoteStroke = (context, ev) => {
    if (!context || !ev) return;
    try {
      const { from, to, color, size, mode } = ev;
      const prevStyle = context.strokeStyle;
      const prevWidth = context.lineWidth;

      context.strokeStyle = mode === 'erase' ? (isDarkMode ? '#000000' : '#ffffff') : (color || context.strokeStyle);
      context.lineWidth = size || context.lineWidth;
      context.beginPath();
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);
      context.stroke();

      context.strokeStyle = prevStyle;
      context.lineWidth = prevWidth;
    } catch (err) {
      console.error('Error drawing remote stroke:', err, ev);
    }
  };

  // Clear canvas and fill background according to theme
  const clearCanvas = (context, width, height, dark) => {
    if (!context) return;
    try {
      context.save();
      context.globalCompositeOperation = 'source-over';
      context.fillStyle = dark ? '#0f172a' : '#ffffff';
      context.fillRect(0, 0, width, height);
      context.restore();
    } catch (err) {
      console.error('Error clearing canvas:', err);
    }
  };

  // Simple text renderer for canvas
  const drawText = (context, text, x, y, color, size) => {
    if (!context || typeof text !== 'string') return;
    try {
      const prevFill = context.fillStyle;
      const prevFont = context.font;
      context.fillStyle = color || context.fillStyle;
      context.font = `${Math.max(12, (size || 2) * 4)}px Arial`;
      context.textBaseline = 'top';
      context.fillText(text, x, y);
      context.fillStyle = prevFill;
      context.font = prevFont;
    } catch (err) {
      console.error('Error drawing text:', err, { text, x, y, color, size });
    }
  };

  const drawSelection = (context, object) => {
    const { x, y, width, height } = object;
    context.strokeStyle = '#3b82f6';
    context.lineWidth = 2;
    context.setLineDash([5, 5]);
    context.strokeRect(x - 5, y - 5, width + 10, height + 10);
    context.setLineDash([]);

    // Draw resize handles
    const handles = [
      { x: x - 5, y: y - 5 }, // top-left
      { x: x + width + 5, y: y - 5 }, // top-right
      { x: x - 5, y: y + height + 5 }, // bottom-left
      { x: x + width + 5, y: y + height + 5 }, // bottom-right
    ];

    handles.forEach(handle => {
      context.fillStyle = '#3b82f6';
      context.fillRect(handle.x - 3, handle.y - 3, 6, 6);
    });
  };

  const getObjectAtPoint = (x, y) => {
    for (let i = objects.length - 1; i >= 0; i--) {
      const obj = objects[i];
      if (x >= obj.x && x <= obj.x + obj.width && 
          y >= obj.y && y <= obj.y + obj.height) {
        return obj;
      }
    }
    return null;
  };

  const getResizeHandleAtPoint = (x, y, object) => {
    if (!object) return null;
    
    const handles = [
      { position: 'nw', x: object.x - 5, y: object.y - 5 },
      { position: 'ne', x: object.x + object.width + 5, y: object.y - 5 },
      { position: 'sw', x: object.x - 5, y: object.y + object.height + 5 },
      { position: 'se', x: object.x + object.width + 5, y: object.y + object.height + 5 },
    ];

    for (const handle of handles) {
      if (x >= handle.x - 5 && x <= handle.x + 5 && 
          y >= handle.y - 5 && y <= handle.y + 5) {
        return handle.position;
      }
    }
    return null;
  };

  // Enhanced event handlers
  const onPointerDown = (e) => {
    if (isTextInputVisible) return;
    
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;

    // Check for resize handle first
    if (selectedObject) {
      const handle = getResizeHandleAtPoint(x, y, selectedObject);
      if (handle) {
        setIsResizing(true);
        setResizeHandle(handle);
        setStartPoint({ x, y });
        return;
      }
    }

    // Check for object selection/dragging
    const clickedObject = getObjectAtPoint(x, y);
    if (clickedObject) {
      setSelectedObject(clickedObject);
      setIsDragging(true);
      setDragOffset({
        x: x - clickedObject.x,
        y: y - clickedObject.y
      });
      return;
    }

    // Clear selection if clicking on empty space
    setSelectedObject(null);

    // Start drawing
    drawing.current = true;
    lastPoint.current = { x, y };
    setStartPoint({ x, y });

    if (activeTool === 'freehand') {
      ctx.beginPath();
      ctx.moveTo(x, y);
    } else if (activeTool === 'text') {
      setTextPosition({ x, y });
      setIsTextInputVisible(true);
    }
  };

  const onPointerUp = (e) => {
    if (!drawing.current && !isDragging && !isResizing) return;
    
    if (activeTool === 'shape' && activeShape && startPoint) {
      const r = e.currentTarget.getBoundingClientRect();
      const endX = e.clientX - r.left;
      const endY = e.clientY - r.top;
      
      const newObject = {
        id: Date.now().toString(),
        type: 'shape',
        shapeType: activeShape,
        start: startPoint,
        end: { x: endX, y: endY },
        color: brushColor,
        size: brushSize,
        x: Math.min(startPoint.x, endX),
        y: Math.min(startPoint.y, endY),
        width: Math.abs(endX - startPoint.x),
        height: Math.abs(endY - startPoint.y),
      };
      
      setObjects(prev => [...prev, newObject]);
      try {
        drawShape(ctx, activeShape, startPoint, { x: endX, y: endY }, brushColor, brushSize);
      } catch (err) {
        console.error('Error drawing shape on pointer up:', err, newObject);
      }
      send({
        type: 'shape',
        shape: activeShape,
        start: startPoint,
        end: { x: endX, y: endY },
        color: brushColor,
        size: brushSize
      });
    }
    
    drawing.current = false;
    setIsDragging(false);
    setIsResizing(false);
    setResizeHandle(null);
    ctx.beginPath();
  };

  const onPointerMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;

    // Handle dragging
    if (isDragging && selectedObject) {
      const newX = x - dragOffset.x;
      const newY = y - dragOffset.y;
      
      setObjects(prev => prev.map(obj => 
        obj.id === selectedObject.id 
          ? { 
              ...obj, 
              x: newX, 
              y: newY,
              start: obj.start ? { x: obj.start.x + (newX - obj.x), y: obj.start.y + (newY - obj.y) } : obj.start,
              end: obj.end ? { x: obj.end.x + (newX - obj.x), y: obj.end.y + (newY - obj.y) } : obj.end
            } 
          : obj
      ));
      
      setSelectedObject(prev => ({ ...prev, x: newX, y: newY }));
      return;
    }

    // Handle resizing
    if (isResizing && selectedObject && startPoint) {
      const deltaX = x - startPoint.x;
      const deltaY = y - startPoint.y;
      
      setObjects(prev => prev.map(obj => {
        if (obj.id !== selectedObject.id) return obj;
        
        let newWidth = obj.width;
        let newHeight = obj.height;
        let newX = obj.x;
        let newY = obj.y;

        switch (resizeHandle) {
          case 'nw':
            newWidth = obj.width - deltaX;
            newHeight = obj.height - deltaY;
            newX = obj.x + deltaX;
            newY = obj.y + deltaY;
            break;
          case 'ne':
            newWidth = obj.width + deltaX;
            newHeight = obj.height - deltaY;
            newY = obj.y + deltaY;
            break;
          case 'sw':
            newWidth = obj.width - deltaX;
            newHeight = obj.height + deltaY;
            newX = obj.x + deltaX;
            break;
          case 'se':
            newWidth = obj.width + deltaX;
            newHeight = obj.height + deltaY;
            break;
        }

        return {
          ...obj,
          x: newX,
          y: newY,
          width: Math.max(10, newWidth),
          height: Math.max(10, newHeight),
          end: obj.end ? { 
            x: obj.end.x + (newWidth - obj.width) * (resizeHandle === 'ne' || resizeHandle === 'se' ? 1 : 0),
            y: obj.end.y + (newHeight - obj.height) * (resizeHandle === 'sw' || resizeHandle === 'se' ? 1 : 0)
          } : obj.end
        };
      }));
      
      setStartPoint({ x, y });
      return;
    }

    // Handle freehand drawing
    if (drawing.current && ctx && activeTool === 'freehand') {
      ctx.lineTo(x, y);
      ctx.stroke();
      
      send({
        type: 'stroke',
        from: { x: lastPoint.current.x, y: lastPoint.current.y },
        to: { x, y },
        color: brushColor,
        size: brushSize,
        mode: drawingMode
      });
      
      lastPoint.current = { x, y };
    }
  };

  const handleTextSubmit = () => {
    if (textInput.trim()) {
      const newObject = {
        id: Date.now().toString(),
        type: 'text',
        text: textInput,
        x: textPosition.x,
        y: textPosition.y,
        color: brushColor,
        size: brushSize,
        width: textInput.length * brushSize * 2,
        height: brushSize * 4,
      };
      
      setObjects(prev => [...prev, newObject]);
      drawText(ctx, textInput, textPosition.x, textPosition.y, brushColor, brushSize);
      send({
        type: 'text',
        text: textInput,
        x: textPosition.x,
        y: textPosition.y,
        color: brushColor,
        size: brushSize
      });
    }
    setTextInput('');
    setIsTextInputVisible(false);
  };

  const deleteSelectedObject = () => {
    if (selectedObject) {
      setObjects(prev => prev.filter(obj => obj.id !== selectedObject.id));
      send({ type: 'delete', id: selectedObject.id });
      setSelectedObject(null);
    }
  };

  const clear = () => {
    const canvas = canvasRef.current;
    clearCanvas(ctx, canvas.width, canvas.height, isDarkMode);
    setObjects([]);
    setSelectedObject(null);
    send({ type: 'clear' });
  };

  const toggleDarkMode = () => setIsDarkMode(!isDarkMode);

  // Color and tool options
  const colorOptions = [
    '#6366f1', '#ef4444', '#10b981', '#f59e0b',
    '#3b82f6', '#8b5cf6', '#000000', '#ffffff'
  ];

  const brushSizes = [1, 2, 3, 5, 8];

  // Group shapes by category
  const umlShapes = Object.values(shapes).filter(s => s.category === 'uml');
  const arrowShapes = Object.values(shapes).filter(s => s.category === 'arrow');
  const basicShapes = Object.values(shapes).filter(s => s.category === 'basic');

  return (
    <div className="h-full relative bg-gray-50 dark:bg-gray-900">
      {/* Compact Toolbar */}
      <div className="absolute top-4 left-4 right-4 z-20 flex flex-col gap-2 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm p-3 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700">
        {/* Top Row - Main Tools */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Tool Mode Selector */}
            <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 p-1 rounded-lg">
              <button
                className={`px-2 py-1 text-xs font-medium rounded transition-all duration-150 transform hover:scale-105 hover:bg-slate-200 dark:hover:bg-gray-600 ${
                  activeTool === 'freehand' 
                    ? 'bg-white dark:bg-gray-600 shadow-sm text-gray-900 dark:text-white' 
                    : 'text-gray-600 dark:text-gray-300'
                }`}
                onClick={() => setActiveTool('freehand')}
              >
                ✏️
              </button>
              <button
                className={`px-2 py-1 text-xs font-medium rounded transition-all duration-150 transform hover:scale-105 hover:bg-slate-200 dark:hover:bg-gray-600 ${
                    activeTool === 'shape' 
                      ? 'bg-white dark:bg-gray-600 shadow-sm text-gray-900 dark:text-white' 
                      : 'text-gray-600 dark:text-gray-300'
                  }`}
                onClick={() => setActiveTool('shape')}
              >
                🔷
              </button>
              <button
                className={`px-2 py-1 text-xs font-medium rounded transition-all duration-150 transform hover:scale-105 hover:bg-slate-200 dark:hover:bg-gray-600 ${
                    activeTool === 'text' 
                      ? 'bg-white dark:bg-gray-600 shadow-sm text-gray-900 dark:text-white' 
                      : 'text-gray-600 dark:text-gray-300'
                  }`}
                onClick={() => setActiveTool('text')}
              >
                📝
              </button>
            </div>

            {/* Eraser Toggle */}
            <button
              className={`px-2 py-1 text-xs font-medium rounded transition-all duration-150 transform ${
                drawingMode === 'erase' 
                  ? 'bg-red-500 text-white shadow-sm hover:bg-red-600' 
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-slate-200 dark:hover:bg-gray-600'
              }`}
              onClick={() => setDrawingMode(drawingMode === 'erase' ? 'draw' : 'erase')}
            >
              🧽
            </button>

            {/* Color Palette */}
            <div className="flex gap-1">
              {colorOptions.map(color => (
                <button
                  key={color}
                  className={`w-4 h-4 rounded-full border transition-transform duration-150 transform ${
                    brushColor === color ? 'scale-125 ring-1 ring-blue-400' : 'hover:scale-110 hover:ring-2 hover:ring-indigo-300'
                  } ${color === '#ffffff' ? 'border-gray-300' : ''}`}
                  style={{ backgroundColor: color }}
                  onClick={() => setBrushColor(color)}
                />
              ))}
            </div>

            {/* Brush Sizes */}
            <div className="flex gap-1">
              {brushSizes.map(size => (
                <button
                  key={size}
                  className={`w-6 h-6 flex items-center justify-center rounded text-xs transition-all duration-150 transform ${
                    brushSize === size 
                      ? 'bg-indigo-500 text-white scale-105' 
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-indigo-50 dark:hover:bg-gray-600 hover:scale-105'
                  }`}
                  onClick={() => setBrushSize(size)}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            {selectedObject && (
              <button
                className="px-2 py-1 bg-red-500 text-white text-xs rounded transition-all hover:bg-red-600"
                onClick={deleteSelectedObject}
              >
                🗑️ Delete
              </button>
            )}
            <button
              className="px-2 py-1 bg-gradient-to-r from-blue-500 to-blue-600 text-white text-xs rounded transition-all hover:shadow-lg hover:brightness-95"
              onClick={toggleDarkMode}
            >
              {isDarkMode ? '☀️' : '🌙'}
            </button>
            <button
              className="px-2 py-1 bg-gradient-to-r from-red-500 to-red-600 text-white text-xs rounded transition-all hover:shadow-lg hover:brightness-95"
              onClick={clear}
            >
              Clear
            </button>
          </div>
        </div>

        {/* Shape Selector - Only show when shape tool is active */}
        {activeTool === 'shape' && (
          <div className="flex flex-col gap-1 pt-2 border-t border-gray-200 dark:border-gray-600">
            <div className="flex items-center gap-2 flex-wrap">
              {/* UML Shapes */}
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-500 dark:text-gray-400">UML:</span>
                <div className="flex gap-1 flex-wrap">
                  {umlShapes.map(shape => (
                    <button
                      key={shape.type}
                      className={`px-2 py-0.5 text-xs rounded border transition-all duration-150 transform hover:scale-105 hover:bg-gray-200 dark:hover:bg-gray-600 ${
                        activeShape === shape.type
                          ? 'bg-indigo-500 text-white border-indigo-600'
                          : 'bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'
                      }`}
                      onClick={() => setActiveShape(shape.type)}
                    >
                      {shape.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2 flex-wrap">
              {/* Arrows */}
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-500 dark:text-gray-400">Arrows:</span>
                <div className="flex gap-1 flex-wrap">
                  {arrowShapes.map(shape => (
                    <button
                      key={shape.type}
                      className={`px-2 py-0.5 text-xs rounded border transition-all duration-150 transform hover:scale-105 hover:bg-gray-200 dark:hover:bg-gray-600 ${
                        activeShape === shape.type
                          ? 'bg-indigo-500 text-white border-indigo-600'
                          : 'bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'
                      }`}
                      onClick={() => setActiveShape(shape.type)}
                    >
                      {shape.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Basic Shapes */}
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-500 dark:text-gray-400">Basic:</span>
                <div className="flex gap-1 flex-wrap">
                  {basicShapes.map(shape => (
                    <button
                      key={shape.type}
                      className={`px-2 py-0.5 text-xs rounded border transition-all duration-150 transform hover:scale-105 hover:bg-gray-200 dark:hover:bg-gray-600 ${
                        activeShape === shape.type
                          ? 'bg-indigo-500 text-white border-indigo-600'
                          : 'bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'
                      }`}
                      onClick={() => setActiveShape(shape.type)}
                    >
                      {shape.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Text Input Modal */}
      {isTextInputVisible && (
        <div className="absolute z-30 top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-gray-800 p-4 rounded-lg shadow-xl border border-gray-300 dark:border-gray-600">
          <input
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleTextSubmit()}
            placeholder="Enter text..."
            className="w-64 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            autoFocus
          />
          <div className="flex gap-2 mt-2">
            <button
              onClick={handleTextSubmit}
              className="px-3 py-1 bg-green-500 text-white rounded-md text-sm"
            >
              Add Text
            </button>
            <button
              onClick={() => setIsTextInputVisible(false)}
              className="px-3 py-1 bg-gray-500 text-white rounded-md text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Selection Info Panel */}
      {selectedObject && (
        <div className="absolute bottom-4 left-4 z-10 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm px-3 py-2 rounded-lg shadow-md">
          <div className="text-xs text-gray-600 dark:text-gray-400">
            Selected: {selectedObject.type === 'shape' ? shapes[selectedObject.shapeType]?.name : 'Text'}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
            Drag to move • Click corners to resize
          </div>
        </div>
      )}

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        className={`w-full h-full block cursor-${
          activeTool === 'text' ? 'text' : 
          selectedObject ? 'move' : 'crosshair'
        } transition-colors duration-300 ${
          isDarkMode ? 'bg-gray-900' : 'bg-white'
        }`}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerUp}
      />
    </div>
  );
}