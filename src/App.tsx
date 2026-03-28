/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, Component } from 'react';
import { 
  Plus, 
  Search, 
  Camera, 
  Image as ImageIcon, 
  Trash2, 
  Edit2, 
  ChevronRight, 
  ChevronLeft, 
  Lock, 
  Unlock,
  X,
  Save,
  Loader2,
  FolderPlus,
  Circle,
  Maximize2,
  Check,
  RotateCcw,
  Palette,
  Download,
  HelpCircle,
  BookOpen,
  ArrowUpRight,
  MousePointer2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  setDoc,
  onSnapshot, 
  query, 
  orderBy, 
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { 
  db, 
  auth,
  handleFirestoreError, 
  OperationType 
} from './firebase';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Error Boundary Component
interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: any;
}

class ErrorBoundary extends Component<any, any> {
  constructor(props: any) {
    super(props);
    // @ts-ignore
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    // @ts-ignore
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-neutral-50">
          <div className="bg-white p-8 rounded-[32px] shadow-xl max-w-md w-full text-center space-y-4 border border-red-100">
            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mx-auto">
              <X size={32} />
            </div>
            <h1 className="text-xl font-bold text-neutral-900">Bir Hata Oluştu</h1>
            <p className="text-neutral-500 text-sm">
              Uygulama çalışırken beklenmedik bir sorunla karşılaştı. Lütfen sayfayı yenileyin.
            </p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold"
            >
              Sayfayı Yenile
            </button>
            {process.env.NODE_ENV === 'development' && (
              <pre className="text-[10px] text-left bg-neutral-100 p-3 rounded-lg overflow-auto max-h-40">
                {/* @ts-ignore */}
                {JSON.stringify(this.state.error, null, 2)}
              </pre>
            )}
          </div>
        </div>
      );
    }

    // @ts-ignore
    return this.props.children;
  }
}

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Types
interface Category {
  id: string;
  name: string;
}

interface ArrowAnnotation {
  x: number;
  y: number;
  color: string;
  rotation?: number;
}

interface Term {
  id: string;
  title: string;
  description: string;
  imageUrl?: string;
  categoryId: string;
  createdAt: Timestamp;
  arrows?: ArrowAnnotation[];
}

interface TutorialStep {
  id: string;
  title: string;
  imageUrl: string;
  note: string;
  arrows?: ArrowAnnotation[];
}

interface Tutorial {
  id: string;
  title: string;
  steps: TutorialStep[];
  categoryId: string;
  createdAt: Timestamp;
}

interface PatternStep {
  points: number[];
  color: string;
}

interface AppSettings {
  loginPattern: PatternStep[];
  logoUrl?: string;
}

interface PatternLockProps {
  onComplete: (points: number[]) => void;
  color: string;
  size?: number;
  disabled?: boolean;
  completedPatterns?: PatternStep[];
}

const PatternLock = ({ onComplete, color, size = 300, disabled = false, completedPatterns = [] }: PatternLockProps) => {
  const [activePoints, setActivePoints] = useState<number[]>([]);
  const [currentPoints, setCurrentPoints] = useState<number[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [lastPointerPos, setLastPointerPos] = useState<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const GRID_SIZE = 4;
  const DOT_COUNT = GRID_SIZE * GRID_SIZE;

  // Clear current points when completedPatterns changes (new step)
  useEffect(() => {
    setCurrentPoints([]);
  }, [completedPatterns.length]);

  const getPointIndex = (e: React.MouseEvent | React.TouchEvent) => {
    if (!containerRef.current) return -1;
    const rect = containerRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? (e as React.TouchEvent).touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? (e as React.TouchEvent).touches[0].clientY : (e as React.MouseEvent).clientY;
    
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    
    const col = Math.floor((x / size) * GRID_SIZE);
    const row = Math.floor((y / size) * GRID_SIZE);
    
    if (col < 0 || col >= GRID_SIZE || row < 0 || row >= GRID_SIZE) return -1;
    
    const dotX = (col * (size / GRID_SIZE)) + (size / (GRID_SIZE * 2));
    const dotY = (row * (size / GRID_SIZE)) + (size / (GRID_SIZE * 2));
    const dist = Math.sqrt(Math.pow(x - dotX, 2) + Math.pow(y - dotY, 2));
    
    // Less magnetic: only snap if within 25% of cell size
    if (dist < (size / GRID_SIZE) * 0.25) {
      return row * GRID_SIZE + col;
    }
    return -1;
  };

  const updatePointerPos = (e: React.MouseEvent | React.TouchEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? (e as React.TouchEvent).touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? (e as React.TouchEvent).touches[0].clientY : (e as React.MouseEvent).clientY;
    setLastPointerPos({
      x: clientX - rect.left,
      y: clientY - rect.top
    });
  };

  const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
    if (disabled) return;
    const index = getPointIndex(e);
    if (index !== -1) {
      setIsDrawing(true);
      setActivePoints([index]);
      setCurrentPoints([]);
      updatePointerPos(e);
    }
  };

  const handleMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || disabled) return;
    updatePointerPos(e);
    const index = getPointIndex(e);
    if (index !== -1 && !activePoints.includes(index)) {
      setActivePoints(prev => [...prev, index]);
    }
  };

  const handleEnd = () => {
    if (!isDrawing || disabled) return;
    setIsDrawing(false);
    setLastPointerPos(null);
    if (activePoints.length > 1) {
      setCurrentPoints(activePoints);
      onComplete(activePoints);
    }
    setActivePoints([]);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, size, size);

    // Draw completed patterns
    completedPatterns.forEach(pattern => {
      ctx.beginPath();
      ctx.lineWidth = 8;
      ctx.strokeStyle = pattern.color;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = 0.8;
      
      pattern.points.forEach((p, i) => {
        const x = (p % GRID_SIZE) * (size / GRID_SIZE) + (size / (GRID_SIZE * 2));
        const y = Math.floor(p / GRID_SIZE) * (size / GRID_SIZE) + (size / (GRID_SIZE * 2));
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });

    // Draw current points (just finished drawing)
    if (currentPoints.length > 0) {
      ctx.beginPath();
      ctx.lineWidth = 8;
      ctx.strokeStyle = color;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = 0.8;
      
      currentPoints.forEach((p, i) => {
        const x = (p % GRID_SIZE) * (size / GRID_SIZE) + (size / (GRID_SIZE * 2));
        const y = Math.floor(p / GRID_SIZE) * (size / GRID_SIZE) + (size / (GRID_SIZE * 2));
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    if (activePoints.length === 0) return;

    ctx.beginPath();
    ctx.lineWidth = 8;
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = 0.6;

    activePoints.forEach((p, i) => {
      const x = (p % GRID_SIZE) * (size / GRID_SIZE) + (size / (GRID_SIZE * 2));
      const y = Math.floor(p / GRID_SIZE) * (size / GRID_SIZE) + (size / (GRID_SIZE * 2));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });

    if (isDrawing && lastPointerPos) {
      ctx.lineTo(lastPointerPos.x, lastPointerPos.y);
    }
    ctx.stroke();
  }, [activePoints, lastPointerPos, color, isDrawing, size, completedPatterns, currentPoints]);

  return (
    <div 
      ref={containerRef}
      className="relative touch-none select-none"
      style={{ width: size, height: size }}
      onMouseDown={handleStart}
      onMouseMove={handleMove}
      onMouseUp={handleEnd}
      onMouseLeave={handleEnd}
      onTouchStart={handleStart}
      onTouchMove={handleMove}
      onTouchEnd={handleEnd}
    >
      <canvas 
        ref={canvasRef}
        width={size}
        height={size}
        className="absolute inset-0 pointer-events-none"
      />
      <div className="grid grid-cols-4 grid-rows-4 w-full h-full">
        {Array.from({ length: DOT_COUNT }).map((_, i) => {
          const isCompleted = completedPatterns.some(p => p.points.includes(i));
          const isCurrent = currentPoints.includes(i);
          const isActive = activePoints.includes(i);
          const dotColor = isActive || isCurrent ? color : (completedPatterns.find(p => p.points.includes(i))?.color || undefined);
          
          return (
            <div key={i} className="flex items-center justify-center">
              <div 
                className={cn(
                  "w-3 h-3 rounded-full transition-all duration-200",
                  (isActive || isCompleted || isCurrent) ? "scale-150" : "bg-neutral-300"
                )}
                style={{ backgroundColor: (isActive || isCompleted || isCurrent) ? dotColor : undefined }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};

const ImageWithArrows = ({ 
  src, 
  alt, 
  arrows = [], 
  className,
  selectedArrowIndex,
  onArrowMouseDown,
  onCanvasClick,
  onCanvasMouseMove,
  onCanvasMouseUp,
  onCanvasMouseLeave,
  onCanvasTouchMove,
  onCanvasTouchEnd,
  showArrows = true
}: { 
  src: string; 
  alt: string; 
  arrows?: ArrowAnnotation[]; 
  className?: string;
  selectedArrowIndex?: number | null;
  onArrowMouseDown?: (index: number, e: React.MouseEvent | React.TouchEvent) => void;
  onCanvasClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onCanvasMouseMove?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onCanvasMouseUp?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onCanvasMouseLeave?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onCanvasTouchMove?: (e: React.TouchEvent<HTMLDivElement>) => void;
  onCanvasTouchEnd?: (e: React.TouchEvent<HTMLDivElement>) => void;
  showArrows?: boolean;
}) => {
  return (
    <div 
      className={cn("relative flex items-center justify-center overflow-hidden group/canvas bg-neutral-50/50", className)} 
    >
      <div 
        className="relative inline-block max-w-full max-h-full shadow-sm"
        onClick={onCanvasClick}
        onMouseMove={onCanvasMouseMove}
        onMouseUp={onCanvasMouseUp}
        onMouseLeave={onCanvasMouseLeave}
        onTouchMove={onCanvasTouchMove}
        onTouchEnd={onCanvasTouchEnd}
      >
        <img 
          src={src} 
          alt={alt} 
          className="block max-w-full max-h-full object-contain select-none" 
          referrerPolicy="no-referrer"
          crossOrigin="anonymous"
          draggable={false}
        />
        {showArrows && arrows.map((arrow, i) => (
          <div 
            key={i}
            className={cn(
              "absolute z-10 transition-transform duration-200",
              onArrowMouseDown ? "cursor-move pointer-events-auto" : "pointer-events-none",
              selectedArrowIndex === i && "scale-125 drop-shadow-[0_0_8px_rgba(79,70,229,0.5)]"
            )}
            style={{ 
              left: `${arrow.x}%`, 
              top: `${arrow.y}%`,
              transform: `translate(-50%, -90%) rotate(${arrow.rotation || 0}deg)`
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
              onArrowMouseDown?.(i, e);
            }}
            onTouchStart={(e) => {
              e.stopPropagation();
              onArrowMouseDown?.(i, e);
            }}
          >
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" className="drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
              <path 
                d="M12 2L12 22M12 22L7 17M12 22L17 17" 
                stroke={arrow.color} 
                strokeWidth="3" 
                strokeLinecap="round" 
                strokeLinejoin="round" 
              />
            </svg>
            {selectedArrowIndex === i && (
              <div className="absolute -inset-2 border-2 border-indigo-500 rounded-full animate-pulse" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

interface TermCardProps {
  key?: string | number;
  term: Term;
  categoryName: string;
  isAdmin: boolean;
  onEdit: (term: Term) => void;
  onDelete: (term: Term) => void | Promise<void>;
  onShowImage: (url: string, arrows: ArrowAnnotation[]) => void;
  onShowDetails: (term: Term) => void;
  onAnnotate: (term: Term) => void;
  logoUrl?: string;
}

const COLORS = [
  { name: 'Kırmızı', value: '#ef4444' },
  { name: 'Mavi', value: '#3b82f6' },
  { name: 'Yeşil', value: '#22c55e' },
  { name: 'Sarı', value: '#eab308' },
  { name: 'Mor', value: '#a855f7' },
  { name: 'Siyah', value: '#000000' },
  { name: 'Beyaz', value: '#ffffff' },
];

const TermCard = ({ 
  term, 
  categoryName, 
  isAdmin, 
  onEdit, 
  onDelete,
  onShowImage,
  onShowDetails,
  onAnnotate,
  logoUrl
}: TermCardProps) => {
  return (
    <motion.div 
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="bg-white rounded-3xl border border-neutral-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow group relative flex flex-col"
    >
      <div className="p-4 flex gap-4 items-start">
        {/* Small Media Area */}
        <div className="w-20 h-20 flex-shrink-0 bg-neutral-100 rounded-2xl relative overflow-hidden flex flex-col items-center justify-center border border-neutral-100 gap-1">
          {term.imageUrl ? (
            <div className="w-full h-full group/img relative">
              <ImageWithArrows 
                src={term.imageUrl} 
                alt={term.title} 
                arrows={term.arrows}
                className="w-full h-full"
                showArrows={false}
              />
              <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/img:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1 z-20">
                <button 
                  onClick={() => onShowImage(term.imageUrl!, term.arrows || [])}
                  className="p-1.5 bg-white/20 hover:bg-white/40 rounded-full transition-colors"
                >
                  <Maximize2 size={12} className="text-white" />
                </button>
                {isAdmin && (
                  <button 
                    onClick={() => onAnnotate(term)}
                    className="p-1.5 bg-indigo-600 hover:bg-indigo-700 rounded-full transition-colors"
                    title="Görseli İşaretle"
                  >
                    <MousePointer2 size={12} className="text-white" />
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center p-2">
              <Logo className="w-full h-full shadow-none bg-transparent" src={logoUrl} />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0 py-0.5">
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-indigo-50 text-indigo-600 text-[10px] font-bold px-2 py-0.5 rounded-lg uppercase tracking-wider">
              {categoryName}
            </span>
          </div>
          <h3 
            onClick={() => onShowDetails(term)}
            className="font-bold text-base mb-0.5 truncate cursor-pointer hover:text-indigo-600 transition-colors"
          >
            {term.title}
          </h3>
          <p className="text-neutral-500 text-[11px] line-clamp-2 leading-relaxed">{term.description}</p>
        </div>
      </div>

      {/* Actions */}
      <div className="px-4 pb-4 flex justify-end gap-2">
        {isAdmin && (
          <button 
            onClick={() => onEdit(term)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-50 text-indigo-600 rounded-xl text-[10px] font-bold hover:bg-indigo-100 transition-colors"
          >
            <Edit2 size={12} />
            Düzenle
          </button>
        )}
        {isAdmin && (
          <button 
            onClick={() => onDelete(term)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-50 text-red-600 rounded-xl text-[10px] font-bold hover:bg-red-100 transition-colors"
          >
            <Trash2 size={12} />
            Sil
          </button>
        )}
      </div>
    </motion.div>
  );
};

const Logo = ({ className = "w-10 h-10", src }: { className?: string; src?: string }) => {
  const defaultLogo = "https://ais-dev-l3bnqmi7fnbma7qte3p7xw-7413657781.europe-west3.run.app/logo.png";
  return (
    <div className={cn("relative overflow-hidden flex items-center justify-center", className)}>
      <img 
        src={src || defaultLogo} 
        alt="Logo" 
        className="w-full h-full object-contain"
        referrerPolicy="no-referrer"
        crossOrigin="anonymous"
        onError={(e) => {
          // Fallback if image fails to load
          e.currentTarget.src = "https://picsum.photos/seed/logo/200/200";
        }}
      />
    </div>
  );
};

export default function App() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | 'all'>('all');
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminId, setAdminId] = useState('');
  const [showAdminModal, setShowAdminModal] = useState(false);
  
  // Pattern Login State (Disabled)
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  const [currentPatternStep, setCurrentPatternStep] = useState(0);
  const [userPatterns, setUserPatterns] = useState<PatternStep[]>([]);
  const [rememberMe, setRememberMe] = useState(false);
  const [selectedColor, setSelectedColor] = useState('#000000');
  const [showPatternSetup, setShowPatternSetup] = useState(false);
  const [setupStep, setSetupStep] = useState(0);
  const [setupPatterns, setSetupPatterns] = useState<PatternStep[]>([]);

  const colors = [
    '#000000', // Black
    '#FF0000', // Red
    '#0000FF', // Blue
    '#008000', // Green
    '#FFFF00', // Yellow
    '#800080', // Purple
    '#FFA500', // Orange
    '#FFC0CB', // Pink
  ];
  const [showAddTermModal, setShowAddTermModal] = useState(false);
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<{ url: string; arrows: ArrowAnnotation[] } | null>(null);

  // Tutorial State
  const [tutorials, setTutorials] = useState<Tutorial[]>([]);
  const [selectedTutorial, setSelectedTutorial] = useState<Tutorial | null>(null);
  const [showTutorialModal, setShowTutorialModal] = useState(false);
  const [isTutorialView, setIsTutorialView] = useState(false);
  const [activeTutorial, setActiveTutorial] = useState<Tutorial | null>(null);
  const [activeTerm, setActiveTerm] = useState<Term | null>(null);
  const [cameraTarget, setCameraTarget] = useState<'term' | 'tutorial'>('term');
  const [tutorialForm, setTutorialForm] = useState<{
    title: string;
    categoryId: string;
    steps: TutorialStep[];
  }>({
    title: '',
    categoryId: '',
    steps: []
  });

  // Modal states for confirmation
  const [confirmModal, setConfirmModal] = useState<{
    show: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    show: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  const [alertModal, setAlertModal] = useState<{
    show: boolean;
    title: string;
    message: string;
  }>({
    show: false,
    title: '',
    message: ''
  });

  const [annotatingItem, setAnnotatingItem] = useState<{
    type: 'term' | 'step';
    id: string;
    imageUrl: string;
    arrows: ArrowAnnotation[];
  } | null>(null);
  const [selectedArrowIndex, setSelectedArrowIndex] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Form states
  const [editingTerm, setEditingTerm] = useState<Term | null>(null);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [showEditCategoryModal, setShowEditCategoryModal] = useState(false);
  const [newTerm, setNewTerm] = useState({
    title: '',
    description: '',
    categoryId: '',
    image: null as File | null,
    imagePreview: ''
  });
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showLogoUpdateModal, setShowLogoUpdateModal] = useState(false);
  const [showCameraModal, setShowCameraModal] = useState(false);

  // Deep Linking Effect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const termId = params.get('term');
    const tutorialId = params.get('tutorial');

    if (termId && terms.length > 0) {
      const term = terms.find(t => t.id === termId);
      if (term) setActiveTerm(term);
    }

    if (tutorialId && tutorials.length > 0) {
      const tutorial = tutorials.find(t => t.id === tutorialId);
      if (tutorial) {
        setIsTutorialView(true);
        setActiveTutorial(tutorial);
      }
    }
  }, [terms.length, tutorials.length]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Admin ID check
  const handleAdminLogin = () => {
    if (adminId === '652802') {
      setIsAdmin(true);
      setShowAdminModal(false);
      setAdminId('');
      setAlertModal({
        show: true,
        title: 'Başarılı',
        message: 'Yönetici girişi yapıldı.'
      });
    } else {
      setAlertModal({
        show: true,
        title: 'Hata',
        message: 'Hatalı ID girdiniz!'
      });
    }
  };

  const handlePatternComplete = (points: number[]) => {
    const newStep: PatternStep = { points, color: selectedColor };
    const newUserPatterns = [...userPatterns, newStep];
    
    if (currentPatternStep < 2) {
      setUserPatterns(newUserPatterns);
      setCurrentPatternStep(prev => prev + 1);
    } else {
      // Check all 3 patterns
      if (!appSettings) return;
      
      const isCorrect = newUserPatterns.every((p, i) => {
        const target = appSettings.loginPattern[i];
        return JSON.stringify(p.points) === JSON.stringify(target.points) && 
               p.color === target.color;
      });

      if (isCorrect) {
        if (rememberMe) {
          localStorage.setItem('app_remembered', 'true');
        }
      } else {
        setAlertModal({
          show: true,
          title: 'Hatalı Desen',
          message: 'Çizdiğiniz desen veya seçtiğiniz renk yanlış!'
        });
        setUserPatterns([]);
        setCurrentPatternStep(0);
      }
    }
  };

  const handleSetupPatternComplete = (points: number[]) => {
    const newStep: PatternStep = { points, color: selectedColor };
    const newSetupPatterns = [...setupPatterns, newStep];
    
    if (setupStep < 2) {
      setSetupPatterns(newSetupPatterns);
      setSetupStep(prev => prev + 1);
    } else {
      // Save to Firestore
      saveSettings(newSetupPatterns);
    }
  };

  const saveSettings = async (pattern: PatternStep[]) => {
    try {
      await setDoc(doc(db, 'settings', 'app_config'), {
        loginPattern: pattern
      });
      setAppSettings({ loginPattern: pattern });
      setShowPatternSetup(false);
      setSetupStep(0);
      setSetupPatterns([]);
      setAlertModal({
        show: true,
        title: 'Başarılı',
        message: 'Giriş deseni başarıyla güncellendi.'
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'settings/app_config');
    }
  };

  const handleLogoUpdate = async (file: File) => {
    setIsUploading(true);
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64String = reader.result as string;
        await setDoc(doc(db, 'settings', 'app_config'), {
          logoUrl: base64String
        }, { merge: true });
        setIsUploading(false);
        setShowLogoUpdateModal(false);
        setAlertModal({
          show: true,
          title: 'Başarılı',
          message: 'Logo başarıyla güncellendi.'
        });
      };
      reader.readAsDataURL(file);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'settings/app_config');
      setIsUploading(false);
    }
  };

  // Fetch data
  useEffect(() => {
    const unsubscribeSettings = onSnapshot(doc(db, 'settings', 'app_config'), (doc) => {
      if (doc.exists()) {
        setAppSettings(doc.data() as AppSettings);
      }
    });

    const qCategories = query(collection(db, 'categories'), orderBy('name'));
    const unsubscribeCategories = onSnapshot(qCategories, (snapshot) => {
      const cats = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Category));
      setCategories(cats);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'categories');
    });

    const qTerms = query(collection(db, 'terms'), orderBy('createdAt', 'desc'));
    const unsubscribeTerms = onSnapshot(qTerms, (snapshot) => {
      const tms = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Term));
      setTerms(tms);
      // Update active term if it's open
      setActiveTerm(prev => {
        if (!prev) return null;
        const updated = tms.find(t => t.id === prev.id);
        return updated || null;
      });
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'terms');
    });

    const qTutorials = query(collection(db, 'tutorials'), orderBy('createdAt', 'desc'));
    const unsubscribeTutorials = onSnapshot(qTutorials, (snapshot) => {
      const tuts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Tutorial));
      setTutorials(tuts);
      // Update active tutorial if it's open
      setActiveTutorial(prev => {
        if (!prev) return null;
        const updated = tuts.find(t => t.id === prev.id);
        return updated || null;
      });
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'tutorials');
    });

    return () => {
      unsubscribeSettings();
      unsubscribeCategories();
      unsubscribeTerms();
      unsubscribeTutorials();
    };
  }, []);

  // Add/Edit Category
  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;
    const path = 'categories';
    try {
      await addDoc(collection(db, path), { name: newCategoryName });
      setNewCategoryName('');
      setShowAddCategoryModal(false);
    } catch (error: any) {
      console.error("Category add error:", error);
      let errorMessage = 'Kategori eklenirken bir hata oluştu.';
      try {
        const parsedError = JSON.parse(error.message);
        errorMessage = `Hata: ${parsedError.error || 'Bilinmeyen bir hata oluştu.'}`;
      } catch (e) {
        if (error.message && !error.message.includes('[object Object]')) {
          errorMessage = `Hata: ${error.message}`;
        }
      }
      setAlertModal({
        show: true,
        title: 'Kategori Hatası',
        message: errorMessage
      });
    }
  };

  const handleDeleteCategory = async (id: string) => {
    if (!isAdmin) return;
    
    setConfirmModal({
      show: true,
      title: 'Kategoriyi Sil',
      message: 'Bu kategoriyi silmek istediğinize emin misiniz? Kategorideki terimler silinmeyecektir.',
      onConfirm: async () => {
        const path = `categories/${id}`;
        try {
          await deleteDoc(doc(db, 'categories', id));
          if (selectedCategory === id) setSelectedCategory('all');
          setConfirmModal(prev => ({ ...prev, show: false }));
        } catch (error: any) {
          console.error("Category delete error:", error);
          let errorMessage = 'Kategori silinirken bir hata oluştu.';
          try {
            const parsedError = JSON.parse(error.message);
            errorMessage = `Hata: ${parsedError.error || 'Bilinmeyen bir hata oluştu.'}`;
          } catch (e) {
            if (error.message && !error.message.includes('[object Object]')) {
              errorMessage = `Hata: ${error.message}`;
            }
          }
          setAlertModal({
            show: true,
            title: 'Kategori Hatası',
            message: errorMessage
          });
        }
      }
    });
  };

  const handleUpdateCategory = async () => {
    if (!editingCategory || !newCategoryName.trim()) return;
    const path = `categories/${editingCategory.id}`;
    try {
      await updateDoc(doc(db, 'categories', editingCategory.id), { name: newCategoryName });
      setNewCategoryName('');
      setEditingCategory(null);
      setShowEditCategoryModal(false);
    } catch (error: any) {
      console.error("Category update error:", error);
      let errorMessage = 'Kategori güncellenirken bir hata oluştu.';
      try {
        const parsedError = JSON.parse(error.message);
        errorMessage = `Hata: ${parsedError.error || 'Bilinmeyen bir hata oluştu.'}`;
      } catch (e) {
        if (error.message && !error.message.includes('[object Object]')) {
          errorMessage = `Hata: ${error.message}`;
        }
      }
      setAlertModal({
        show: true,
        title: 'Kategori Hatası',
        message: errorMessage
      });
    }
  };

  // Image handling
  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 800;
          const MAX_HEIGHT = 600;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          
          // Compress to JPEG with 0.7 quality to stay under 1MB Firestore limit
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
          resolve(dataUrl);
        };
        img.onerror = (err) => reject(err);
      };
      reader.onerror = (err) => reject(err);
    });
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const fileList = Array.from(files) as File[];
      if (cameraTarget === 'tutorial') {
        // Handle multiple files for tutorials
        setIsUploading(true);
        try {
          for (const file of fileList) {
            // Limit file size to 10MB
            if (file.size > 10 * 1024 * 1024) {
              setAlertModal({
                show: true,
                title: 'Dosya Çok Büyük',
                message: `"${file.name}" çok büyük. Lütfen 10MB'dan küçük bir görsel seçin.`
              });
              continue;
            }
            // We need to call compressImage here directly to avoid nested setIsUploading calls
            const imageUrl = await compressImage(file);
            const newStep: TutorialStep = {
              id: Math.random().toString(36).substr(2, 9),
              title: '',
              imageUrl,
              note: '',
              arrows: [{ x: 50, y: 50, color: '#ef4444' }]
            };
            setTutorialForm(prev => ({
              ...prev,
              steps: [...prev.steps, newStep]
            }));
          }
        } catch (error) {
          console.error("Step image error:", error);
        } finally {
          setIsUploading(false);
        }
      } else {
        // Handle single file for terms
        const file = files[0];
        if (file.size > 10 * 1024 * 1024) {
          setAlertModal({
            show: true,
            title: 'Dosya Çok Büyük',
            message: 'Lütfen 10MB\'dan küçük bir görsel seçin.'
          });
          return;
        }

        // Revoke old preview URL to avoid memory leaks
        if (newTerm.imagePreview && newTerm.imagePreview.startsWith('blob:')) {
          URL.revokeObjectURL(newTerm.imagePreview);
        }

        setNewTerm(prev => ({ 
          ...prev, 
          image: file, 
          imagePreview: URL.createObjectURL(file) 
        }));
      }
      
      // Reset input value to allow selecting the same file again
      e.target.value = '';
    }
  };

  const startCamera = async () => {
    setShowCameraModal(true);
    try {
      const constraints: MediaStreamConstraints = {
        video: { 
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err: any) {
      console.error("Kamera başlatılamadı:", err);
      let errorMessage = "Kameraya erişilemedi. Lütfen tarayıcınızdan kamera izinlerini verdiğinizden emin olun.";
      
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        errorMessage = "Kamera erişimi reddedildi. Lütfen tarayıcı ayarlarından bu siteye kamera izni verin ve sayfayı yenileyin.";
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        errorMessage = "Cihazınızda kamera bulunamadı.";
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        errorMessage = "Kamera şu an başka bir uygulama tarafından kullanılıyor olabilir.";
      }
      
      setAlertModal({
        show: true,
        title: "Kamera Hatası",
        message: errorMessage
      });
      setShowCameraModal(false);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setShowCameraModal(false);
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      
      if (context) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        canvas.toBlob((blob) => {
          if (blob) {
            const file = new File([blob], `camera_capture_${Date.now()}.jpg`, { type: 'image/jpeg' });
            const preview = URL.createObjectURL(blob);
            
            if (cameraTarget === 'tutorial') {
              addTutorialStep(file);
            } else {
              setNewTerm(prev => ({
                ...prev,
                image: file,
                imagePreview: preview
              }));
            }
            stopCamera();
          }
        }, 'image/jpeg', 0.8);
      }
    }
  };

  // Add/Edit Term
  const handleSaveTerm = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    if (!newTerm.title || !newTerm.description) {
      setAlertModal({
        show: true,
        title: 'Eksik Bilgi',
        message: 'Lütfen başlık ve açıklama alanlarını doldurun!'
      });
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    
    try {
      let imageUrl = newTerm.imagePreview ? (editingTerm?.imageUrl || '') : '';

      if (newTerm.image) {
        setUploadProgress(50);
        imageUrl = await compressImage(newTerm.image);
      }

      setUploadProgress(100);

      const termData = {
        title: newTerm.title,
        description: newTerm.description,
        categoryId: newTerm.categoryId || '',
        imageUrl
      };

      if (editingTerm) {
        try {
          await updateDoc(doc(db, 'terms', editingTerm.id), termData);
        } catch (e) {
          handleFirestoreError(e, OperationType.UPDATE, `terms/${editingTerm.id}`);
        }
      } else {
        try {
          await addDoc(collection(db, 'terms'), {
            ...termData,
            createdAt: serverTimestamp()
          });
        } catch (e) {
          handleFirestoreError(e, OperationType.CREATE, 'terms');
        }
      }

      resetTermForm();
      setShowAddTermModal(false);
    } catch (error: any) {
      console.error("Save error details:", error);
      let errorMessage = 'Kaydetme sırasında bir hata oluştu. Lütfen tekrar deneyin.';
      
      // Try to parse JSON error if it's from handleFirestoreError
      try {
        const parsedError = JSON.parse(error.message);
        const rawError = parsedError.error || '';
        
        if (rawError.includes('storage/unauthorized')) {
          errorMessage = 'Dosya yükleme yetkiniz yok. Lütfen oturumun açık olduğundan emin olun.';
        } else if (rawError.includes('storage/quota-exceeded')) {
          errorMessage = 'Depolama kotası doldu. Lütfen daha sonra tekrar deneyin.';
        } else if (rawError.includes('permission-denied')) {
          errorMessage = 'Veritabanına yazma yetkiniz yok. Lütfen yönetici girişi yapın.';
        } else {
          errorMessage = `Hata Detayı: ${rawError || 'Bilinmeyen bir hata oluştu.'}`;
        }
      } catch (e) {
        // Not a JSON error, use original message if helpful
        if (error.message && !error.message.includes('[object Object]')) {
          errorMessage = `Hata: ${error.message}`;
        }
      }
      
      if (error?.message?.includes('too large')) {
        errorMessage = 'Görsel boyutu çok büyük (1MB limit). Lütfen daha küçük bir görsel seçin.';
      }
      
      setAlertModal({
        show: true,
        title: 'Kaydetme Hatası',
        message: errorMessage
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDeleteTerm = async (term: Term) => {
    if (!isAdmin) return;
    
    setConfirmModal({
      show: true,
      title: 'Terimi Sil',
      message: 'Bu terimi silmek istediğinize emin misiniz?',
      onConfirm: async () => {
        const path = `terms/${term.id}`;
        try {
          await deleteDoc(doc(db, 'terms', term.id));
          setConfirmModal(prev => ({ ...prev, show: false }));
        } catch (error: any) {
          console.error("Term delete error:", error);
          let errorMessage = 'Terim silinirken bir hata oluştu.';
          try {
            const parsedError = JSON.parse(error.message);
            errorMessage = `Hata: ${parsedError.error || 'Bilinmeyen bir hata oluştu.'}`;
          } catch (e) {
            if (error.message && !error.message.includes('[object Object]')) {
              errorMessage = `Hata: ${error.message}`;
            }
          }
          setAlertModal({
            show: true,
            title: 'Silme Hatası',
            message: errorMessage
          });
        }
      }
    });
  };

  // Tutorial Handlers
  const handleSaveTutorial = async () => {
    if (!tutorialForm.title.trim() || tutorialForm.steps.length === 0) {
      setAlertModal({
        show: true,
        title: 'Eksik Bilgi',
        message: 'Lütfen bir başlık girin ve en az bir adım ekleyin.'
      });
      return;
    }

    setIsUploading(true);
    try {
      const tutorialData = {
        title: tutorialForm.title,
        categoryId: tutorialForm.categoryId,
        steps: tutorialForm.steps,
        createdAt: serverTimestamp()
      };

      if (selectedTutorial) {
        await updateDoc(doc(db, 'tutorials', selectedTutorial.id), tutorialData);
      } else {
        await addDoc(collection(db, 'tutorials'), tutorialData);
      }

      setShowTutorialModal(false);
      setTutorialForm({ title: '', categoryId: '', steps: [] });
      setSelectedTutorial(null);
      setAlertModal({
        show: true,
        title: 'Başarılı',
        message: 'Nasıl yapılır kartı kaydedildi.'
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'tutorials');
    } finally {
      setIsUploading(false);
    }
  };

  const startEditingTutorial = (tutorial: Tutorial) => {
    setSelectedTutorial(tutorial);
    setTutorialForm({
      title: tutorial.title,
      categoryId: tutorial.categoryId || '',
      steps: tutorial.steps
    });
    setShowTutorialModal(true);
  };

  const handleDeleteTutorial = async (id: string) => {
    if (!isAdmin) return;
    setConfirmModal({
      show: true,
      title: 'Sil',
      message: 'Bu nasıl yapılır kartını silmek istediğinize emin misiniz?',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'tutorials', id));
          setConfirmModal(prev => ({ ...prev, show: false }));
          if (activeTutorial?.id === id) setActiveTutorial(null);
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, `tutorials/${id}`);
        }
      }
    });
  };

  const saveAnnotations = async () => {
    if (!annotatingItem) return;

    try {
      if (annotatingItem.type === 'term') {
        const termRef = doc(db, 'terms', annotatingItem.id);
        await updateDoc(termRef, {
          arrows: annotatingItem.arrows
        });
        setTerms(prev => prev.map(t => t.id === annotatingItem.id ? { ...t, arrows: annotatingItem.arrows } : t));
        if (activeTerm?.id === annotatingItem.id) {
          setActiveTerm(prev => prev ? { ...prev, arrows: annotatingItem.arrows } : null);
        }
      } else {
        const tutorial = tutorials.find(t => t.steps.some(s => s.id === annotatingItem.id));
        if (tutorial) {
          const tutorialRef = doc(db, 'tutorials', tutorial.id);
          const updatedSteps = tutorial.steps.map(s => 
            s.id === annotatingItem.id ? { ...s, arrows: annotatingItem.arrows } : s
          );
          await updateDoc(tutorialRef, {
            steps: updatedSteps
          });
          setTutorials(prev => prev.map(t => t.id === tutorial.id ? { ...t, steps: updatedSteps } : t));
          if (activeTutorial?.id === tutorial.id) {
            setActiveTutorial(prev => prev ? { ...prev, steps: updatedSteps } : null);
          }
        }
      }
      setAnnotatingItem(null);
      setSelectedArrowIndex(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `${annotatingItem.type}s/${annotatingItem.id}`);
    }
  };

  const addTutorialStep = async (file: File) => {
    setIsUploading(true);
    try {
      const imageUrl = await compressImage(file);
      const newStep: TutorialStep = {
        id: Math.random().toString(36).substr(2, 9),
        title: '',
        imageUrl,
        note: '',
        arrows: [{ x: 50, y: 50, color: '#ef4444' }]
      };
      setTutorialForm(prev => ({
        ...prev,
        steps: [...prev.steps, newStep]
      }));
    } catch (error) {
      console.error("Step image error:", error);
    } finally {
      setIsUploading(false);
    }
  };

  const updateStepTitle = (stepId: string, title: string) => {
    setTutorialForm(prev => ({
      ...prev,
      steps: prev.steps.map(s => s.id === stepId ? { ...s, title } : s)
    }));
  };

  const updateStepNote = (stepId: string, note: string) => {
    setTutorialForm(prev => ({
      ...prev,
      steps: prev.steps.map(s => s.id === stepId ? { ...s, note } : s)
    }));
  };

  const updateStepArrow = (stepId: string, x: number, y: number, color: string = '#ef4444') => {
    setTutorialForm(prev => ({
      ...prev,
      steps: prev.steps.map(s => {
        if (s.id === stepId) {
          const arrows = s.arrows || [];
          const existingIndex = arrows.findIndex(p => 
            Math.abs(p.x - x) < 5 && Math.abs(p.y - y) < 5
          );
          
          if (existingIndex !== -1) {
            return {
              ...s,
              arrows: arrows.filter((_, i) => i !== existingIndex)
            };
          } else {
            return {
              ...s,
              arrows: [...arrows, { x, y, color }]
            };
          }
        }
        return s;
      })
    }));
  };

  const removeTutorialStep = (stepId: string) => {
    setTutorialForm(prev => ({
      ...prev,
      steps: prev.steps.filter(s => s.id !== stepId)
    }));
  };

  const resetTermForm = () => {
    setNewTerm({
      title: '',
      description: '',
      categoryId: '',
      image: null,
      imagePreview: ''
    });
    setEditingTerm(null);
    setUploadProgress(0);
  };

  const startEditing = (term: Term) => {
    setEditingTerm(term);
    setNewTerm({
      title: term.title,
      description: term.description,
      categoryId: term.categoryId,
      image: null,
      imagePreview: term.imageUrl || ''
    });
    setShowAddTermModal(true);
  };

  // Filtered terms
  const filteredTerms = terms.filter(term => {
    const matchesCategory = selectedCategory === 'all' || (term.categoryId || '') === selectedCategory;
    const matchesSearch = term.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          term.description.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // Filtered tutorials
  const filteredTutorials = tutorials.filter(tut => {
    const matchesCategory = selectedCategory === 'all' || (tut.categoryId || '') === selectedCategory;
    const matchesSearch = tut.title.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // Category counts
  const getCategoryCount = (categoryId: string, type: 'terms' | 'tutorials') => {
    if (type === 'terms') {
      if (categoryId === 'all') return terms.length;
      return terms.filter(t => (t.categoryId || '') === categoryId).length;
    } else {
      if (categoryId === 'all') return tutorials.length;
      return tutorials.filter(t => (t.categoryId || '') === categoryId).length;
    }
  };

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-neutral-50 text-neutral-900 font-sans pb-20 flex">
        {/* Sidebar */}
        <AnimatePresence>
          {isSidebarOpen && (
            <>
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsSidebarOpen(false)}
                className="fixed inset-0 bg-neutral-900/40 backdrop-blur-sm z-40 lg:hidden"
              />
              <motion.aside 
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="fixed inset-y-0 left-0 w-72 bg-white border-r border-neutral-200 z-50 flex flex-col shadow-2xl lg:shadow-none lg:relative lg:z-0"
              >
                <div className="p-6 border-b border-neutral-100 flex items-center justify-between">
                  <h2 className="font-bold text-lg">Menü</h2>
                  <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden text-neutral-400 cursor-pointer">
                    <X size={20} />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-1">
                  <div className="px-4 py-2 mb-2">
                          {/* Terimler Sözlüğü Section */}
                  <div className="space-y-1">
                    <button 
                      onClick={() => { setIsTutorialView(false); setSelectedCategory('all'); setActiveTutorial(null); setActiveTerm(null); setIsSidebarOpen(false); }}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all",
                        !isTutorialView && !activeTutorial
                          ? "bg-indigo-50 text-indigo-600" 
                          : "text-neutral-600 hover:bg-neutral-50"
                      )}
                    >
                      <BookOpen size={18} className={!isTutorialView ? "text-indigo-600" : "text-neutral-400"} />
                      Terimler Sözlüğü
                    </button>

                    <div className="pl-8 space-y-1 mt-1">
                      <button 
                        onClick={() => { setIsTutorialView(false); setSelectedCategory('all'); setActiveTutorial(null); setActiveTerm(null); setIsSidebarOpen(false); }}
                        className={cn(
                          "w-full flex items-center gap-3 px-4 py-2 rounded-lg text-xs font-bold transition-all",
                          !isTutorialView && selectedCategory === 'all' 
                            ? "text-indigo-600 bg-indigo-50/50" 
                            : "text-neutral-500 hover:text-neutral-700"
                        )}
                      >
                        <FolderPlus size={14} className={!isTutorialView && selectedCategory === 'all' ? "text-indigo-600" : "text-neutral-400"} />
                        <span className="flex-1 text-left">Tümü</span>
                        <span className="text-[10px] opacity-50">({getCategoryCount('all', 'terms')})</span>
                      </button>
                      <button 
                        onClick={() => { setIsTutorialView(false); setSelectedCategory(''); setActiveTutorial(null); setActiveTerm(null); setIsSidebarOpen(false); }}
                        className={cn(
                          "w-full flex items-center gap-3 px-4 py-2 rounded-lg text-xs font-bold transition-all",
                          !isTutorialView && selectedCategory === '' 
                            ? "text-indigo-600 bg-indigo-50/50" 
                            : "text-neutral-500 hover:text-neutral-700"
                        )}
                      >
                        <FolderPlus size={14} className={!isTutorialView && selectedCategory === '' ? "text-indigo-600" : "text-neutral-400"} />
                        <span className="flex-1 text-left">Kategorisiz</span>
                        <span className="text-[10px] opacity-50">({getCategoryCount('', 'terms')})</span>
                      </button>
                      {categories.map(cat => (
                        <div key={cat.id} className="group relative">
                          <button 
                            onClick={() => { setIsTutorialView(false); setSelectedCategory(cat.id); setActiveTutorial(null); setActiveTerm(null); setIsSidebarOpen(false); }}
                            className={cn(
                              "w-full flex items-center justify-between px-4 py-2 rounded-lg text-xs font-bold transition-all",
                              !isTutorialView && selectedCategory === cat.id 
                                ? "text-indigo-600 bg-indigo-50/50" 
                                : "text-neutral-500 hover:text-neutral-700"
                            )}
                          >
                            <div className="flex items-center gap-3 flex-1 truncate">
                              <span className="truncate">{cat.name}</span>
                              <span className="text-[10px] opacity-50">({getCategoryCount(cat.id, 'terms')})</span>
                            </div>
                            {isAdmin && (
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button 
                                  onClick={(e) => { 
                                    e.stopPropagation(); 
                                    setEditingCategory(cat); 
                                    setNewCategoryName(cat.name); 
                                    setShowEditCategoryModal(true); 
                                  }}
                                  className="p-1 text-indigo-400 hover:text-indigo-600"
                                >
                                  <Edit2 size={12} />
                                </button>
                                <button 
                                  onClick={(e) => { e.stopPropagation(); handleDeleteCategory(cat.id); }}
                                  className="p-1 text-red-400 hover:text-red-600"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            )}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="h-px bg-neutral-100 my-4 mx-4" />

                  {/* Nasıl Yapılır Section */}
                  <div className="space-y-1">
                    <button 
                      onClick={() => { setIsTutorialView(true); setSelectedCategory('all'); setActiveTutorial(null); setActiveTerm(null); setIsSidebarOpen(false); }}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all",
                        isTutorialView && !activeTutorial && !activeTerm
                          ? "bg-indigo-50 text-indigo-600" 
                          : "text-neutral-600 hover:bg-neutral-50"
                      )}
                    >
                      <HelpCircle size={18} className={isTutorialView ? "text-indigo-600" : "text-neutral-400"} />
                      Nasıl Yapılır?
                    </button>

                    <div className="pl-8 space-y-1 mt-1">
                      <button 
                        onClick={() => { setIsTutorialView(true); setSelectedCategory('all'); setActiveTutorial(null); setActiveTerm(null); setIsSidebarOpen(false); }}
                        className={cn(
                          "w-full flex items-center gap-3 px-4 py-2 rounded-lg text-xs font-bold transition-all",
                          isTutorialView && selectedCategory === 'all' && !activeTutorial
                            ? "text-indigo-600 bg-indigo-50/50" 
                            : "text-neutral-500 hover:text-neutral-700"
                        )}
                      >
                        <FolderPlus size={14} className={isTutorialView && selectedCategory === 'all' && !activeTutorial ? "text-indigo-600" : "text-neutral-400"} />
                        <span className="flex-1 text-left">Tümü</span>
                        <span className="text-[10px] opacity-50">({getCategoryCount('all', 'tutorials')})</span>
                      </button>
                      <button 
                        onClick={() => { setIsTutorialView(true); setSelectedCategory(''); setActiveTutorial(null); setActiveTerm(null); setIsSidebarOpen(false); }}
                        className={cn(
                          "w-full flex items-center gap-3 px-4 py-2 rounded-lg text-xs font-bold transition-all",
                          isTutorialView && selectedCategory === '' && !activeTutorial
                            ? "text-indigo-600 bg-indigo-50/50" 
                            : "text-neutral-500 hover:text-neutral-700"
                        )}
                      >
                        <FolderPlus size={14} className={isTutorialView && selectedCategory === '' && !activeTutorial ? "text-indigo-600" : "text-neutral-400"} />
                        <span className="flex-1 text-left">Kategorisiz</span>
                        <span className="text-[10px] opacity-50">({getCategoryCount('', 'tutorials')})</span>
                      </button>
                      {categories.map(cat => (
                        <div key={cat.id} className="group relative">
                          <button 
                            onClick={() => { setIsTutorialView(true); setSelectedCategory(cat.id); setActiveTutorial(null); setActiveTerm(null); setIsSidebarOpen(false); }}
                            className={cn(
                              "w-full flex items-center justify-between px-4 py-2 rounded-lg text-xs font-bold transition-all",
                              isTutorialView && selectedCategory === cat.id && !activeTutorial
                                ? "text-indigo-600 bg-indigo-50/50" 
                                : "text-neutral-500 hover:text-neutral-700"
                            )}
                          >
                            <div className="flex items-center gap-3 flex-1 truncate">
                              <span className="truncate">{cat.name}</span>
                              <span className="text-[10px] opacity-50">({getCategoryCount(cat.id, 'tutorials')})</span>
                            </div>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
                <div className="p-4 border-t border-neutral-100 space-y-2">
                  {isAdmin && (
                    <div className="px-4 py-2 mb-1">
                      <h3 className="text-[10px] uppercase tracking-[0.2em] font-black text-neutral-400">Yönetim</h3>
                    </div>
                  )}
                  {isTutorialView && isAdmin && (
                    <button 
                      onClick={() => {
                        setSelectedTutorial(null);
                        setTutorialForm({ title: '', categoryId: '', steps: [] });
                        setShowTutorialModal(true);
                      }}
                      className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-emerald-100"
                    >
                      <Plus size={18} />
                      Yeni Nasıl Yapılır
                    </button>
                  )}
                  {isAdmin && (
                    <button 
                      onClick={() => setShowLogoUpdateModal(true)}
                      className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-indigo-100"
                    >
                      <Palette size={18} />
                      Logo Güncelle
                    </button>
                  )}
                  {isAdmin && (
                    <button 
                      onClick={() => setShowAddCategoryModal(true)}
                      className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-indigo-100"
                    >
                      <Plus size={18} />
                      Yeni Kategori
                    </button>
                  )}
                  {!isAdmin && (
                    <button 
                      onClick={() => setShowAdminModal(true)}
                      className="w-full mt-2 flex items-center justify-center gap-2 py-3 bg-neutral-100 text-neutral-600 rounded-xl font-bold text-sm hover:bg-neutral-200 transition-colors"
                    >
                      <Lock size={16} />
                      Yönetici Girişi
                    </button>
                  )}
                </div>
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-neutral-200 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setIsSidebarOpen(true)}
                className="p-2 -ml-2 text-neutral-600 hover:bg-neutral-100 rounded-xl transition-colors"
              >
                <ChevronRight size={24} className={isSidebarOpen ? "rotate-180 transition-transform" : ""} />
              </button>
              <div className="flex items-center gap-2">
                <Logo className="w-10 h-10 shadow-indigo-200" src={appSettings?.logoUrl} />
                <div className="hidden sm:block">
                  <h1 className="font-bold text-lg leading-tight">Polimer İplik</h1>
                  <p className="text-xs text-neutral-500 font-medium uppercase tracking-wider">Otomasyon Paketleme</p>
                </div>
              </div>
            </div>

            <button 
              onClick={() => isAdmin ? setIsAdmin(false) : setShowAdminModal(true)}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold transition-all",
                isAdmin 
                  ? "bg-emerald-100 text-emerald-700 border border-emerald-200" 
                  : "bg-neutral-100 text-neutral-600 border border-neutral-200"
              )}
            >
              {isAdmin ? <Unlock size={16} /> : <Lock size={16} />}
              {isAdmin ? 'Admin' : 'ID'}
            </button>
          </header>

          {/* Search */}
          {!isTutorialView && (
            <section className="px-4 py-6">
              <div className="relative group max-w-2xl mx-auto">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400 group-focus-within:text-indigo-500 transition-colors" size={20} />
                <input 
                  type="text" 
                  placeholder="Terim veya parça ara..." 
                  className="w-full pl-12 pr-4 py-4 bg-white border border-neutral-200 rounded-2xl shadow-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-base"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </section>
          )}

          {/* Terms Grid or Tutorial View */}
          <main className="px-4 pb-10 flex-1 overflow-y-auto">
            <div className="max-w-7xl mx-auto">
              {isTutorialView ? (
                <div className="space-y-8">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="font-bold text-3xl text-neutral-900">Nasıl Yapılır?</h2>
                      <p className="text-neutral-500 font-medium mt-1">Öğrenme Paneli ve İnfografikler</p>
                    </div>
                  </div>

                  {activeTutorial ? (
                    <div 
                      className="bg-[#fdfcf8] rounded-[60px] p-8 sm:p-16 shadow-2xl border border-neutral-100 relative overflow-hidden"
                    >
                      {/* Background Decorative Elements */}
                      <div className="absolute top-0 left-0 w-full h-full opacity-5 pointer-events-none">
                        <div className="absolute top-10 right-10 w-64 h-64 bg-emerald-500 rounded-full blur-3xl" />
                        <div className="absolute bottom-10 left-10 w-64 h-64 bg-indigo-500 rounded-full blur-3xl" />
                      </div>

                      <div className="absolute top-0 right-0 p-8 z-50">
                        <button 
                          onClick={(e) => { e.stopPropagation(); setActiveTutorial(null); }}
                          className="p-3 bg-white text-neutral-400 rounded-2xl shadow-sm hover:text-red-500 transition-colors cursor-pointer relative z-[60]"
                        >
                          <X size={24} />
                        </button>
                      </div>

                      <div className="relative z-10 flex flex-col items-center mb-16">
                        <div className="inline-block px-8 py-3 bg-emerald-50 border border-emerald-100 rounded-2xl mb-4">
                          <h3 className="text-3xl sm:text-4xl font-black text-emerald-800 tracking-tight text-center uppercase">
                            {activeTutorial.title}
                          </h3>
                        </div>
                        <div className="flex gap-2">
                          {isAdmin && (
                            <>
                              <button 
                                onClick={() => startEditingTutorial(activeTutorial)}
                                className="p-3 bg-white text-indigo-600 rounded-2xl shadow-sm hover:bg-indigo-50 transition-colors cursor-pointer"
                                title="Düzenle"
                              >
                                <Edit2 size={24} />
                              </button>
                              <button 
                                onClick={() => handleDeleteTutorial(activeTutorial.id)}
                                className="p-3 bg-white text-red-600 rounded-2xl shadow-sm hover:bg-red-50 transition-colors cursor-pointer"
                                title="Sil"
                              >
                                <Trash2 size={24} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                      
                      <div className="relative max-w-5xl mx-auto space-y-24">
                        {activeTutorial.steps.map((step, index) => {
                          const stepColors = [
                            { bg: 'bg-pink-50', border: 'border-pink-100', text: 'text-pink-700', accent: 'bg-pink-500' },
                            { bg: 'bg-emerald-50', border: 'border-emerald-100', text: 'text-emerald-700', accent: 'bg-emerald-500' },
                            { bg: 'bg-amber-50', border: 'border-amber-100', text: 'text-amber-700', accent: 'bg-amber-500' },
                            { bg: 'bg-indigo-50', border: 'border-indigo-100', text: 'text-indigo-700', accent: 'bg-indigo-500' },
                            { bg: 'bg-rose-50', border: 'border-rose-100', text: 'text-rose-700', accent: 'bg-rose-500' },
                            { bg: 'bg-cyan-50', border: 'border-cyan-100', text: 'text-cyan-700', accent: 'bg-cyan-500' },
                          ];
                          const color = stepColors[index % stepColors.length];
                          const isEven = index % 2 === 0;

                          return (
                            <motion.div 
                              initial={{ opacity: 0, x: isEven ? 50 : -50 }}
                              whileInView={{ opacity: 1, x: 0 }}
                              viewport={{ once: true }}
                              key={step.id} 
                              className={cn(
                                "relative p-8 sm:p-12 rounded-[60px] border-2 transition-all hover:shadow-2xl group",
                                color.bg, color.border
                              )}
                            >
                              {/* Step Badge */}
                              <div className={cn(
                                "absolute -top-6 px-8 py-3 rounded-2xl text-white font-black text-xl shadow-lg uppercase tracking-widest z-30",
                                isEven ? "right-12" : "left-12",
                                color.accent
                              )}>
                                {index + 1}. ADIM
                              </div>

                              <div className={cn(
                                "flex flex-col items-center gap-12 w-full",
                                isEven ? "lg:flex-row-reverse" : "lg:flex-row"
                              )}>
                                {/* Image Container */}
                                <div className="relative shrink-0 z-20">
                                  <div 
                                    className="w-64 h-64 sm:w-80 sm:h-80 rounded-[50px] overflow-hidden border-8 border-white shadow-2xl cursor-pointer hover:scale-105 transition-transform relative group/img"
                                    onClick={() => setSelectedImage({ url: step.imageUrl, arrows: step.arrows || [] })}
                                  >
                                     <ImageWithArrows 
                                       src={step.imageUrl} 
                                       alt={step.title} 
                                       arrows={step.arrows}
                                       className="w-full h-full"
                                       onCanvasClick={() => setSelectedImage({ url: step.imageUrl, arrows: step.arrows || [] })}
                                       showArrows={false}
                                     />
                                     {isAdmin && (
                                       <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center z-20">
                                         <button 
                                           onClick={(e) => { e.stopPropagation(); setAnnotatingItem({ type: 'step', id: step.id, imageUrl: step.imageUrl, arrows: step.arrows || [] }); }}
                                           className="p-4 bg-indigo-600 text-white rounded-full shadow-xl hover:bg-indigo-700 transition-all transform hover:scale-110"
                                           title="Görseli İşaretle"
                                         >
                                           <MousePointer2 size={24} />
                                         </button>
                                       </div>
                                     )}
                                  </div>
                                </div>

                                {/* Content Box */}
                                <div className={cn(
                                  "flex-1 space-y-6 z-10",
                                  isEven ? "text-center lg:text-right" : "text-center lg:text-left"
                                )}>
                                  <div className="inline-block px-6 py-2 bg-white/80 backdrop-blur-sm border border-white rounded-xl shadow-sm mb-2">
                                    <h4 className={cn("text-2xl sm:text-4xl font-black uppercase tracking-tight", color.text)}>
                                      {step.title}
                                    </h4>
                                  </div>
                                  <div className="bg-white/60 backdrop-blur-sm p-8 sm:p-10 rounded-[40px] shadow-sm border border-white relative">
                                    <p className="text-neutral-700 text-lg sm:text-2xl leading-relaxed font-medium">
                                      {step.note}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>

                      {/* Footer Logo/Brand */}
                      <div className="mt-32 flex flex-col items-center gap-4 opacity-70">
                        <Logo className="w-20 h-20" src={appSettings?.logoUrl} />
                        <div className="text-center">
                          <p className="font-bold text-xl tracking-tighter">Polimer İplik</p>
                          <p className="text-[10px] uppercase tracking-[0.3em] font-black">Otomasyon Paketleme</p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                      {filteredTutorials.map(tut => (
                        <button
                          key={tut.id}
                          id={`tutorial-card-${tut.id}`}
                          onClick={() => setActiveTutorial(tut)}
                          className="group bg-white p-6 rounded-[40px] border border-neutral-200 shadow-sm hover:shadow-xl hover:border-indigo-200 transition-all text-left flex flex-col h-full"
                        >
                          <div className="flex items-start justify-between mb-4">
                            <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform overflow-hidden">
                              <Logo className="w-full h-full shadow-none bg-transparent" src={appSettings?.logoUrl} />
                            </div>
                            <div className="flex -space-x-3 overflow-hidden">
                              {tut.steps.slice(0, 3).map((step, i) => (
                                <div key={step.id} className="w-10 h-10 rounded-full border-2 border-white overflow-hidden bg-neutral-100 relative">
                                  <ImageWithArrows 
                                    src={step.imageUrl} 
                                    alt={step.title} 
                                    arrows={step.arrows}
                                    className="w-full h-full"
                                    showArrows={false}
                                  />
                                </div>
                              ))}
                              {tut.steps.length > 3 && (
                                <div className="w-10 h-10 rounded-full border-2 border-white bg-neutral-100 flex items-center justify-center text-[10px] font-bold text-neutral-500">
                                  +{tut.steps.length - 3}
                                </div>
                              )}
                            </div>
                          </div>
                          <h4 className="font-bold text-lg mb-2 group-hover:text-indigo-600 transition-colors line-clamp-2 flex-1">{tut.title}</h4>
                          <div className="flex items-center justify-between mt-4">
                            <div className="flex items-center gap-2">
                              <span className="text-neutral-500 text-[10px] font-bold uppercase tracking-wider bg-neutral-50 px-3 py-1 rounded-lg">
                                {tut.steps.length} ADIM
                              </span>
                              {isAdmin && (
                                <div className="flex items-center gap-1">
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); startEditingTutorial(tut); }}
                                    className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                  >
                                    <Edit2 size={14} />
                                  </button>
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); handleDeleteTutorial(tut.id); }}
                                    className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              )}
                            </div>
                            <div className="text-indigo-600 opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0">
                              <ChevronRight size={20} />
                            </div>
                          </div>
                        </button>
                      ))}
                      {isAdmin && (
                        <button
                          onClick={() => {
                            setSelectedTutorial(null);
                            setTutorialForm({ title: '', categoryId: '', steps: [] });
                            setShowTutorialModal(true);
                          }}
                          className="bg-neutral-50 p-6 rounded-[32px] border-2 border-dashed border-neutral-300 flex flex-col items-center justify-center gap-3 hover:bg-white hover:border-indigo-300 transition-all group"
                        >
                          <div className="w-12 h-12 bg-white text-neutral-400 rounded-full flex items-center justify-center group-hover:text-indigo-600 group-hover:scale-110 transition-all shadow-sm">
                            <Plus size={24} />
                          </div>
                          <span className="text-sm font-bold text-neutral-500 group-hover:text-indigo-600">Yeni Kart Ekle</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-8">
                  {activeTerm ? (
                    <div 
                      className="bg-white rounded-[60px] p-8 sm:p-16 shadow-2xl border border-neutral-100 relative overflow-hidden"
                    >
                      <div className="absolute top-0 right-0 p-8 z-50">
                        <button 
                          onClick={(e) => { e.stopPropagation(); setActiveTerm(null); }}
                          className="p-3 bg-neutral-100 text-neutral-500 rounded-2xl hover:bg-neutral-200 transition-colors cursor-pointer relative z-[60]"
                        >
                          <X size={24} />
                        </button>
                      </div>

                      <div className="flex flex-col lg:flex-row gap-12 items-center lg:items-start">
                        {/* Term Image */}
                        <div className="w-full lg:w-1/2 aspect-square rounded-[40px] overflow-hidden bg-neutral-50 border border-neutral-100 shadow-inner relative group/img">
                          {activeTerm.imageUrl ? (
                            <>
                              <ImageWithArrows 
                                src={activeTerm.imageUrl} 
                                alt={activeTerm.title} 
                                arrows={activeTerm.arrows}
                                className="w-full h-full cursor-pointer"
                                onCanvasClick={() => setSelectedImage({ url: activeTerm.imageUrl!, arrows: activeTerm.arrows || [] })}
                                showArrows={false}
                              />
                              {isAdmin && (
                                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center z-20">
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); setAnnotatingItem({ type: 'term', id: activeTerm.id, imageUrl: activeTerm.imageUrl!, arrows: activeTerm.arrows || [] }); }}
                                    className="p-4 bg-indigo-600 text-white rounded-full shadow-xl hover:bg-indigo-700 transition-all transform hover:scale-110"
                                    title="Görseli İşaretle"
                                  >
                                    <MousePointer2 size={24} />
                                  </button>
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="w-full h-full flex items-center justify-center p-12">
                              <Logo className="w-full h-full opacity-20" src={appSettings?.logoUrl} />
                            </div>
                          )}
                        </div>

                        {/* Term Content */}
                        <div className="w-full lg:w-1/2 space-y-8">
                          <div>
                            <span className="bg-indigo-50 text-indigo-600 text-xs font-bold px-4 py-1.5 rounded-xl uppercase tracking-widest mb-4 inline-block">
                              {categories.find(c => c.id === activeTerm.categoryId)?.name || 'Kategorisiz'}
                            </span>
                            <h3 className="text-4xl sm:text-5xl font-black text-neutral-900 tracking-tight leading-tight">
                              {activeTerm.title}
                            </h3>
                          </div>

                          <div className="prose prose-neutral max-w-none">
                            <p className="text-xl text-neutral-600 leading-relaxed font-medium">
                              {activeTerm.description}
                            </p>
                          </div>

                          <div className="flex gap-4 pt-8 border-t border-neutral-100">
                            {isAdmin && (
                              <>
                                <button 
                                  onClick={() => startEditing(activeTerm)}
                                  className="flex items-center gap-2 px-6 py-3 bg-indigo-50 text-indigo-600 rounded-2xl font-bold hover:bg-indigo-100 transition-colors"
                                >
                                  <Edit2 size={20} />
                                  Düzenle
                                </button>
                                <button 
                                  onClick={() => handleDeleteTerm(activeTerm)}
                                  className="flex items-center gap-2 px-6 py-3 bg-red-50 text-red-600 rounded-2xl font-bold hover:bg-red-100 transition-colors"
                                >
                                  <Trash2 size={20} />
                                  Sil
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-6">
                        <div>
                          <h2 className="font-bold text-2xl text-neutral-900">
                            {selectedCategory === 'all' ? 'Tüm Terimler' : selectedCategory === '' ? 'Kategorisiz' : categories.find(c => c.id === selectedCategory)?.name}
                          </h2>
                          <p className="text-neutral-500 text-sm font-medium mt-1">Toplam {filteredTerms.length} sonuç bulundu</p>
                        </div>
                      </div>

                      {loading ? (
                        <div className="flex flex-col items-center justify-center py-20 text-neutral-400 gap-3">
                          <Loader2 className="animate-spin" size={32} />
                          <p className="text-sm font-medium">Yükleniyor...</p>
                        </div>
                      ) : filteredTerms.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                          <AnimatePresence mode="popLayout">
                            {filteredTerms.map((term) => (
                              <TermCard 
                                key={term.id}
                                term={term}
                                categoryName={categories.find(c => c.id === term.categoryId)?.name || 'Kategorisiz'}
                                isAdmin={isAdmin}
                                onEdit={startEditing}
                                onDelete={handleDeleteTerm}
                                onShowImage={(url, arrows) => setSelectedImage({ url, arrows: arrows || [] })}
                                onShowDetails={setActiveTerm}
                                onAnnotate={(term) => setAnnotatingItem({ type: 'term', id: term.id, imageUrl: term.imageUrl!, arrows: term.arrows || [] })}
                                logoUrl={appSettings?.logoUrl}
                              />
                            ))}
                          </AnimatePresence>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-20 text-neutral-400 gap-4 bg-white rounded-[40px] border border-dashed border-neutral-300">
                          <div className="w-20 h-20 bg-neutral-50 rounded-full flex items-center justify-center">
                            <Search size={40} strokeWidth={1} />
                          </div>
                          <div className="text-center">
                            <p className="text-lg font-bold text-neutral-900">Sonuç bulunamadı</p>
                            <p className="text-sm text-neutral-500 mt-1">Arama kriterlerinizi değiştirmeyi deneyin.</p>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </main>
        </div>

        {/* Floating Action Button */}
        {isAdmin && (
          <button 
            onClick={() => { 
              if (isTutorialView) {
                setSelectedTutorial(null);
                setTutorialForm({ title: '', categoryId: '', steps: [] });
                setShowTutorialModal(true);
              } else {
                resetTermForm(); 
                setShowAddTermModal(true); 
              }
            }}
            className="fixed bottom-8 right-8 w-16 h-16 bg-indigo-600 text-white rounded-2xl shadow-2xl shadow-indigo-400 flex items-center justify-center hover:scale-110 active:scale-95 transition-all z-40"
          >
            <Plus size={32} />
          </button>
        )}

        {/* Logo Update Modal */}
        <AnimatePresence>
          {showLogoUpdateModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowLogoUpdateModal(false)}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="relative bg-white w-full max-w-md rounded-[40px] shadow-2xl overflow-hidden p-8"
              >
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h2 className="text-2xl font-bold text-neutral-900">Logo Güncelle</h2>
                    <p className="text-neutral-500 text-sm font-medium mt-1">Uygulama logosunu değiştirin</p>
                  </div>
                  <button 
                    onClick={() => setShowLogoUpdateModal(false)} 
                    className="p-3 bg-neutral-100 text-neutral-500 rounded-2xl hover:bg-neutral-200 transition-colors cursor-pointer"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="space-y-6">
                  <div className="flex flex-col items-center gap-6 p-8 bg-neutral-50 rounded-[32px] border-2 border-dashed border-neutral-200">
                    <Logo className="w-32 h-32" src={appSettings?.logoUrl} />
                    <div className="flex gap-3">
                      <button 
                        onClick={() => {
                          const input = document.createElement('input');
                          input.type = 'file';
                          input.accept = 'image/*';
                          input.onchange = (e) => {
                            const file = (e.target as HTMLInputElement).files?.[0];
                            if (file) handleLogoUpdate(file);
                          };
                          input.click();
                        }}
                        disabled={isUploading}
                        className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-2xl font-bold text-sm shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all disabled:opacity-50"
                      >
                        {isUploading ? <Loader2 className="animate-spin" size={18} /> : <ImageIcon size={18} />}
                        {isUploading ? 'Yükleniyor...' : 'Yeni Logo Seç'}
                      </button>
                    </div>
                  </div>
                  
                  <p className="text-xs text-center text-neutral-400 font-medium">
                    Önerilen format: PNG, Kare (1:1) oranında.
                  </p>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Modals */}
        <AnimatePresence>
          {/* Image Annotator Modal */}
          {annotatingItem && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => {
                  setAnnotatingItem(null);
                  setSelectedArrowIndex(null);
                }}
                className="absolute inset-0 bg-neutral-900/90 backdrop-blur-md"
              />
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="relative bg-white w-full max-w-5xl rounded-[40px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
              >
                {/* Header */}
                <div className="p-6 border-b border-neutral-100 flex items-center justify-between bg-white z-10">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center">
                      <MousePointer2 size={24} />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-neutral-900">Görseli İşaretle</h2>
                      <p className="text-xs text-neutral-500 font-medium uppercase tracking-wider">Ok eklemek için görsele tıklayın</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      setAnnotatingItem(null);
                      setSelectedArrowIndex(null);
                    }}
                    className="p-3 bg-neutral-100 text-neutral-500 rounded-2xl hover:bg-neutral-200 transition-colors cursor-pointer"
                  >
                    <X size={24} />
                  </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
                  {/* Canvas Area */}
                  <div className="flex-1 bg-neutral-100 p-4 sm:p-8 flex items-center justify-center overflow-auto">
                    <div className="relative shadow-2xl rounded-2xl overflow-hidden bg-white group/annotator">
                      <ImageWithArrows 
                        src={annotatingItem.imageUrl} 
                        alt="Annotating" 
                        arrows={annotatingItem.arrows}
                        className="max-w-full max-h-[60vh] object-contain cursor-crosshair touch-none"
                        selectedArrowIndex={selectedArrowIndex}
                        onArrowMouseDown={(index) => {
                          setSelectedArrowIndex(index);
                          setIsDragging(true);
                        }}
                        onCanvasClick={(e) => {
                          if (isDragging) return;
                          const rect = e.currentTarget.getBoundingClientRect();
                          const x = ((e.clientX - rect.left) / rect.width) * 100;
                          const y = ((e.clientY - rect.top) / rect.height) * 100;
                          
                          // Get current selected color from state or default
                          const activeColor = (window as any).activeAnnotatorColor || '#ef4444';
                          
                          setAnnotatingItem(prev => {
                            if (!prev) return null;
                            const arrows = prev.arrows || [];
                            
                            // Check if clicking near an existing arrow to select it
                            const existingIndex = arrows.findIndex(p => 
                              Math.abs(p.x - x) < 4 && Math.abs(p.y - y) < 4
                            );
                            
                            if (existingIndex !== -1) {
                              setSelectedArrowIndex(existingIndex);
                              return prev;
                            } else {
                              // Add new arrow and select it
                              const newArrow = { x, y, color: activeColor, rotation: 0 };
                              setSelectedArrowIndex(arrows.length);
                              return {
                                ...prev,
                                arrows: [...arrows, newArrow]
                              };
                            }
                          });
                        }}
                        onCanvasMouseMove={(e) => {
                          if (!isDragging || selectedArrowIndex === null) return;
                          const rect = e.currentTarget.getBoundingClientRect();
                          const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
                          const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
                          setAnnotatingItem(prev => {
                            if (!prev) return null;
                            const arrows = [...prev.arrows];
                            arrows[selectedArrowIndex] = { ...arrows[selectedArrowIndex], x, y };
                            return { ...prev, arrows };
                          });
                        }}
                        onCanvasMouseUp={() => setIsDragging(false)}
                        onCanvasMouseLeave={() => setIsDragging(false)}
                        onCanvasTouchMove={(e) => {
                          if (!isDragging || selectedArrowIndex === null) return;
                          const rect = e.currentTarget.getBoundingClientRect();
                          const touch = e.touches[0];
                          const x = Math.max(0, Math.min(100, ((touch.clientX - rect.left) / rect.width) * 100));
                          const y = Math.max(0, Math.min(100, ((touch.clientY - rect.top) / rect.height) * 100));
                          setAnnotatingItem(prev => {
                            if (!prev) return null;
                            const arrows = [...prev.arrows];
                            arrows[selectedArrowIndex] = { ...arrows[selectedArrowIndex], x, y };
                            return { ...prev, arrows };
                          });
                        }}
                        onCanvasTouchEnd={() => setIsDragging(false)}
                      />
                    </div>
                  </div>

                  {/* Sidebar Controls */}
                  <div className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-neutral-100 p-6 flex flex-col gap-8 bg-white overflow-y-auto">
                    {/* Color Picker */}
                    <div className="space-y-4">
                      <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest flex items-center gap-2">
                        <Palette size={14} />
                        Ok Rengi Seçin
                      </label>
                      <div className="grid grid-cols-4 gap-3">
                        {COLORS.map((color) => (
                          <button
                            key={color.value}
                            onClick={() => {
                              (window as any).activeAnnotatorColor = color.value;
                              
                              // If an arrow is selected, update its color
                              if (selectedArrowIndex !== null) {
                                setAnnotatingItem(prev => {
                                  if (!prev) return null;
                                  const arrows = [...(prev.arrows || [])];
                                  arrows[selectedArrowIndex] = { ...arrows[selectedArrowIndex], color: color.value };
                                  return { ...prev, arrows };
                                });
                              }

                              const btn = document.getElementById(`color-${color.value.replace('#', '')}`);
                              document.querySelectorAll('.color-btn').forEach(el => el.classList.remove('ring-4', 'ring-indigo-100', 'border-indigo-600'));
                              btn?.classList.add('ring-4', 'ring-indigo-100', 'border-indigo-600');
                            }}
                            id={`color-${color.value.replace('#', '')}`}
                            className={cn(
                              "color-btn w-full aspect-square rounded-xl border-2 border-transparent transition-all transform hover:scale-110",
                              (window as any).activeAnnotatorColor === color.value ? "ring-4 ring-indigo-100 border-indigo-600" : "border-neutral-200"
                            )}
                            style={{ backgroundColor: color.value }}
                            title={color.name}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Rotation Control */}
                    {selectedArrowIndex !== null && (
                      <div className="space-y-4 p-5 bg-neutral-50 rounded-[32px] border border-neutral-100">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest flex items-center gap-2">
                            <RotateCcw size={14} />
                            Yön Ayarla
                          </label>
                          <span className="text-xs font-bold text-indigo-600">
                            {annotatingItem.arrows[selectedArrowIndex].rotation || 0}°
                          </span>
                        </div>
                        <input 
                          type="range"
                          min="0"
                          max="360"
                          value={annotatingItem.arrows[selectedArrowIndex].rotation || 0}
                          onChange={(e) => {
                            const rotation = parseInt(e.target.value);
                            setAnnotatingItem(prev => {
                              if (!prev) return null;
                              const arrows = [...(prev.arrows || [])];
                              arrows[selectedArrowIndex] = { ...arrows[selectedArrowIndex], rotation };
                              return { ...prev, arrows };
                            });
                          }}
                          className="w-full h-2 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                        />
                        <button 
                          onClick={() => {
                            setAnnotatingItem(prev => {
                              if (!prev) return null;
                              const arrows = (prev.arrows || []).filter((_, i) => i !== selectedArrowIndex);
                              setSelectedArrowIndex(null);
                              return { ...prev, arrows };
                            });
                          }}
                          className="w-full py-2 text-xs font-bold text-red-500 hover:bg-red-50 rounded-xl transition-colors flex items-center justify-center gap-2"
                        >
                          <Trash2 size={14} />
                          Seçili Oku Sil
                        </button>
                      </div>
                    )}

                    {/* Instructions */}
                    <div className="bg-indigo-50 p-4 rounded-2xl space-y-2">
                      <p className="text-xs font-bold text-indigo-600 uppercase tracking-wider">Nasıl Kullanılır?</p>
                      <ul className="text-[11px] text-indigo-900/70 space-y-1.5 font-medium">
                        <li className="flex gap-2">
                          <span className="w-4 h-4 rounded-full bg-indigo-100 flex items-center justify-center text-[10px] shrink-0">1</span>
                          Bir renk seçin.
                        </li>
                        <li className="flex gap-2">
                          <span className="w-4 h-4 rounded-full bg-indigo-100 flex items-center justify-center text-[10px] shrink-0">2</span>
                          Görsel üzerinde işaretlemek istediğiniz yere tıklayın.
                        </li>
                        <li className="flex gap-2">
                          <span className="w-4 h-4 rounded-full bg-indigo-100 flex items-center justify-center text-[10px] shrink-0">3</span>
                          Okları basılı tutarak sürükleyip taşıyabilirsiniz.
                        </li>
                        <li className="flex gap-2">
                          <span className="w-4 h-4 rounded-full bg-indigo-100 flex items-center justify-center text-[10px] shrink-0">4</span>
                          Seçili okun yönünü ve rengini ayarlayın.
                        </li>
                        <li className="flex gap-2">
                          <span className="w-4 h-4 rounded-full bg-indigo-100 flex items-center justify-center text-[10px] shrink-0">5</span>
                          Kaldırmak için oku seçip "Sil" butonuna basın.
                        </li>
                      </ul>
                    </div>

                    {/* Action Buttons */}
                    <div className="mt-auto flex flex-col gap-3">
                      <button 
                        onClick={saveAnnotations}
                        className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 flex items-center justify-center gap-2"
                      >
                        <Check size={20} />
                        Değişiklikleri Kaydet
                      </button>
                      <button 
                        onClick={() => {
                          setAnnotatingItem(null);
                          setSelectedArrowIndex(null);
                        }}
                        className="w-full py-4 bg-neutral-100 text-neutral-600 rounded-2xl font-bold hover:bg-neutral-200 transition-all"
                      >
                        İptal
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Camera Modal */}
          {showCameraModal && (
            <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-neutral-900/90 backdrop-blur-md"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="relative bg-black w-full max-w-2xl aspect-[3/4] sm:aspect-video rounded-[32px] overflow-hidden shadow-2xl flex flex-col"
              >
                <video 
                  ref={videoRef} 
                  autoPlay 
                  playsInline 
                  className="w-full h-full object-cover"
                />
                <canvas ref={canvasRef} className="hidden" />
                
                <div className="absolute bottom-8 left-0 right-0 flex items-center justify-center gap-8">
                  <button 
                    onClick={stopCamera}
                    className="w-14 h-14 bg-white/20 backdrop-blur-md text-white rounded-full flex items-center justify-center hover:bg-white/30 transition-colors cursor-pointer"
                  >
                    <X size={24} />
                  </button>
                  
                  <button 
                    onClick={capturePhoto}
                    className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-xl hover:scale-110 active:scale-95 transition-all"
                  >
                    <div className="w-16 h-16 border-4 border-neutral-900 rounded-full" />
                  </button>
                  
                  <div className="w-14 flex items-center justify-center text-white font-bold text-xs uppercase tracking-widest">
                    FOTO
                  </div>
                </div>
              </motion.div>
            </div>
          )}

          {/* Pattern Setup Modal */}
          {showPatternSetup && (
            <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-neutral-900/80 backdrop-blur-md"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="relative bg-white w-full max-w-md rounded-[48px] p-8 shadow-2xl flex flex-col items-center gap-8"
              >
                <div className="absolute top-8 right-8">
                  <button 
                    onClick={() => setShowPatternSetup(false)} 
                    className="p-3 bg-neutral-100 text-neutral-500 rounded-2xl hover:bg-neutral-200 transition-colors cursor-pointer"
                  >
                    <X size={24} />
                  </button>
                </div>

                <div className="flex flex-col items-center text-center gap-2">
                  <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-3xl flex items-center justify-center mb-2">
                    <Palette size={32} />
                  </div>
                  <h2 className="text-2xl font-bold">Desen Oluştur</h2>
                  <p className="text-neutral-500 text-sm">
                    {setupStep === 0 ? '1. Deseni ve rengini belirleyin' : 
                     setupStep === 1 ? '2. Deseni ve rengini belirleyin' : '3. Deseni ve rengini belirleyin'}
                  </p>
                </div>

                <div className="flex flex-col items-center gap-6">
                  <div className="flex gap-2">
                    {[0, 1, 2].map(i => (
                      <div 
                        key={i} 
                        className={cn(
                          "w-3 h-3 rounded-full transition-all duration-300",
                          i < setupStep ? "bg-indigo-600 scale-110" : 
                          i === setupStep ? "bg-indigo-200 animate-pulse" : "bg-neutral-100"
                        )}
                      />
                    ))}
                  </div>

                  <div className="p-4 bg-neutral-50 rounded-[32px] border border-neutral-100">
                    <PatternLock 
                      color={selectedColor} 
                      onComplete={handleSetupPatternComplete} 
                      size={320}
                      completedPatterns={setupPatterns}
                    />
                  </div>

                  <div className="w-full space-y-4">
                    <div className="flex items-center justify-between px-2">
                      <span className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Renk Seçimi</span>
                      <div className="flex gap-1.5">
                        {colors.map(c => (
                          <button
                            key={c}
                            onClick={() => setSelectedColor(c)}
                            className={cn(
                              "w-6 h-6 rounded-full border-2 transition-all",
                              selectedColor === c ? "border-indigo-600 scale-110" : "border-transparent"
                            )}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="w-full pt-4 border-t border-neutral-100 flex flex-col gap-3">
                  <button 
                    onClick={() => {
                      setSetupPatterns([]);
                      setSetupStep(0);
                    }}
                    className="flex items-center justify-center gap-2 text-neutral-400 hover:text-neutral-600 transition-colors py-2"
                  >
                    <RotateCcw size={16} />
                    <span className="text-xs font-bold uppercase tracking-widest">Sıfırla</span>
                  </button>

                  <button 
                    onClick={() => {
                      setSetupPatterns([]);
                      setSetupStep(0);
                      setShowPatternSetup(false);
                    }}
                    className="w-full py-4 text-neutral-500 font-bold text-sm hover:bg-neutral-50 rounded-2xl transition-colors"
                  >
                    Vazgeç
                  </button>
                </div>
              </motion.div>
            </div>
          )}

          {/* Full Image Modal */}
          <AnimatePresence>
            {selectedImage && (
              <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setSelectedImage(null)}
                  className="absolute inset-0 bg-neutral-900/95 backdrop-blur-md"
                />
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="relative max-w-5xl w-full max-h-[90vh] flex flex-col items-center justify-center"
                >
                  <div className="absolute -top-14 right-0 flex gap-2">
                    <a 
                      href={selectedImage.url} 
                      download="image.png"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-10 h-10 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center transition-colors backdrop-blur-sm"
                      title="İndir"
                    >
                      <Download size={20} />
                    </a>
                    <button 
                      onClick={() => setSelectedImage(null)}
                      className="w-10 h-10 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center transition-colors backdrop-blur-sm cursor-pointer"
                      title="Kapat"
                    >
                      <X size={24} />
                    </button>
                  </div>
                  <ImageWithArrows 
                    src={selectedImage.url} 
                    alt="Full view" 
                    arrows={selectedImage.arrows}
                    className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl"
                  />
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          {/* Tutorial Modal */}
          {showTutorialModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowTutorialModal(false)}
                className="absolute inset-0 bg-neutral-900/60 backdrop-blur-sm"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="relative bg-white w-full max-w-4xl max-h-[90vh] rounded-[40px] shadow-2xl overflow-hidden flex flex-col"
              >
                <div className="p-8 border-b border-neutral-100 flex items-center justify-between bg-white sticky top-0 z-10">
                  <div>
                    <h2 className="text-2xl font-bold text-neutral-900">
                      {selectedTutorial ? 'Kartı Düzenle' : 'Yeni Nasıl Yapılır Kartı'}
                    </h2>
                    <p className="text-neutral-500 text-sm font-medium mt-1">İnfografik ve öğrenme adımları oluşturun</p>
                  </div>
                  <button 
                    onClick={() => setShowTutorialModal(false)} 
                    className="p-3 bg-neutral-100 text-neutral-500 rounded-2xl hover:bg-neutral-200 transition-colors cursor-pointer relative z-20"
                  >
                    <X size={24} />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-8 space-y-8">
                  {/* Category Selection */}
                  <div className="space-y-3">
                    <label className="text-sm font-bold text-neutral-700 ml-1">Kategori</label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <button
                        type="button"
                        onClick={() => setTutorialForm(prev => ({ ...prev, categoryId: '' }))}
                        className={cn(
                          "px-4 py-3 rounded-2xl text-xs font-bold border transition-all",
                          tutorialForm.categoryId === ''
                            ? "bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-100"
                            : "bg-neutral-50 text-neutral-500 border-neutral-200 hover:bg-neutral-100"
                        )}
                      >
                        Kategorisiz
                      </button>
                      {categories.map(cat => (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => setTutorialForm(prev => ({ ...prev, categoryId: cat.id }))}
                          className={cn(
                            "px-4 py-3 rounded-2xl text-xs font-bold border transition-all truncate",
                            tutorialForm.categoryId === cat.id
                              ? "bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-100"
                              : "bg-neutral-50 text-neutral-500 border-neutral-200 hover:bg-neutral-100"
                          )}
                        >
                          {cat.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Title Input */}
                  <div className="space-y-3">
                    <label className="text-sm font-bold text-neutral-700 ml-1">Kart Başlığı</label>
                    <input 
                      type="text" 
                      placeholder="Örn: Paketleme Makinesi Nasıl Çalıştırılır?" 
                      className="w-full px-6 py-4 bg-neutral-50 border border-neutral-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-lg"
                      value={tutorialForm.title}
                      onChange={(e) => setTutorialForm(prev => ({ ...prev, title: e.target.value }))}
                    />
                  </div>

                  {/* Steps List */}
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-lg text-neutral-900 flex items-center gap-2">
                        <BookOpen size={20} className="text-indigo-600" />
                        Adımlar ({tutorialForm.steps.length})
                      </h3>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => { setCameraTarget('tutorial'); fileInputRef.current?.click(); }}
                          className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-xs font-bold hover:bg-indigo-100 transition-colors"
                        >
                          <ImageIcon size={16} />
                          Galeri
                        </button>
                        <button 
                          onClick={() => { setCameraTarget('tutorial'); startCamera(); }}
                          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-100"
                        >
                          <Camera size={16} />
                          Kamera
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-8">
                      {tutorialForm.steps.map((step, index) => (
                        <motion.div 
                          layout
                          key={step.id}
                          className="bg-neutral-50 rounded-[32px] p-6 border border-neutral-200 relative group"
                        >
                          <button 
                            onClick={() => removeTutorialStep(step.id)}
                            className="absolute -top-2 -right-2 w-8 h-8 bg-white text-red-500 rounded-full shadow-md flex items-center justify-center hover:bg-red-50 transition-colors z-10"
                          >
                            <Trash2 size={16} />
                          </button>

                          <div className="grid grid-cols-1 gap-6">
                            {/* Image with Arrow Selector */}
                            <div className="space-y-3">
                              <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider ml-1">
                                {index + 1}. Adım Görseli (Ok konumunu seçmek için tıklayın)
                              </label>
                              <div className="relative">
                                <ImageWithArrows 
                                  src={step.imageUrl} 
                                  alt="Step" 
                                  arrows={step.arrows}
                                  className="aspect-video rounded-2xl overflow-hidden bg-white border border-neutral-200 shadow-inner cursor-crosshair"
                                  onCanvasClick={(e) => {
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    const x = ((e.clientX - rect.left) / rect.width) * 100;
                                    const y = ((e.clientY - rect.top) / rect.height) * 100;
                                    updateStepArrow(step.id, x, y);
                                  }}
                                />
                              </div>
                            </div>

                            {/* Note Input */}
                            <div className="space-y-3 flex flex-col">
                              <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider ml-1">Adım Başlığı</label>
                              <input 
                                type="text"
                                placeholder="Örn: Ölçüm Analizi" 
                                className="w-full px-6 py-4 bg-white border border-neutral-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-bold"
                                value={step.title}
                                onChange={(e) => updateStepTitle(step.id, e.target.value)}
                              />
                              <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider ml-1 mt-2">Bilgi / Not</label>
                              <textarea 
                                placeholder="Bu adımda ne yapılması gerektiğini yazın..." 
                                className="flex-1 w-full px-6 py-4 bg-white border border-neutral-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none resize-none text-sm font-medium leading-relaxed"
                                value={step.note}
                                onChange={(e) => updateStepNote(step.id, e.target.value)}
                              />
                            </div>
                          </div>
                        </motion.div>
                      ))}

                      {tutorialForm.steps.length === 0 ? (
                        <div className="py-12 border-2 border-dashed border-neutral-200 rounded-[32px] flex flex-col items-center justify-center text-neutral-400 gap-3">
                          <ImageIcon size={48} strokeWidth={1} />
                          <p className="text-sm font-medium italic">Henüz adım eklenmedi. Görsel ekleyerek başlayın.</p>
                        </div>
                      ) : (
                        <div className="flex justify-center gap-4 pt-4">
                          <button 
                            onClick={() => { setCameraTarget('tutorial'); fileInputRef.current?.click(); }}
                            className="flex items-center gap-2 px-6 py-4 bg-white border-2 border-dashed border-neutral-200 text-neutral-500 rounded-2xl text-sm font-bold hover:border-indigo-300 hover:text-indigo-600 transition-all group"
                          >
                            <ImageIcon size={20} className="group-hover:scale-110 transition-transform" />
                            Galeri
                          </button>
                          <button 
                            onClick={() => { setCameraTarget('tutorial'); startCamera(); }}
                            className="flex items-center gap-2 px-6 py-4 bg-white border-2 border-dashed border-neutral-200 text-neutral-500 rounded-2xl text-sm font-bold hover:border-emerald-300 hover:text-emerald-600 transition-all group"
                          >
                            <Camera size={20} className="group-hover:scale-110 transition-transform" />
                            Kamera
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="p-8 border-t border-neutral-100 bg-neutral-50 flex gap-4">
                  <button 
                    onClick={() => setShowTutorialModal(false)}
                    className="flex-1 py-4 bg-white text-neutral-600 rounded-2xl font-bold border border-neutral-200 hover:bg-neutral-100 transition-colors"
                  >
                    İptal
                  </button>
                  <button 
                    onClick={handleSaveTutorial}
                    disabled={isUploading}
                    className="flex-[2] py-4 bg-indigo-600 text-white rounded-2xl font-bold shadow-xl shadow-indigo-100 hover:bg-indigo-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                  >
                    {isUploading ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                    {selectedTutorial ? 'Değişiklikleri Kaydet' : 'Kartı Oluştur'}
                  </button>
                </div>
              </motion.div>
            </div>
          )}

          {/* Admin Modal */}
          {showAdminModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowAdminModal(false)}
                className="absolute inset-0 bg-neutral-900/60 backdrop-blur-sm"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="relative bg-white w-full max-w-sm rounded-[32px] p-8 shadow-2xl"
              >
                <div className="flex flex-col items-center text-center gap-4">
                  <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center">
                    <Lock size={32} />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">Yönetici Girişi</h2>
                    <p className="text-neutral-500 text-sm mt-1">Lütfen erişim kimliğinizi girin.</p>
                  </div>
                  <input 
                    type="password" 
                    placeholder="ID Giriniz" 
                    className="w-full px-6 py-4 bg-neutral-100 border-none rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none text-center text-xl font-bold tracking-widest"
                    value={adminId}
                    onChange={(e) => setAdminId(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAdminLogin()}
                  />
                  <button 
                    onClick={handleAdminLogin}
                    className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-colors"
                  >
                    Giriş Yap
                  </button>
                </div>
              </motion.div>
            </div>
          )}

          {/* Add Category Modal */}
          {showAddCategoryModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowAddCategoryModal(false)}
                className="absolute inset-0 bg-neutral-900/60 backdrop-blur-sm"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="relative bg-white w-full max-w-sm rounded-[32px] p-8 shadow-2xl"
              >
                <div className="flex flex-col gap-6">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-bold">Yeni Kategori</h2>
                    <button 
                      onClick={() => setShowAddCategoryModal(false)} 
                      className="p-2 bg-neutral-100 text-neutral-500 rounded-xl hover:bg-neutral-200 transition-colors cursor-pointer"
                    >
                      <X size={20} />
                    </button>
                  </div>
                  <input 
                    type="text" 
                    placeholder="Kategori Adı" 
                    className="w-full px-6 py-4 bg-neutral-100 border-none rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                  />
                  <button 
                    onClick={handleAddCategory}
                    className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold shadow-lg shadow-indigo-200"
                  >
                    Kategori Oluştur
                  </button>
                </div>
              </motion.div>
            </div>
          )}

          {/* Edit Category Modal */}
          {showEditCategoryModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowEditCategoryModal(false)}
                className="absolute inset-0 bg-neutral-900/60 backdrop-blur-sm"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="relative bg-white w-full max-w-sm rounded-[32px] p-8 shadow-2xl"
              >
                <div className="flex flex-col gap-6">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-bold">Kategoriyi Düzenle</h2>
                    <button 
                      onClick={() => setShowEditCategoryModal(false)} 
                      className="p-2 bg-neutral-100 text-neutral-500 rounded-xl hover:bg-neutral-200 transition-colors cursor-pointer"
                    >
                      <X size={20} />
                    </button>
                  </div>
                  <input 
                    type="text" 
                    placeholder="Kategori Adı" 
                    className="w-full px-6 py-4 bg-neutral-100 border-none rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                  />
                  <button 
                    onClick={handleUpdateCategory}
                    className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold shadow-lg shadow-indigo-200"
                  >
                    Güncelle
                  </button>
                </div>
              </motion.div>
            </div>
          )}

          {/* Confirmation Modal */}
          {confirmModal.show && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setConfirmModal(prev => ({ ...prev, show: false }))}
                className="absolute inset-0 bg-neutral-900/60 backdrop-blur-sm"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="relative bg-white w-full max-w-sm rounded-[32px] p-8 shadow-2xl text-center"
              >
                <div className="w-16 h-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Trash2 size={32} />
                </div>
                <h2 className="text-xl font-bold mb-2">{confirmModal.title}</h2>
                <p className="text-neutral-500 text-sm mb-6">{confirmModal.message}</p>
                <div className="flex gap-3">
                  <button 
                    onClick={() => setConfirmModal(prev => ({ ...prev, show: false }))}
                    className="flex-1 py-3 bg-neutral-100 text-neutral-600 rounded-xl font-bold"
                  >
                    Vazgeç
                  </button>
                  <button 
                    onClick={confirmModal.onConfirm}
                    className="flex-1 py-3 bg-red-500 text-white rounded-xl font-bold shadow-lg shadow-red-100"
                  >
                    Evet, Sil
                  </button>
                </div>
              </motion.div>
            </div>
          )}

          {/* Alert Modal */}
          {alertModal.show && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setAlertModal(prev => ({ ...prev, show: false }))}
                className="absolute inset-0 bg-neutral-900/60 backdrop-blur-sm"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="relative bg-white w-full max-w-sm rounded-[32px] p-8 shadow-2xl text-center"
              >
                <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <button 
                    onClick={() => setAlertModal(prev => ({ ...prev, show: false }))}
                    className="w-full h-full flex items-center justify-center cursor-pointer"
                  >
                    <X size={32} />
                  </button>
                </div>
                <h2 className="text-xl font-bold mb-2">{alertModal.title}</h2>
                <p className="text-neutral-500 text-sm mb-6">{alertModal.message}</p>
                <button 
                  onClick={() => setAlertModal(prev => ({ ...prev, show: false }))}
                  className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold"
                >
                  Tamam
                </button>
              </motion.div>
            </div>
          )}

          {/* Add/Edit Term Modal */}
        {showAddTermModal && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isUploading && setShowAddTermModal(false)}
              className="absolute inset-0 bg-neutral-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="relative bg-white w-full max-w-lg rounded-t-[40px] sm:rounded-[40px] p-6 sm:p-8 shadow-2xl overflow-y-auto max-h-[90vh]"
            >
              <div className="flex flex-col gap-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold">{editingTerm ? 'Terimi Düzenle' : 'Yeni Terim Ekle'}</h2>
                  <button 
                    onClick={() => !isUploading && setShowAddTermModal(false)} 
                    className="p-3 bg-neutral-100 text-neutral-500 rounded-2xl hover:bg-neutral-200 transition-colors cursor-pointer"
                  >
                    <X size={24} />
                  </button>
                </div>

                {/* Media Upload Area */}
                <div className="space-y-4">
                  <div 
                    onClick={() => {
                      if (!isUploading) {
                        setCameraTarget('term');
                        fileInputRef.current?.click();
                      }
                    }}
                    className={cn(
                      "w-full aspect-square sm:aspect-video bg-neutral-50 rounded-3xl border-2 border-dashed border-neutral-200 flex flex-col items-center justify-center gap-2 cursor-pointer overflow-hidden relative group transition-all",
                      isUploading && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    {newTerm.imagePreview ? (
                      <div className="relative w-full h-full group">
                        <img src={newTerm.imagePreview} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setSelectedImage({ url: newTerm.imagePreview, arrows: [] }); }}
                            className="w-10 h-10 bg-white/20 hover:bg-white/30 text-white rounded-full flex items-center justify-center backdrop-blur-sm transition-colors"
                            title="Büyüt"
                          >
                            <Maximize2 size={20} />
                          </button>
                          {!isUploading && (
                            <button
                              type="button"
                              onClick={(e) => { 
                                e.stopPropagation(); 
                                setCameraTarget('term');
                                fileInputRef.current?.click(); 
                              }}
                              className="w-10 h-10 bg-white/20 hover:bg-white/30 text-white rounded-full flex items-center justify-center backdrop-blur-sm transition-colors"
                              title="Değiştir"
                            >
                              <ImageIcon size={20} />
                            </button>
                          )}
                        </div>
                        {!isUploading && (
                          <button 
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setNewTerm(prev => ({ ...prev, image: null, imagePreview: '' })); }}
                            className="absolute top-2 right-2 w-8 h-8 bg-black/60 text-white rounded-full flex items-center justify-center hover:bg-black/80 transition-colors z-10 cursor-pointer"
                          >
                            <X size={16} />
                          </button>
                        )}
                      </div>
                    ) : (
                      <>
                        <ImageIcon size={24} className="text-neutral-300" />
                        <span className="text-[10px] font-bold text-neutral-400">Görsel Seç</span>
                      </>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => startCamera()}
                    disabled={isUploading}
                    className="w-full py-4 bg-indigo-50 text-indigo-600 rounded-2xl border border-indigo-100 flex items-center justify-center gap-2 hover:bg-indigo-100 transition-colors disabled:opacity-50 font-bold text-sm"
                  >
                    <Camera size={20} />
                    Fotoğraf Çek
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest ml-1">Kategori</label>
                    <select 
                      className="w-full px-6 py-4 bg-neutral-100 border-none rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none appearance-none font-medium"
                      value={newTerm.categoryId}
                      onChange={(e) => setNewTerm(prev => ({ ...prev, categoryId: e.target.value }))}
                    >
                      <option value="">Kategori Seçin</option>
                      {categories.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest ml-1">Başlık</label>
                    <input 
                      type="text" 
                      placeholder="Parça veya Terim Adı" 
                      className="w-full px-6 py-4 bg-neutral-100 border-none rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none font-medium"
                      value={newTerm.title}
                      onChange={(e) => setNewTerm(prev => ({ ...prev, title: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest ml-1">Açıklama</label>
                    <textarea 
                      placeholder="Terim hakkında detaylı bilgi..." 
                      rows={4}
                      className="w-full px-6 py-4 bg-neutral-100 border-none rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none font-medium resize-none"
                      value={newTerm.description}
                      onChange={(e) => setNewTerm(prev => ({ ...prev, description: e.target.value }))}
                    />
                  </div>
                </div>

                <button 
                  type="button"
                  disabled={isUploading}
                  onClick={handleSaveTerm}
                  className="w-full bg-indigo-600 text-white py-5 rounded-2xl font-bold shadow-xl shadow-indigo-200 flex items-center justify-center gap-2 disabled:opacity-70"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="animate-spin" />
                      {uploadProgress > 0 && uploadProgress < 100 
                        ? `Yükleniyor %${Math.round(uploadProgress)}` 
                        : 'Kaydediliyor...'}
                    </>
                  ) : (
                    <>
                      <Save size={20} />
                      {editingTerm ? 'Güncelle' : 'Kaydet'}
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}

      {/* Custom Scrollbar CSS */}
      <style>{`
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
      <input 
        type="file" 
        accept="image/*" 
        className="hidden" 
        ref={fileInputRef}
        onChange={handleImageChange}
        multiple={cameraTarget === 'tutorial'}
      />
      </div>
    </ErrorBoundary>
  );
}
