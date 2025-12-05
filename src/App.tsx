import React, { useState, useEffect, useMemo, useRef } from 'react';
// Firebase SDK
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signOut
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  onSnapshot, 
  deleteDoc, 
  doc, 
  serverTimestamp,
  updateDoc,
  writeBatch,
  getDocs
} from 'firebase/firestore';
// Lucide Icons
import { 
  Plus, 
  Trash2, 
  List, 
  CreditCard, 
  Save,
  Settings,
  LayoutDashboard,
  Tag,
  ChevronLeft,
  ChevronRight,
  Heart,
  Camera,
  Store,
  Sparkles,
  Loader2,
  Key,
  CheckCircle2,
  XCircle,
  LogOut
} from 'lucide-react';

// --- Firebase Configuration ---
// 環境変数から読み込み
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// 初期化チェック
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// このアプリ専用のID
const APP_ID = 'moneyflow-v1'; 

// --- Types ---
type Transaction = {
  id: string;
  amount: number;
  categoryId: string;
  itemName: string;
  store?: string;
  note: string;
  date: string;
  type: 'expense' | 'income';
  timestamp?: any;
};

type ScannedItem = {
  name: string;
  price: number;
  category: string;
};

type Category = {
  id: string;
  docId?: string; // ★修正: 本当のドキュメントID用
  name: string;
  icon: string;
  color: string;
  budget: number;
  order: number;
};

type ViewMode = 'month' | 'year';

// --- Constants ---
const DEFAULT_CATEGORIES_DATA = [
  { id: 'food', name: '食費', icon: '🍰', color: 'bg-orange-100 text-orange-600', budget: 40000 },
  { id: 'daily', name: '日用品', icon: '🎀', color: 'bg-blue-100 text-blue-600', budget: 10000 },
  { id: 'transport', name: '交通費', icon: '👠', color: 'bg-green-100 text-green-600', budget: 15000 },
  { id: 'social', name: '交際費', icon: '🥂', color: 'bg-pink-100 text-pink-600', budget: 20000 },
  { id: 'hobby', name: '趣味', icon: '💄', color: 'bg-purple-100 text-purple-600', budget: 10000 },
  { id: 'housing', name: '固定費', icon: '🏠', color: 'bg-gray-100 text-gray-600', budget: 80000 },
];

const COLORS = [
  { bg: 'bg-rose-100', text: 'text-rose-600', name: 'Rose' },
  { bg: 'bg-pink-100', text: 'text-pink-600', name: 'Pink' },
  { bg: 'bg-orange-100', text: 'text-orange-600', name: 'Orange' },
  { bg: 'bg-amber-100', text: 'text-amber-600', name: 'Amber' },
  { bg: 'bg-emerald-100', text: 'text-emerald-600', name: 'Emerald' },
  { bg: 'bg-teal-100', text: 'text-teal-600', name: 'Teal' },
  { bg: 'bg-sky-100', text: 'text-sky-600', name: 'Sky' },
  { bg: 'bg-indigo-100', text: 'text-indigo-600', name: 'Indigo' },
  { bg: 'bg-violet-100', text: 'text-violet-600', name: 'Violet' },
  { bg: 'bg-gray-100', text: 'text-gray-600', name: 'Gray' },
];

// --- Components ---

const RibbonIcon = ({ className = "w-6 h-6" }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} xmlns="http://www.w3.org/2000/svg">
    <path d="M12 14.5C14.5 14.5 16.5 12.5 16.5 10C16.5 7.5 14.5 5.5 12 5.5C9.5 5.5 7.5 7.5 7.5 10C7.5 12.5 9.5 14.5 12 14.5Z" opacity="0.4"/>
    <path d="M12 14.5C10.5 14.5 6 12 5 9C4 6.5 6 4 7 4C8 4 10 6 12 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    <path d="M12 14.5C13.5 14.5 18 12 19 9C20 6.5 18 4 17 4C16 4 14 6 12 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    <path d="M12 14.5L15 21L12 18.5L9 21L12 14.5Z" fill="currentColor"/>
  </svg>
);

const ProgressBar = ({ current, max, colorClass, compact = false }: { current: number, max: number, colorClass: string, compact?: boolean }) => {
  const percentage = max > 0 ? Math.min(100, Math.max(0, (current / max) * 100)) : 0;
  return (
    <div className={`w-full bg-pink-50 rounded-full overflow-hidden border border-pink-100 ${compact ? 'h-2' : 'h-4'}`}>
      <div 
        className={`h-full transition-all duration-500 ease-out ${colorClass}`} 
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
};

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(amount);
};

// --- Main App Component ---
export default function App() {
  const [user, setUser] = useState<any>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'list' | 'add' | 'settings'>('dashboard');
  
  const [viewDate, setViewDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('month');

  const [amount, setAmount] = useState('');
  const [itemName, setItemName] = useState('');
  const [storeName, setStoreName] = useState('');
  const [note, setNote] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  // AI & Settings State
  // 優先順位: 環境変数 > LocalStorage > 空文字
  const [apiKey, setApiKey] = useState(
    import.meta.env.VITE_GEMINI_API_KEY || 
    localStorage.getItem('moneyflow_gemini_key') || 
    ''
  );
  
  const [isScanning, setIsScanning] = useState(false);
  const [scannedItems, setScannedItems] = useState<ScannedItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editingCategory, setEditingCategory] = useState<Partial<Category> | null>(null);

  // Auth: Google Login or Anonymous
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        setLoading(false);
      } else {
        signInAnonymously(auth).catch((err) => console.error("Auth Error", err));
      }
    });
    return () => unsubscribe();
  }, []);

  // Initialize Categories
  const initializeCategories = async (userId: string) => {
    const catsRef = collection(db, 'artifacts', APP_ID, 'users', userId, 'categories');
    const snapshot = await getDocs(catsRef);
    if (snapshot.empty) {
      const batch = writeBatch(db);
      DEFAULT_CATEGORIES_DATA.forEach((cat, index) => {
        const docRef = doc(catsRef);
        batch.set(docRef, { ...cat, order: index });
      });
      await batch.commit();
    }
  };

  // Data Fetching
  useEffect(() => {
    if (!user) return;

    const catQuery = collection(db, 'artifacts', APP_ID, 'users', user.uid, 'categories');
    const unsubCats = onSnapshot(catQuery, (snapshot) => {
      // ★修正: docIdを追加して、本当のドキュメントIDを保持する
      const cats = snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data(), 
        docId: doc.id // ここで保存
      } as Category));

      if (cats.length === 0) {
        initializeCategories(user.uid);
      } else {
        cats.sort((a, b) => a.order - b.order);
        setCategories(cats);
        if (!selectedCategoryId && cats.length > 0) setSelectedCategoryId(cats[0].id);
      }
    }, (error) => console.error("Cat Error:", error));

    const transQuery = collection(db, 'artifacts', APP_ID, 'users', user.uid, 'transactions');
    const unsubTrans = onSnapshot(transQuery, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction));
      data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setTransactions(data);
      setLoading(false);
    }, (error) => console.error("Trans Error:", error));

    return () => {
      unsubCats();
      unsubTrans();
    };
  }, [user]);

  // Google Login Handler
  const handleGoogleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed", error);
      alert("ログインに失敗しました");
    }
  };

  // --- Scan Functionality ---
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!apiKey) {
      alert("設定画面でGemini APIキーを設定してください。\n(設定 > API Key)");
      return;
    }

    setIsScanning(true);

    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64String = (reader.result as string).split(',')[1];
        
        const promptText = `このレシート画像を解析して、明細ごとのリストを以下のJSON形式で返してください。
店名と日付は全体で共通です。
カテゴリ(category)は、品名から推測して以下のIDのいずれかを割り当ててください: 'food'(食費), 'daily'(日用品), 'transport'(交通費), 'social'(交際費), 'hobby'(趣味), 'housing'(固定費)。わからない場合は'food'にしてください。

\`\`\`json
{ 
  "store": "店名", 
  "date": "YYYY-MM-DD", 
  "items": [
    { "name": "商品A", "price": 100, "category": "food" },
    { "name": "商品B", "price": 200, "category": "daily" }
  ] 
}
\`\`\`
余計な説明は不要です。`;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: promptText },
                { inlineData: { mimeType: file.type, data: base64String } }
              ]
            }]
          })
        });

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (text) {
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const result = JSON.parse(jsonMatch[0]);
            if (result.date) setDate(result.date);
            if (result.store) setStoreName(result.store);
            if (result.items && Array.isArray(result.items)) {
               setScannedItems(result.items);
            }
          }
        }
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error("Scan error:", error);
      alert("読み取りに失敗しました。");
    } finally {
      setIsScanning(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleBatchSave = async () => {
    if (!user || scannedItems.length === 0) return;
    try {
        const batch = writeBatch(db);
        scannedItems.forEach(item => {
            const docRef = doc(collection(db, 'artifacts', APP_ID, 'users', user.uid, 'transactions'));
            batch.set(docRef, {
                amount: Number(item.price),
                categoryId: item.category || 'food',
                itemName: item.name,
                store: storeName,
                note: '',
                date: date,
                type: 'expense',
                timestamp: serverTimestamp()
            });
        });
        await batch.commit();
        setScannedItems([]);
        setStoreName('');
        setActiveTab('list');
    } catch (error) {
        console.error("Batch save error:", error);
        alert("保存中にエラーが発生しました");
    }
  };

  const saveApiKey = () => {
    localStorage.setItem('moneyflow_gemini_key', apiKey);
    alert('APIキーを保存しました！');
  };

  // Date Handlers
  const shiftDate = (delta: number) => {
    const newDate = new Date(viewDate);
    if (viewMode === 'month') {
      newDate.setMonth(newDate.getMonth() + delta);
    } else {
      newDate.setFullYear(newDate.getFullYear() + delta);
    }
    setViewDate(newDate);
  };

  const getPeriodLabel = () => {
    if (viewMode === 'month') {
      return `${viewDate.getFullYear()}年 ${viewDate.getMonth() + 1}月`;
    }
    return `${viewDate.getFullYear()}年`;
  };

  // Handlers
  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !user || !selectedCategoryId) return;
    const cleanAmount = amount.replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));
    const parsedAmount = parseInt(cleanAmount);
    if (isNaN(parsedAmount)) return;

    try {
      await addDoc(collection(db, 'artifacts', APP_ID, 'users', user.uid, 'transactions'), {
        amount: parsedAmount,
        categoryId: selectedCategoryId,
        itemName: itemName,
        store: storeName,
        note: note,
        date: date,
        type: 'expense',
        timestamp: serverTimestamp()
      });
      setAmount('');
      setItemName('');
      setStoreName('');
      setNote('');
      if (window.innerWidth < 768) {
        setActiveTab('dashboard');
      }
    } catch (error) {
      console.error("Error adding transaction:", error);
    }
  };

  const handleDeleteTransaction = async (id: string) => {
    if (!user || !window.confirm('この履歴を削除しますか？')) return;
    try {
      await deleteDoc(doc(db, 'artifacts', APP_ID, 'users', user.uid, 'transactions', id));
    } catch (error) { console.error(error); }
  };

  const handleSaveCategory = async () => {
    if (!user || !editingCategory?.name) return;
    const catData = {
      name: editingCategory.name,
      icon: editingCategory.icon || '📦',
      color: editingCategory.color || COLORS[5].bg + ' ' + COLORS[5].text,
      budget: Number(editingCategory.budget) || 0,
      order: editingCategory.order ?? categories.length
    };
    try {
      // ★修正: docId または id を使用して更新対象を特定
      const targetId = editingCategory.docId || editingCategory.id;
      
      if (targetId) {
        // 既存のカテゴリ更新
        await updateDoc(doc(db, 'artifacts', APP_ID, 'users', user.uid, 'categories', targetId), catData);
      } else {
        // 新規カテゴリ作成
        await addDoc(collection(db, 'artifacts', APP_ID, 'users', user.uid, 'categories'), catData);
      }
      setEditingCategory(null);
    } catch (error) { console.error(error); }
  };

  const handleDeleteCategory = async (id: string) => {
    if (!user || !window.confirm('カテゴリを削除しますか？')) return;
    try {
      await deleteDoc(doc(db, 'artifacts', APP_ID, 'users', user.uid, 'categories', id));
    } catch (error) { console.error(error); }
  };

  // Calculations
  const periodData = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth() + 1;
    const datePrefix = viewMode === 'month' ? `${year}-${String(month).padStart(2, '0')}` : `${year}`;
    const filteredTrans = transactions.filter(t => t.date.startsWith(datePrefix));
    const totalExpense = filteredTrans.reduce((sum, t) => sum + t.amount, 0);
    const multiplier = viewMode === 'year' ? 12 : 1;
    const totalBudget = categories.reduce((sum, c) => sum + (c.budget || 0), 0) * multiplier;
    const categoryStats = categories.map(cat => {
      const catTrans = filteredTrans.filter(t => t.categoryId === cat.id);
      const amount = catTrans.reduce((sum, t) => sum + t.amount, 0);
      return { ...cat, amount, adjustedBudget: (cat.budget || 0) * multiplier };
    });
    return { totalExpense, totalBudget, categoryStats, filteredTrans };
  }, [transactions, categories, viewDate, viewMode]);

  // ... (renderPeriodSelector, renderDashboardView, renderAddTransactionView, renderHistoryListView は変更なし)
  
  const renderPeriodSelector = () => (
    <div className="bg-white/80 backdrop-blur-sm px-4 py-3 border-b border-pink-100 flex items-center justify-between sticky top-0 z-10 shadow-sm">
      <div className="flex bg-pink-50 rounded-full p-1 border border-pink-100">
        <button onClick={() => setViewMode('month')} className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${viewMode === 'month' ? 'bg-white text-pink-500 shadow-sm' : 'text-pink-300 hover:text-pink-400'}`}>月</button>
        <button onClick={() => setViewMode('year')} className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${viewMode === 'year' ? 'bg-white text-pink-500 shadow-sm' : 'text-pink-300 hover:text-pink-400'}`}>年</button>
      </div>
      <div className="flex items-center gap-4 bg-white px-3 py-1 rounded-full border border-pink-100 shadow-sm">
        <button onClick={() => shiftDate(-1)} className="p-1 rounded-full hover:bg-pink-50 text-pink-400"><ChevronLeft className="w-5 h-5" /></button>
        <div className="text-sm font-bold text-gray-700 min-w-[6rem] text-center tracking-wide">{getPeriodLabel()}</div>
        <button onClick={() => shiftDate(1)} className="p-1 rounded-full hover:bg-pink-50 text-pink-400"><ChevronRight className="w-5 h-5" /></button>
      </div>
    </div>
  );

  const renderDashboardView = () => (
    <div className="space-y-6 animate-fade-in h-full flex flex-col">
      <div className="bg-white rounded-[24px] shadow-sm p-6 border border-pink-100 flex-shrink-0 relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
          <RibbonIcon className="w-24 h-24 text-pink-500 transform rotate-12" />
        </div>
        <div className="relative z-10">
          <div className="flex justify-between items-end mb-3">
            <span className="text-sm font-medium text-pink-400 tracking-wider flex items-center gap-1">
              <Heart className="w-3 h-3 fill-current" />
              {viewMode === 'month' ? '今月の残高' : '年間の残高'}
            </span>
            <span className={`text-4xl font-bold tracking-tight ${periodData.totalBudget - periodData.totalExpense < 0 ? 'text-rose-500' : 'text-gray-700'}`}>
              {formatCurrency(periodData.totalBudget - periodData.totalExpense)}
            </span>
          </div>
          <div className="space-y-3">
            <ProgressBar current={periodData.totalExpense} max={periodData.totalBudget} colorClass={periodData.totalExpense > periodData.totalBudget ? 'bg-rose-400' : 'bg-pink-400'} />
            <div className="flex justify-between text-xs text-gray-400 font-medium">
              <span className="bg-pink-50 px-2 py-1 rounded-lg text-pink-400">使用: {formatCurrency(periodData.totalExpense)}</span>
              <span className="bg-gray-50 px-2 py-1 rounded-lg">予算: {formatCurrency(periodData.totalBudget)}</span>
            </div>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0 space-y-3 pr-1">
        {periodData.categoryStats.map(cat => {
          const isOver = cat.adjustedBudget > 0 && cat.amount > cat.adjustedBudget;
          return (
            <div key={cat.id} className="bg-white p-4 rounded-2xl shadow-sm border border-pink-50">
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-3">
                  <span className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${cat.color}`}>{cat.icon}</span>
                  <span className="text-sm font-bold text-gray-700">{cat.name}</span>
                </div>
                <div className="text-right">
                  <span className={`text-sm font-bold block ${isOver ? 'text-rose-500' : 'text-gray-700'}`}>{formatCurrency(cat.amount)}</span>
                  <span className="text-[10px] text-gray-400">/ {formatCurrency(cat.adjustedBudget)}</span>
                </div>
              </div>
              <ProgressBar current={cat.amount} max={cat.adjustedBudget} colorClass={isOver ? 'bg-rose-400' : 'bg-pink-300'} compact />
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderAddTransactionView = () => (
    <div className="bg-white rounded-[24px] shadow-lg shadow-pink-100/50 p-6 h-full flex flex-col animate-slide-up border border-pink-100 relative overflow-hidden">
       {/* Decorative Background Ribbon */}
       <div className="absolute -top-10 -right-10 text-pink-50 opacity-50 transform rotate-45 pointer-events-none">
          <RibbonIcon className="w-48 h-48" />
       </div>

       {/* Camera Scan Overlay */}
       {isScanning && (
         <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center animate-fade-in">
           <div className="relative">
             <div className="absolute inset-0 bg-pink-200 rounded-full animate-ping opacity-50"></div>
             <div className="bg-white p-6 rounded-full shadow-lg relative">
               <Loader2 className="w-12 h-12 text-pink-500 animate-spin" />
             </div>
           </div>
           <p className="mt-4 font-bold text-pink-500 text-lg">レシートを解析中...</p>
           <p className="text-xs text-pink-300 mt-2">AIが頑張って読んでいます ✨</p>
         </div>
       )}

       {/* SCANNED ITEMS REVIEW MODE */}
       {scannedItems.length > 0 ? (
         <div className="flex flex-col h-full relative z-10 animate-fade-in">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-700 flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                    読み取り確認
                </h2>
                <button 
                    onClick={() => setScannedItems([])}
                    className="text-gray-400 hover:text-red-400"
                >
                    <XCircle className="w-6 h-6" />
                </button>
            </div>

            <div className="bg-pink-50 p-3 rounded-xl mb-4 text-sm text-gray-600 grid grid-cols-2 gap-2 border border-pink-100">
                <div>
                    <span className="text-xs text-pink-400 block font-bold">日付</span>
                    <input 
                        type="date" 
                        value={date} 
                        onChange={(e) => setDate(e.target.value)}
                        className="bg-transparent font-bold outline-none w-full"
                    />
                </div>
                <div>
                    <span className="text-xs text-pink-400 block font-bold">店名</span>
                    <input 
                        type="text" 
                        value={storeName} 
                        onChange={(e) => setStoreName(e.target.value)}
                        className="bg-transparent font-bold outline-none w-full placeholder-pink-200"
                        placeholder="店名なし"
                    />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1 pb-4">
                {scannedItems.map((item, idx) => (
                    <div key={idx} className="bg-white border border-pink-100 rounded-xl p-3 shadow-sm flex flex-col gap-2">
                        <div className="flex justify-between items-center">
                            <input 
                                type="text" 
                                value={item.name}
                                onChange={(e) => {
                                    const newItems = [...scannedItems];
                                    newItems[idx].name = e.target.value;
                                    setScannedItems(newItems);
                                }}
                                className="font-bold text-gray-700 outline-none w-full"
                            />
                            <div className="flex items-center">
                                <input 
                                    type="number"
                                    value={item.price}
                                    onChange={(e) => {
                                        const newItems = [...scannedItems];
                                        newItems[idx].price = parseInt(e.target.value) || 0;
                                        setScannedItems(newItems);
                                    }}
                                    className="text-right font-bold text-gray-700 w-20 outline-none border-b border-dashed border-gray-300 focus:border-pink-400"
                                />
                                <span className="text-xs text-gray-400 ml-1">円</span>
                            </div>
                        </div>
                        
                        {/* Compact Category Selector */}
                        <div className="flex gap-1 overflow-x-auto pb-1 no-scrollbar">
                            {categories.map(cat => (
                                <button
                                    key={cat.id}
                                    onClick={() => {
                                        const newItems = [...scannedItems];
                                        newItems[idx].category = cat.id;
                                        setScannedItems(newItems);
                                    }}
                                    className={`flex-shrink-0 px-2 py-1 rounded-md text-[10px] flex items-center gap-1 border transition-colors ${
                                        item.category === cat.id 
                                        ? 'bg-pink-100 border-pink-300 text-pink-600 font-bold' 
                                        : 'bg-gray-50 border-gray-100 text-gray-400'
                                    }`}
                                >
                                    <span>{cat.icon}</span> {cat.name}
                                </button>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            <div className="pt-2 border-t border-pink-100 mt-2">
                <div className="flex justify-between items-center mb-3 px-2">
                    <span className="text-sm font-bold text-gray-500">合計 ({scannedItems.length}点)</span>
                    <span className="text-xl font-bold text-pink-500">
                        {formatCurrency(scannedItems.reduce((sum, item) => sum + (item.price || 0), 0))}
                    </span>
                </div>
                <button
                    onClick={handleBatchSave}
                    className="w-full bg-gradient-to-r from-pink-500 to-rose-400 hover:from-pink-600 hover:to-rose-500 text-white font-bold py-3 rounded-xl shadow-lg shadow-pink-200 transform transition active:scale-95 flex items-center justify-center gap-2"
                >
                    <Save className="w-5 h-5" />
                    まとめて保存
                </button>
            </div>
         </div>
       ) : (
         /* MANUAL INPUT MODE (Original) */
         <>
           <div className="flex items-center justify-between mb-6 relative z-10">
             <h2 className="text-lg font-bold text-gray-700 flex items-center gap-2">
               <span className="w-8 h-8 bg-pink-100 rounded-full flex items-center justify-center text-pink-500">
                  <CreditCard className="w-4 h-4" />
               </span>
               入力をする
             </h2>
             <button 
               onClick={() => fileInputRef.current?.click()}
               className="flex items-center gap-1 text-xs bg-pink-500 text-white px-3 py-2 rounded-full font-bold shadow-md shadow-pink-200 hover:bg-pink-600 transition-colors"
             >
               <Camera className="w-4 h-4" /> スキャン
             </button>
             <input 
               type="file" 
               ref={fileInputRef} 
               className="hidden" 
               accept="image/*"
               capture="environment"
               onChange={handleFileSelect}
             />
           </div>

           <form onSubmit={handleAddTransaction} className="flex flex-col h-full space-y-4 relative z-10">
             {/* ... existing form content ... */}
             <div>
               <div className="relative">
                 <input
                   type="text" 
                   inputMode="numeric" 
                   pattern="\d*"
                   value={amount}
                   onChange={(e) => setAmount(e.target.value)}
                   className="w-full pl-4 pr-12 py-4 text-3xl font-bold text-gray-700 bg-pink-50/50 border-2 border-transparent focus:border-pink-300 rounded-2xl outline-none text-right placeholder-pink-200 transition-all"
                   placeholder="0"
                   required
                   autoComplete="off"
                 />
                 <span className="absolute right-4 top-1/2 transform -translate-y-1/2 text-pink-400 font-bold">円</span>
               </div>
             </div>

             <div className="flex-shrink-0 grid grid-cols-2 gap-3">
                <div className="relative group">
                    <Tag className="absolute left-3 top-1/2 transform -translate-y-1/2 text-pink-300 w-4 h-4" />
                    <input 
                        type="text"
                        value={itemName}
                        onChange={(e) => setItemName(e.target.value)}
                        placeholder="商品名 (例: ランチ)"
                        className="w-full pl-9 pr-3 py-3 text-sm text-gray-700 bg-white border border-pink-100 rounded-xl focus:ring-2 focus:ring-pink-200 focus:border-pink-300 outline-none"
                        required
                    />
                </div>
                <div className="relative group">
                    <Store className="absolute left-3 top-1/2 transform -translate-y-1/2 text-pink-300 w-4 h-4" />
                    <input 
                        type="text"
                        value={storeName}
                        onChange={(e) => setStoreName(e.target.value)}
                        placeholder="店名 (例: カフェ)"
                        className="w-full pl-9 pr-3 py-3 text-sm text-gray-700 bg-white border border-pink-100 rounded-xl focus:ring-2 focus:ring-pink-200 focus:border-pink-300 outline-none"
                    />
                </div>
             </div>

             <div className="flex-1 overflow-y-auto min-h-0 py-2">
               <label className="text-xs font-bold text-pink-300 mb-2 block px-1 flex items-center gap-1">
                 <Sparkles className="w-3 h-3" /> カテゴリ
               </label>
               <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
                 {categories.map(cat => (
                   <button
                     key={cat.id}
                     type="button"
                     onClick={() => setSelectedCategoryId(cat.id)}
                     className={`flex flex-col items-center justify-center p-2 rounded-2xl transition-all border-2 ${
                       selectedCategoryId === cat.id 
                         ? `bg-white border-pink-300 shadow-md shadow-pink-100 transform -translate-y-1` 
                         : 'bg-white border-transparent hover:bg-pink-50'
                     }`}
                   >
                     <span className="text-2xl mb-1 filter drop-shadow-sm">{cat.icon}</span>
                     <span className={`text-[10px] font-bold truncate w-full text-center ${selectedCategoryId === cat.id ? 'text-pink-500' : 'text-gray-400'}`}>
                       {cat.name}
                     </span>
                   </button>
                 ))}
                 <button
                    type="button"
                    onClick={() => setActiveTab('settings')}
                    className="flex flex-col items-center justify-center p-2 rounded-2xl border-2 border-dashed border-pink-200 text-pink-300 hover:bg-pink-50 hover:text-pink-400 hover:border-pink-300 transition-colors"
                 >
                   <Settings className="w-5 h-5 mb-1" />
                   <span className="text-[10px] font-bold">編集</span>
                 </button>
               </div>
             </div>

             <div className="flex-shrink-0 grid grid-cols-2 gap-3 pt-4 border-t border-pink-50">
               <input
                 type="date"
                 value={date}
                 onChange={(e) => setDate(e.target.value)}
                 className="w-full px-3 py-2 text-sm text-gray-600 bg-white border border-pink-100 rounded-lg outline-none focus:border-pink-300"
               />
               <input
                 type="text"
                 value={note}
                 onChange={(e) => setNote(e.target.value)}
                 placeholder="メモ"
                 className="w-full px-3 py-2 text-sm text-gray-600 bg-white border border-pink-100 rounded-lg outline-none focus:border-pink-300"
               />
             </div>

             <button
               type="submit"
               disabled={!amount}
               className="flex-shrink-0 w-full bg-pink-500 hover:bg-pink-600 text-white font-bold py-4 rounded-2xl shadow-lg shadow-pink-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transform active:scale-95 transition-all"
             >
               <Save className="w-5 h-5" /> 
               <span>この内容で記録</span>
             </button>
           </form>
         </>
       )}
    </div>
  );

  const renderHistoryListView = () => (
    <div className="h-full flex flex-col bg-white rounded-[24px] shadow-sm border border-pink-100 overflow-hidden">
      <div className="p-5 border-b border-pink-100 bg-white sticky top-0 z-10 flex justify-between items-center">
        <h2 className="text-lg font-bold text-gray-700">履歴リスト</h2>
        <span className="text-xs bg-pink-100 text-pink-500 px-3 py-1 rounded-full font-bold">{periodData.filteredTrans.length}件</span>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {periodData.filteredTrans.length === 0 ? (
          <div className="text-center py-20">
             <div className="w-16 h-16 bg-pink-50 rounded-full flex items-center justify-center mx-auto mb-3">
                <List className="w-6 h-6 text-pink-300" />
             </div>
             <p className="text-pink-300 text-sm font-medium">履歴はまだありません</p>
          </div>
        ) : (
          periodData.filteredTrans.map(t => {
            const cat = categories.find(c => c.id === t.categoryId) || categories[0];
            return (
              <div key={t.id} className="bg-white p-4 rounded-2xl border border-pink-50 flex justify-between items-center hover:bg-[#FFF5F7] transition-colors group">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${cat?.color || 'bg-gray-100 text-gray-500'}`}>
                    {cat?.icon || '?'}
                  </div>
                  <div>
                    <div className="font-bold text-sm text-gray-700 group-hover:text-pink-600 transition-colors">
                        {t.itemName || t.note || cat?.name}
                    </div>
                    {t.store && <div className="text-xs text-pink-400 font-bold mb-0.5">{t.store}</div>}
                    <div className="text-xs text-gray-400 flex items-center gap-1">
                        {t.date} 
                        {(!t.store && t.itemName && t.note) && <span className="text-pink-300"> • {t.note}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-bold text-gray-700 text-sm">
                    {formatCurrency(t.amount)}
                  </span>
                  <button onClick={() => handleDeleteTransaction(t.id)} className="text-gray-200 hover:text-rose-400 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  const renderSettingsView = () => (
    <div className="bg-white rounded-[24px] shadow-sm p-6 h-full flex flex-col animate-fade-in border border-pink-100">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-lg font-bold text-gray-700 flex items-center gap-2">
            <Settings className="w-5 h-5 text-pink-400" /> 設定
        </h2>
        {user && !user.isAnonymous && (
            <button onClick={() => signOut(auth)} className="text-xs text-gray-400 flex items-center gap-1 hover:text-pink-500">
                <LogOut className="w-3 h-3" /> ログアウト
            </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto space-y-6 pr-1">
        {/* Auth Status */}
        <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
            <h3 className="text-sm font-bold text-gray-700 mb-2">アカウント</h3>
            {user?.isAnonymous ? (
                <div>
                    <p className="text-xs text-gray-500 mb-2">現在はゲスト利用です。データを永続化するにはGoogleログインしてください。</p>
                    <button onClick={handleGoogleLogin} className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-xl text-sm font-bold w-full shadow-sm hover:bg-gray-50">
                        Googleでログイン
                    </button>
                </div>
            ) : (
                <div className="text-sm text-green-600 font-bold flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" /> ログイン済み ({user?.email})
                </div>
            )}
        </div>

        {/* API Key */}
        <div className="bg-pink-50 p-4 rounded-2xl border border-pink-100">
          <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2 mb-2">
            <Key className="w-4 h-4 text-pink-500" /> Gemini API キー
          </h3>
          <div className="flex gap-2">
             <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="AIzaSy..." className="flex-1 px-3 py-2 rounded-xl border border-pink-200 text-sm outline-none" />
             <button onClick={saveApiKey} className="bg-pink-500 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-sm">保存</button>
          </div>
        </div>
        
        {/* Categories */}
        <div>
           <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-bold text-gray-700">カテゴリ一覧</h3>
              <button onClick={() => setEditingCategory({ name: '', icon: '🏷️', color: COLORS[0].bg + ' ' + COLORS[0].text, budget: 10000 })} className="text-xs bg-pink-100 text-pink-600 px-3 py-1 rounded-full font-bold">+ 新規</button>
           </div>
           <div className="space-y-3">
            {categories.map(cat => (
              <div key={cat.id} className="flex items-center justify-between p-4 bg-white rounded-2xl border border-pink-50 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${cat.color}`}>{cat.icon}</div>
                  <div>
                    <div className="font-bold text-sm text-gray-700">{cat.name}</div>
                    <div className="text-xs text-pink-400 font-medium">予算: {formatCurrency(cat.budget)}</div>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => setEditingCategory(cat)} className="p-2 text-gray-300 hover:text-pink-500 hover:bg-pink-50 rounded-lg transition-colors"><Settings className="w-4 h-4" /></button>
                  {/* ★修正: docId または id を使用して削除対象を特定 */}
                  <button onClick={() => handleDeleteCategory(cat.docId || cat.id)} className="p-2 text-gray-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
           </div>
        </div>
      </div>

      {editingCategory && (
        <div className="absolute inset-0 bg-pink-900/20 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-sm rounded-[24px] shadow-xl p-6 animate-slide-up border border-pink-100">
            <h3 className="font-bold text-lg mb-6 text-gray-700 text-center">
                {editingCategory.id ? 'カテゴリを編集' : '新しいカテゴリ'}
            </h3>
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-3">
                <input 
                  type="text" 
                  value={editingCategory.icon} 
                  onChange={e => setEditingCategory({...editingCategory, icon: e.target.value})}
                  className="col-span-1 text-center text-2xl p-3 border border-pink-100 rounded-xl bg-pink-50 focus:border-pink-300 outline-none"
                  placeholder="絵文字"
                />
                <input 
                  type="text" 
                  value={editingCategory.name} 
                  onChange={e => setEditingCategory({...editingCategory, name: e.target.value})}
                  className="col-span-3 p-3 border border-pink-100 rounded-xl bg-pink-50 text-gray-700 font-bold focus:border-pink-300 outline-none"
                  placeholder="カテゴリ名"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-pink-400 mb-1 block">月予算</label>
                <input 
                  type="number" 
                  value={editingCategory.budget} 
                  onChange={e => setEditingCategory({...editingCategory, budget: parseInt(e.target.value) || 0})}
                  className="w-full p-3 border border-pink-100 rounded-xl bg-pink-50 text-gray-700 font-bold focus:border-pink-300 outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-pink-400 mb-2 block">カラー</label>
                <div className="flex gap-3 overflow-x-auto pb-2 px-1">
                  {COLORS.map((c, i) => (
                    <button 
                      key={i} 
                      type="button"
                      onClick={() => setEditingCategory({...editingCategory, color: `${c.bg} ${c.text}`})}
                      className={`w-8 h-8 rounded-full flex-shrink-0 ${c.bg} border-2 shadow-sm transition-transform hover:scale-110 ${editingCategory.color?.includes(c.bg) ? 'border-gray-400 scale-110' : 'border-white'}`}
                    />
                  ))}
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button onClick={() => setEditingCategory(null)} className="flex-1 py-3 text-pink-400 bg-white border border-pink-200 hover:bg-pink-50 rounded-xl font-bold transition-colors">キャンセル</button>
                <button onClick={handleSaveCategory} className="flex-1 py-3 text-white bg-pink-500 hover:bg-pink-600 rounded-xl font-bold shadow-lg shadow-pink-200 transition-colors">保存</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // Main Render (Layout)
  if (loading) return <div className="min-h-screen bg-[#FFF5F7] flex items-center justify-center"><Loader2 className="w-10 h-10 text-pink-400 animate-spin" /></div>;

  return (
    <div className="min-h-screen bg-[#FFF5F7] font-sans text-gray-700 flex flex-col md:h-screen md:overflow-hidden selection:bg-pink-200 selection:text-pink-800">
      <header className="bg-white/80 backdrop-blur-md shadow-sm flex-shrink-0 z-20 border-b border-pink-100 sticky top-0">
        <div className="max-w-6xl mx-auto px-4 py-3 flex justify-between items-center">
          <h1 className="text-xl font-bold text-gray-700 flex items-center gap-2 tracking-tight">
            <RibbonIcon className="w-7 h-7 text-pink-500" />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-pink-500 to-rose-400">MoneyFlow</span>
          </h1>
          <div className="hidden md:flex gap-2">
             {/* PC Nav */}
             <button onClick={() => setActiveTab('dashboard')} className="px-4 py-2 rounded-full text-sm font-bold text-gray-400 hover:text-pink-400">ダッシュボード</button>
             <button onClick={() => setActiveTab('settings')} className="px-4 py-2 rounded-full text-sm font-bold text-gray-400 hover:text-pink-400">設定</button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-hidden relative flex flex-col">
        {activeTab !== 'add' && activeTab !== 'settings' && (
           <div className="max-w-6xl mx-auto w-full pt-4 px-4 md:px-6">
               <div className="rounded-[20px] overflow-hidden shadow-sm border border-pink-100">
                   {renderPeriodSelector()}
               </div>
           </div>
        )}
        <div className="max-w-6xl mx-auto w-full h-full p-4 md:p-6 min-h-0 flex-1">
          <div className="hidden md:grid grid-cols-12 gap-6 h-full">
            <div className="col-span-5 flex flex-col gap-6 h-full overflow-hidden">
              <div className="flex-shrink-0 max-h-[60%] flex flex-col">{renderAddTransactionView()}</div>
              <div className="flex-1 overflow-hidden bg-white rounded-[24px] shadow-sm border border-pink-100 flex flex-col relative">
                 <div className="p-5 overflow-y-auto flex-1 bg-white">{renderDashboardView()}</div>
              </div>
            </div>
            <div className="col-span-7 h-full overflow-hidden">
              {activeTab === 'settings' ? renderSettingsView() : renderHistoryListView()}
            </div>
          </div>
          <div className="md:hidden h-full pb-20 flex flex-col">
            {activeTab === 'dashboard' && renderDashboardView()}
            {activeTab === 'list' && renderHistoryListView()}
            {activeTab === 'add' && renderAddTransactionView()}
            {activeTab === 'settings' && renderSettingsView()}
          </div>
        </div>
      </div>
      
      {/* Mobile Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-md border-t border-pink-100 pb-safe-area z-30 shadow-[0_-4px_6px_-1px_rgba(255,192,203,0.1)]">
        <div className="flex justify-around items-center h-16 px-2">
          <button onClick={() => setActiveTab('dashboard')} className={`flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors ${activeTab === 'dashboard' ? 'text-pink-500' : 'text-gray-300'}`}><LayoutDashboard className="w-5 h-5" /><span className="text-[10px] font-bold">ホーム</span></button>
          <button onClick={() => setActiveTab('list')} className={`flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors ${activeTab === 'list' ? 'text-pink-500' : 'text-gray-300'}`}><List className="w-6 h-6" /><span className="text-[10px] font-bold">履歴</span></button>
          <div className="relative -top-6"><button onClick={() => setActiveTab('add')} className="bg-gradient-to-tr from-pink-400 to-rose-400 text-white rounded-full p-4 shadow-lg shadow-pink-200 transform transition active:scale-95 border-[6px] border-[#FFF5F7]"><Plus className="w-6 h-6" /></button></div>
          <button onClick={() => setActiveTab('settings')} className={`flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors ${activeTab === 'settings' ? 'text-pink-500' : 'text-gray-300'}`}><Settings className="w-5 h-5" /><span className="text-[10px] font-bold">設定</span></button>
          <div className="w-full"></div>
        </div>
      </nav>
    </div>
  );
}