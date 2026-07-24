import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Users,
  UserCircle,
  Wine,
  ClipboardList,
  Beer,
  Search,
  RefreshCw,
  Check,
  Trash2,
  X,
  ChevronRight,
  Filter,
  Image as ImageIcon,
  BookOpen,
  LayoutGrid,
  List as ListIcon,
  Bell,
  Eye,
  EyeOff,
  Lock,
  Tag,
  QrCode,
  MessageCircle,
  Sparkles,
  ArrowLeft,
  Copy,
  ChevronDown,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { PhoneInput } from 'react-international-phone';
import 'react-international-phone/style.css';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { StatusBar, Style as StatusBarStyle } from '@capacitor/status-bar';
import { Cocktail, Order, OrderStatus, IngredientAvailability, EventSession } from './types';
import { CasaApi, CasaApiError } from './services/casaApi';
import { fetchCocktailsFromSheet } from './services/sheet';
import { Button, BottomSheet, Toast, Badge, Toggle } from './components/UI';

// ── Helpers ────────────────────────────────────────
const timeAgo = (timestamp: number): string => {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
};

const playOrderChime = () => {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } catch (e) { /* Audio not available */ }
};

// ── Constants ──────────────────────────────────────
const VERSION = 'v4.0.0';
const SESSION_STORAGE_KEY = 'casa_michele_session_v1';

const INGREDIENT_CATEGORIES = ['Spirit', 'Liqueur', 'Juice', 'Syrup', 'Bitter', 'Other'];
const SPIRITS_LIST = ['Bourbon', 'Calvados', 'Cognac', 'Gin', 'Pisco', 'Rum', 'Tequila', 'Vodka', 'Other'];


const categorizeIngredient = (name: string): string => {
  const n = name.toLowerCase();
  if (n.includes('bitter')) return 'Bitter';
  if (n.includes('juice')) return 'Juice';
  if (n.includes('syrup')) return 'Syrup';
  if (n.includes('ginger beer')) return 'Other';
  if (['bourbon', 'calvados', 'cognac', 'gin', 'pisco', 'rum', 'tequila', 'vodka'].some(s => n.includes(s))) return 'Spirit';
  if (['amaretto', 'aperol', 'apple schnapps', 'blue curacao', 'campari', 'cointreau', 'cacao', 'mente', 'violette', 'kahlua', 'lillet', 'maraschino', 'vermouth'].some(s => n.includes(s))) return 'Liqueur';
  return 'Other';
};

// ── App Component ──────────────────────────────────
const App: React.FC = () => {
  // Core state
  const [view, setView] = useState<'landing' | 'bartender' | 'guest'>('landing');
  const [session, setSession] = useState<EventSession | null>(null);
  const [cocktails, setCocktails] = useState<Cocktail[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [availability, setAvailability] = useState<IngredientAvailability>({});
  const knownOrderIds = useRef(new Set<string>());
  const hasSynced = useRef(false);
  const pendingToggles = useRef(new Set<string>());

  // UI state
  const [activeTab, setActiveTab] = useState<'ingredients' | 'orders' | 'instructions'>('orders');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCocktail, setSelectedCocktail] = useState<Cocktail | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error' | 'info'>('success');
  const [isConfirmingOrder, setIsConfirmingOrder] = useState(false);
  const [lastOrderTime, setLastOrderTime] = useState(0);
  const [guestViewMode, setGuestViewMode] = useState<'grid' | 'list'>('grid');
  const [bartenderViewMode, setBartenderViewMode] = useState<'grid' | 'list'>('grid');
  const [isJoining, setIsJoining] = useState(false);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [connectionState, setConnectionState] = useState<'connecting' | 'online' | 'offline'>('connecting');
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);

  // Filters
  const [filterUnavailableOnly, setFilterUnavailableOnly] = useState(false);
  const [guestShowUnavailable, setGuestShowUnavailable] = useState(false);
  const [activeCategories, setActiveCategories] = useState<string[]>(INGREDIENT_CATEGORIES);
  const [activeRecipeSpirits, setActiveRecipeSpirits] = useState<string[]>(SPIRITS_LIST);
  const [activeGuestSpirits, setActiveGuestSpirits] = useState<string[]>(SPIRITS_LIST);
  const [activeTasteProfiles, setActiveTasteProfiles] = useState<string[]>([]);

  // Notifications
  const [notifiedOrders, setNotifiedOrders] = useState<Set<string>>(new Set());
  const [pickupNotification, setPickupNotification] = useState<Order | null>(null);
  const [hasInitializedOrders, setHasInitializedOrders] = useState(false);

  // QR & Phone
  const [pendingSessionCode, setPendingSessionCode] = useState<string | null>(null);
  const [showQrCode, setShowQrCode] = useState(false);
  const [guestPhoneInput, setGuestPhoneInput] = useState('');

  // Timer for live updating timeAgo
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 15000);
    return () => clearInterval(interval);
  }, []);

  // ── Init ─────────────────────────────────────────
  useEffect(() => {
    const savedRaw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (savedRaw) {
      try {
        const saved = JSON.parse(savedRaw) as EventSession;
        if (!saved.token || new Date(saved.expiresAt).getTime() <= Date.now()) throw new Error('Expired session');
        setSession(saved);
        setView(saved.isBartender ? 'bartender' : 'guest');
      } catch { localStorage.removeItem(SESSION_STORAGE_KEY); }
    }

    const saved = localStorage.getItem('ceb_cocktails_v5');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // If cached data has old hassanfroo URLs, clear and force refresh
        if (parsed.some((c: any) => c.imageUrl?.includes('hassanfroo'))) {
          localStorage.removeItem('ceb_cocktails_v5');
          refreshData();
        } else {
          setCocktails(parsed);
        }
      } catch { refreshData(); }
    } else {
      refreshData();
    }
  }, []);

  // ── Realtime ─────────────────────────────────────
  useEffect(() => {
    if (!session?.token) return;
    let active = true;
    let syncing = false;
    hasSynced.current = false;
    knownOrderIds.current = new Set();
    setConnectionState('connecting');

    const syncData = async () => {
      if (syncing || document.visibilityState === 'hidden') return;
      syncing = true;
      try {
        const snapshot = await CasaApi.getSnapshot(session.token);
        if (!active) return;
        if (hasSynced.current && session.isBartender) {
          const newPendingOrder = snapshot.orders.find(
            order => order.status === 'pending' && !knownOrderIds.current.has(order.id),
          );
          if (newPendingOrder) {
            playOrderChime();
            showToast(`${newPendingOrder.guestName} ordered ${newPendingOrder.cocktailName}`, 'info');
          }
        }
        knownOrderIds.current = new Set(snapshot.orders.map(order => order.id));
        hasSynced.current = true;
        setOrders(snapshot.orders);
        setAvailability(snapshot.availability);
        setConnectionState('online');
        setLastSyncAt(Date.now());
      } catch (error) {
        if (!active) return;
        const apiError = error as CasaApiError;
        if (apiError.isSessionExpired) {
          localStorage.removeItem(SESSION_STORAGE_KEY);
          setSession(null);
          setView('landing');
          setOrders([]);
          setAvailability({});
          showToast(apiError.message, 'error');
        } else {
          setConnectionState('offline');
        }
      } finally {
        syncing = false;
      }
    };

    void syncData();
    const interval = window.setInterval(syncData, 2500);
    const syncWhenVisible = () => { if (document.visibilityState === 'visible') void syncData(); };
    document.addEventListener('visibilitychange', syncWhenVisible);
    window.addEventListener('online', syncData);
    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', syncWhenVisible);
      window.removeEventListener('online', syncData);
    };
  }, [session?.token, view]);


  // Auto-join from URL
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('code');
    if (code) { setPendingSessionCode(code.toUpperCase()); setView('guest'); }
  }, []);

  // Guest notification
  useEffect(() => {
    if (view !== 'guest' || !session || orders.length === 0) return;
    if (!hasInitializedOrders) {
      setNotifiedOrders(new Set(orders.filter(o => o.status === 'completed' && o.guestName === session.guestName).map(o => o.id)));
      setHasInitializedOrders(true);
      return;
    }
    const newReady = orders.find(o => o.status === 'completed' && o.guestName === session.guestName && !notifiedOrders.has(o.id));
    if (newReady) {
      setPickupNotification(newReady);
      setNotifiedOrders(prev => new Set(prev).add(newReady.id));
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    }
  }, [orders, view, session, hasInitializedOrders, notifiedOrders]);

  // ── Actions ──────────────────────────────────────
  const refreshData = async () => {
    setIsRefreshing(true);
    try {
      const data = await fetchCocktailsFromSheet();
      if (data.length > 0) {
        setCocktails(data);
        localStorage.setItem('ceb_cocktails_v5', JSON.stringify(data));
        showToast('Menu updated');
      } else {
        showToast('No cocktails found', 'info');
      }
    } catch {
      showToast('Failed to load menu', 'error');
    }
    setIsRefreshing(false);
  };

  const showToast = useCallback((msg: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastType(type);
    setToastMessage(msg);
  }, []);

  const handleJoin = async (
    role: 'bartender' | 'guest',
    code: string,
    guestName?: string,
    guestPhone?: string,
    pin?: string,
  ) => {
    const eventCode = (code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
    if (!eventCode || isJoining) return;
    setIsJoining(true);
    try {
      const nextSession = role === 'bartender'
        ? await CasaApi.startBartenderSession(eventCode, pin || '')
        : await CasaApi.startGuestSession(eventCode, guestName || '', guestPhone);
      setSession(nextSession);
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(nextSession));
      setView(role);
      setNotifiedOrders(new Set());
      setHasInitializedOrders(false);
      setConnectionState('connecting');
    } catch (error) {
      showToast((error as Error).message, 'error');
    } finally {
      setIsJoining(false);
    }
  };

  const handleExit = () => {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    setSession(null);
    setView('landing');
    setOrders([]);
    setAvailability({});
    setHasInitializedOrders(false);
    setNotifiedOrders(new Set());
    setPendingSessionCode(null);
    setConnectionState('connecting');
    setLastSyncAt(null);
  };

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    void StatusBar.setStyle({ style: StatusBarStyle.Dark });
    void StatusBar.setBackgroundColor({ color: '#09090b' });
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let removeListener: (() => Promise<void>) | undefined;

    void CapacitorApp.addListener('backButton', () => {
      if (isConfirmingOrder) {
        setIsConfirmingOrder(false);
      } else if (selectedCocktail) {
        setSelectedCocktail(null);
      } else if (showQrCode) {
        setShowQrCode(false);
      } else if (session) {
        handleExit();
      } else if (view !== 'landing') {
        setView('landing');
      } else {
        void CapacitorApp.exitApp();
      }
    }).then(handle => {
      removeListener = () => handle.remove();
    });

    return () => {
      if (removeListener) void removeListener();
    };
  }, [isConfirmingOrder, selectedCocktail, showQrCode, session, view]);

  const toggleAvailability = async (ingredient: string) => {
    if (!session?.isBartender || pendingToggles.current.has(ingredient)) return;
    const isCurrentlyOut = !!availability[ingredient];
    pendingToggles.current.add(ingredient);
    setAvailability(prev => {
      const next = { ...prev };
      if (isCurrentlyOut) delete next[ingredient];
      else next[ingredient] = true;
      return next;
    });
    try {
      await CasaApi.setAvailability(session.token, ingredient, isCurrentlyOut);
    } catch (error) {
      setAvailability(prev => {
        const next = { ...prev };
        if (isCurrentlyOut) next[ingredient] = true;
        else delete next[ingredient];
        return next;
      });
      showToast((error as Error).message || 'Failed to update stock.', 'error');
    } finally {
      pendingToggles.current.delete(ingredient);
    }
  };

  const updateOrder = async (orderId: string, status: OrderStatus) => {
    if (!session?.isBartender) return;
    const previous = orders.find(order => order.id === orderId);
    setOrders(prev => status === 'deleted'
      ? prev.filter(order => order.id !== orderId)
      : prev.map(order => (order.id === orderId ? { ...order, status } : order)));
    try {
      await CasaApi.updateOrderStatus(session.token, orderId, status);
      if (status === 'completed') showToast('Marked ready. The guest was notified.');
    } catch (error) {
      if (previous) setOrders(prev => [...prev.filter(order => order.id !== orderId), previous]);
      showToast((error as Error).message || 'Could not update the order.', 'error');
    }
  };

  const openRecipeForOrder = (order: Order) => {
    const cocktail = cocktails.find(c => c.id === order.cocktailId) || cocktails.find(c => c.name === order.cocktailName);
    if (cocktail) setSelectedCocktail(cocktail);
    else showToast('Recipe not found', 'error');
  };

  const placeOrder = async () => {
    if (!session || !selectedCocktail || isSubmittingOrder) return;
    if (connectionState === 'offline') {
      showToast('You are offline. Reconnect to place an order.', 'error');
      return;
    }
    if (selectedCocktail.ingredients.some(i => availability[i])) {
      showToast('Sorry, an ingredient just ran out.', 'error');
      setIsConfirmingOrder(false);
      return;
    }
    if (Date.now() - lastOrderTime < 5000) {
      showToast('Please wait a moment', 'info');
      return;
    }

    setIsSubmittingOrder(true);
    try {
      await CasaApi.placeOrder(session.token, selectedCocktail, crypto.randomUUID());
      setLastOrderTime(Date.now());
      setIsConfirmingOrder(false);
      setSelectedCocktail(null);
      showToast('Order sent to the bar!');
    } catch (error) {
      showToast((error as Error).message || 'Could not place your order.', 'error');
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  const copyShoppingList = () => {
    const outOfStock = allIngredients.filter(i => availability[i]);
    if (outOfStock.length === 0) { showToast('Nothing out of stock'); return; }
    navigator.clipboard.writeText(outOfStock.map(i => `• ${i}`).join('\n')).then(() => showToast(`Copied ${outOfStock.length} items`));
  };

  // ── Derived Data ─────────────────────────────────
  const allIngredients = useMemo(() => {
    const set = new Set(cocktails.flatMap(c => c.ingredients).filter(i => i.length > 1));
    return Array.from(set).sort();
  }, [cocktails]);

  const allTasteProfiles = useMemo(() => {
    const set = new Set(cocktails.flatMap(c => c.tasteProfiles || []));
    return Array.from(set).sort();
  }, [cocktails]);

  const filteredIngredients = useMemo(() => {
    return allIngredients
      .filter(ing => ing.toLowerCase().includes(searchQuery.toLowerCase()))
      .filter(ing => {
        if (filterUnavailableOnly && !availability[ing]) return false;
        return activeCategories.includes(categorizeIngredient(ing));
      });
  }, [allIngredients, searchQuery, filterUnavailableOnly, activeCategories, availability]);

  const filteredGuestCocktails = useMemo(() => {
    return cocktails.filter(c => {
      if (!guestShowUnavailable && c.ingredients.some(i => availability[i])) return false;
      if (!c.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      const spirits = c.ingredients.filter(ing => categorizeIngredient(ing) === 'Spirit');
      const spiritMatch = spirits.length === 0
        ? activeGuestSpirits.includes('Other')
        : spirits.some(ing => activeGuestSpirits.some(s => ing.toLowerCase().includes(s.toLowerCase())));
      if (!spiritMatch) return false;
      if (activeTasteProfiles.length > 0 && !(c.tasteProfiles || []).some(p => activeTasteProfiles.includes(p))) return false;
      return true;
    });
  }, [cocktails, searchQuery, activeGuestSpirits, availability, guestShowUnavailable, activeTasteProfiles]);

  const outOfStockCount = useMemo(() => Object.values(availability).filter(Boolean).length, [availability]);
  const pendingOrderCount = useMemo(() => orders.filter(o => o.status === 'pending').length, [orders]);
  const completedOrderCount = useMemo(() => orders.filter(o => o.status === 'completed').length, [orders]);

  // ════════════════════════════════════════════════
  // ██  LANDING PAGE  ██
  // ════════════════════════════════════════════════
  if (view === 'landing') {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-8 relative overflow-hidden">
        {/* Ambient glow */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_40%,rgba(251,191,36,0.06)_0%,transparent_60%)]" />
        <div className="absolute top-0 left-0 w-full h-full">
          <div className="absolute top-[20%] left-[10%] w-72 h-72 bg-amber-500/[0.03] rounded-full blur-3xl" />
          <div className="absolute bottom-[20%] right-[10%] w-96 h-96 bg-amber-600/[0.02] rounded-full blur-3xl" />
        </div>

        <div className="relative z-10 w-full max-w-sm flex flex-col items-center space-y-12">
          {/* Logo & Branding */}
          <div className="text-center space-y-6 animate-fadeIn">
            <div className="w-24 h-24 bg-gradient-to-br from-amber-400 via-amber-500 to-amber-600 text-zinc-950 rounded-[28px] flex items-center justify-center mx-auto shadow-[0_0_60px_rgba(251,191,36,0.2)] rotate-3 hover:rotate-0 transition-transform duration-500">
              <Wine size={48} strokeWidth={2} />
            </div>
            <div className="space-y-2">
              <h1 className="text-4xl font-bold tracking-tight text-white">Casa Michele</h1>
              <p className="text-zinc-500 text-[15px] leading-relaxed">Browse the menu. Order your cocktail.</p>
            </div>
          </div>

          {/* CTAs */}
          <div className="w-full space-y-3 stagger-2">
            <button
              onClick={() => setView('guest')}
              className="w-full h-[60px] bg-white text-zinc-950 rounded-2xl font-semibold text-[17px] flex items-center justify-center gap-3 active:scale-[0.97] transition-all duration-200 shadow-lg shadow-white/5 hover:shadow-xl hover:shadow-white/10"
            >
              <Users size={20} strokeWidth={2.5} />
              Join as Guest
            </button>
            <p className="text-zinc-600 text-xs text-center px-4 leading-relaxed">
              Scan the QR code or enter the event code to order drinks
            </p>
            <button
              onClick={() => setView('bartender')}
              className="w-full h-14 bg-transparent text-zinc-500 rounded-2xl font-semibold text-[15px] flex items-center justify-center gap-2.5 border border-zinc-800/60 hover:border-zinc-700 hover:text-zinc-400 active:scale-[0.97] transition-all duration-200 mt-2"
            >
              <Lock size={15} />
              Bartender Access
            </button>
          </div>
        </div>

        <div className="absolute bottom-6 text-zinc-800 text-[11px] font-mono">{VERSION}</div>
        <Toast isVisible={!!toastMessage} message={toastMessage} onHide={() => setToastMessage('')} type={toastType} />
      </div>
    );
  }

  // ════════════════════════════════════════════════
  // ██  GUEST ENTRY FORM  ██
  // ════════════════════════════════════════════════
  if (view === 'guest' && !session) {
    return (
      <div className="min-h-screen bg-zinc-950 p-6 flex flex-col relative">
        <button
          onClick={() => setView('landing')}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-zinc-900 text-zinc-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={20} />
        </button>

        <div className="flex-1 flex flex-col justify-center max-w-md mx-auto w-full py-8 animate-slideUp">
          <div className="space-y-2 mb-8">
            <h2 className="text-3xl font-bold text-white tracking-tight">Join the party</h2>
            <p className="text-zinc-500 text-[15px]">Enter your details to start ordering</p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              handleJoin('guest', (pendingSessionCode || fd.get('code') as string), fd.get('name') as string, guestPhoneInput);
            }}
            className="space-y-4"
          >
            <div className="space-y-3">
              <input
                name="name"
                placeholder="Your name"
                required
                autoFocus
                maxLength={60}
                autoComplete="name"
                className="input-field h-14 text-[17px]"
              />

              <div className="w-full">
                <PhoneInput
                  defaultCountry="us"
                  value={guestPhoneInput}
                  onChange={setGuestPhoneInput}
                  inputClassName="!w-full !h-14 !bg-zinc-900 !text-white !text-base !border-none !ring-0 focus:!ring-0 placeholder:!text-zinc-600 !pl-3"
                  className="rounded-2xl ring-1 ring-zinc-700/60 focus-within:ring-2 focus-within:ring-amber-500/50 bg-zinc-900 relative transition-all"
                  countrySelectorStyleProps={{
                    buttonClassName: '!bg-zinc-900 !border-none !h-14 !rounded-l-2xl !pl-4',
                    dropdownStyleProps: {
                      className: '!bg-zinc-900 !text-white !border-zinc-800 !rounded-xl !shadow-xl !z-50',
                      listItemClassName: 'hover:!bg-zinc-800 !text-white',
                    },
                  }}
                  style={{
                    '--react-international-phone-background-color': '#18181b',
                    '--react-international-phone-text-color': '#fff',
                    '--react-international-phone-border-color': 'transparent',
                    '--react-international-phone-height': '56px',
                    '--react-international-phone-font-size': '1rem',
                    '--react-international-phone-border-radius': '0',
                  } as React.CSSProperties}
                />
              </div>

              {!pendingSessionCode ? (
                <input
                  name="code"
                  placeholder="Event code"
                  required
                  minLength={4}
                  maxLength={12}
                  pattern="[A-Za-z0-9]+"
                  autoCapitalize="characters"
                  className="input-field h-14 text-[17px] font-semibold tracking-widest text-center uppercase"
                  autoComplete="one-time-code"
                />
              ) : (
                <div className="h-14 px-5 bg-zinc-800/40 text-zinc-400 rounded-2xl flex items-center justify-between border border-zinc-800/60">
                  <span className="text-sm">Joining session</span>
                  <span className="text-lg font-bold tracking-widest text-white">{pendingSessionCode}</span>
                </div>
              )}
            </div>

            <Button type="submit" disabled={isJoining} className="h-[56px] bg-amber-500 text-zinc-950 font-semibold text-[17px] rounded-2xl mt-2">
              {isJoining ? 'Joining...' : 'Enter Bar'}
            </Button>
          </form>
        </div>

        <Toast isVisible={!!toastMessage} message={toastMessage} onHide={() => setToastMessage('')} type={toastType} />
      </div>
    );
  }

  // ════════════════════════════════════════════════
  // ██  BARTENDER LOGIN  ██
  // ════════════════════════════════════════════════
  if (view === 'bartender' && !session) {
    return (
      <div className="min-h-screen bg-zinc-950 p-6 flex flex-col relative">
        <button
          onClick={() => setView('landing')}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-zinc-900 text-zinc-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={20} />
        </button>

        <div className="flex-1 flex flex-col justify-center max-w-md mx-auto w-full py-8 animate-slideUp">
          <div className="space-y-2 mb-8">
            <h2 className="text-3xl font-bold text-white tracking-tight">Bartender Access</h2>
            <p className="text-zinc-500 text-[15px]">Start a new event or securely resume an existing one</p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const pin = fd.get('password') as string;
              void handleJoin('bartender', fd.get('code') as string, undefined, undefined, pin);
            }}
            className="space-y-4"
          >
            <input
              name="code"
              placeholder="Event code"
              required
              autoFocus
              minLength={4}
              maxLength={12}
              pattern="[A-Za-z0-9]+"
              autoCapitalize="characters"
              autoComplete="username"
              className="input-field h-14 text-[17px] font-semibold tracking-widest text-center uppercase"
            />
            <div className="relative">
              <input
                name="password"
                type="password"
                placeholder="PIN or passphrase"
                required
                minLength={6}
                maxLength={64}
                autoComplete="current-password"
                className="input-field h-14 text-[17px] text-center"
              />
              <div className="absolute right-5 top-1/2 -translate-y-1/2 text-zinc-600">
                <Lock size={18} />
              </div>
            </div>
            <Button type="submit" disabled={isJoining} className="h-[56px] bg-white text-zinc-950 font-semibold text-[17px] rounded-2xl mt-2">
              {isJoining ? 'Securing event...' : 'Start / Sign In'}
            </Button>
          </form>
        </div>

        <Toast isVisible={!!toastMessage} message={toastMessage} onHide={() => setToastMessage('')} type={toastType} />
      </div>
    );
  }

  // ════════════════════════════════════════════════
  // ██  GUEST MENU VIEW  ██
  // ════════════════════════════════════════════════
  if (view === 'guest' && session) {
    const myOrders = orders.filter(o => o.guestName === session.guestName);
    const lastOrder = myOrders.length > 0 ? [...myOrders].sort((a, b) => b.timestamp - a.timestamp)[0] : null;
    const isUnavailable = selectedCocktail?.ingredients.some(i => availability[i]);

    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col">
        {/* Header */}
        <header className="px-5 py-4 flex justify-between items-center border-b border-zinc-800/50 glass sticky top-0 z-30">
          <div className="flex items-center gap-2.5">
            <span className={`w-2 h-2 rounded-full ${connectionState === 'online' ? 'bg-emerald-500' : connectionState === 'offline' ? 'bg-red-500' : 'bg-amber-500'} ${connectionState !== 'offline' ? 'animate-gentlePulse' : ''}`} />
            <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">{session.eventCode} - {connectionState}</span>
          </div>
          <button
            onClick={handleExit}
            className="px-3.5 py-1.5 bg-zinc-800/60 rounded-xl text-zinc-400 text-xs font-semibold hover:text-white transition-colors"
          >
            Exit
          </button>
        </header>

        {/* Last order banner */}
        {lastOrder && (
          <div className="px-4 pt-4 animate-slideUp">
            <div className="bg-amber-500/8 border border-amber-500/15 p-4 rounded-2xl flex items-center justify-between">
              <div>
                <p className="text-amber-500/70 text-[10px] font-semibold uppercase tracking-widest mb-1">Last order</p>
                <p className="text-white font-semibold text-sm">{lastOrder.cocktailName}</p>
              </div>
              <Badge variant={lastOrder.status === 'completed' ? 'success' : 'neutral'}>
                {lastOrder.status === 'completed' ? 'Ready' : lastOrder.status}
              </Badge>
            </div>
          </div>
        )}

        {/* Search & Filters */}
        <div className="sticky top-[57px] z-20 bg-zinc-950/90 backdrop-blur-xl pt-5 pb-2 space-y-3">
          <div className="px-4 space-y-1">
            <h2 className="text-[22px] font-bold text-white tracking-tight">Menu</h2>
            <p className="text-zinc-500 text-[13px]">
              {filteredGuestCocktails.length} cocktail{filteredGuestCocktails.length !== 1 ? 's' : ''} available
            </p>
          </div>

          <div className="px-4 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
              <input
                type="text"
                placeholder="Search cocktails..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-11 pl-10 pr-4 bg-zinc-900/80 rounded-xl ring-1 ring-zinc-800/60 focus:ring-2 focus:ring-amber-500/40 outline-none transition-all text-sm text-white placeholder:text-zinc-600"
              />
            </div>
            <button
              onClick={() => setGuestViewMode(guestViewMode === 'grid' ? 'list' : 'grid')}
              className="h-11 w-11 flex items-center justify-center bg-zinc-900/80 rounded-xl ring-1 ring-zinc-800/60 text-zinc-400 active:scale-95 transition-all"
            >
              {guestViewMode === 'grid' ? <ListIcon size={17} /> : <LayoutGrid size={17} />}
            </button>
          </div>

          {/* Spirit pills */}
          <div className="scroll-x py-1 px-4">
            <button
              onClick={() => setGuestShowUnavailable(!guestShowUnavailable)}
              className={`pill ${guestShowUnavailable ? 'bg-red-500/15 text-red-400 border-red-500/30' : 'pill-inactive'}`}
            >
              {guestShowUnavailable ? <Eye size={13} /> : <EyeOff size={13} />}
              {guestShowUnavailable ? 'Hide Sold Out' : 'Show All'}
            </button>
            <div className="w-px h-5 bg-zinc-800 shrink-0 mx-0.5 self-center" />
            {SPIRITS_LIST.map(spirit => (
              <button
                key={spirit}
                onClick={() => setActiveGuestSpirits(prev => prev.includes(spirit) ? prev.filter(s => s !== spirit) : [...prev, spirit])}
                className={`pill ${activeGuestSpirits.includes(spirit) ? 'pill-active' : 'pill-inactive'}`}
              >
                {spirit}
              </button>
            ))}
          </div>

          {allTasteProfiles.length > 0 && (
            <div className="scroll-x py-0.5 px-4 -mt-1">
              <Tag size={12} className="text-zinc-600 shrink-0 self-center" />
              {allTasteProfiles.map(profile => (
                <button
                  key={profile}
                  onClick={() => setActiveTasteProfiles(prev => prev.includes(profile) ? prev.filter(p => p !== profile) : [...prev, profile])}
                  className={`pill text-[10px] ${activeTasteProfiles.includes(profile) ? 'bg-zinc-100 text-zinc-950 border-zinc-100' : 'pill-inactive'}`}
                >
                  {profile}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Cocktail Grid/List */}
        <div className={`flex-1 overflow-y-auto p-4 pb-20 ${guestViewMode === 'grid' ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 auto-rows-max' : 'flex flex-col gap-2'}`}>
          {filteredGuestCocktails.length === 0 ? (
            <div className="col-span-full py-24 text-center space-y-3 animate-fadeIn">
              <Wine size={40} className="mx-auto text-zinc-700" />
              <p className="text-zinc-500 text-sm font-medium">No matching cocktails</p>
              {!guestShowUnavailable && (
                <button onClick={() => setGuestShowUnavailable(true)} className="text-amber-500 text-xs font-semibold underline underline-offset-2">
                  Show sold out items
                </button>
              )}
            </div>
          ) : (
            filteredGuestCocktails.map((c, idx) => {
              const isOut = c.ingredients.some(i => availability[i]);

              if (guestViewMode === 'grid') {
                return (
                  <div
                    key={c.id}
                    onClick={() => setSelectedCocktail(c)}
                    className={`group card-elevated overflow-hidden flex flex-col cursor-pointer ${isOut ? 'opacity-40 grayscale' : ''}`}
                    style={{ animationDelay: `${Math.min(idx * 30, 300)}ms`, borderRadius: 20 }}
                  >
                    <div className="aspect-square bg-zinc-800 relative overflow-hidden">
                      {c.imageUrl ? (
                        <img
                          src={c.imageUrl}
                          alt={c.name}
                          className="w-full h-full object-cover object-[center_60%] transition-transform duration-500 group-hover:scale-105"
                          loading="lazy"
                          onError={(e) => {
                            const img = e.target as HTMLImageElement;
                            img.style.display = 'none';
                            img.parentElement?.querySelector('.fallback-placeholder')?.classList.remove('hidden');
                          }}
                        />
                      ) : null}
                      <div className={`fallback-placeholder ${c.imageUrl ? 'hidden' : ''} absolute inset-0 bg-gradient-to-br from-zinc-700/60 via-zinc-800 to-zinc-900 flex items-center justify-center`}>
                        <span className="text-3xl font-bold text-zinc-600">{c.name.charAt(0)}</span>
                      </div>
                      <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/60 via-transparent to-transparent" />
                      {isOut && (
                        <div className="absolute top-2.5 right-2.5">
                          <Badge variant="error">Sold Out</Badge>
                        </div>
                      )}
                    </div>
                    <div className="p-3 space-y-1 flex-1 flex flex-col justify-center">
                      <h3 className="text-[13px] font-semibold text-white leading-tight line-clamp-2">{c.name}</h3>
                      <p className="text-zinc-500 text-[10px] font-medium truncate">
                        {c.ingredients.filter(i => categorizeIngredient(i) === 'Spirit').join(' · ') || 'House Mix'}
                      </p>
                      {c.tasteProfiles?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {c.tasteProfiles.slice(0, 2).map(p => (
                            <span key={p} className="text-[9px] font-medium text-zinc-400 bg-zinc-800/60 px-1.5 py-0.5 rounded-md">
                              {p}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={c.id}
                  onClick={() => setSelectedCocktail(c)}
                  className={`flex items-center gap-3.5 p-3 card-flat cursor-pointer ${isOut ? 'opacity-40 grayscale' : ''}`}
                >
                  <div className="h-14 w-14 shrink-0 rounded-xl overflow-hidden bg-zinc-800 relative flex items-center justify-center">
                    {c.imageUrl ? (
                      <img src={c.imageUrl} alt={c.name} className="w-full h-full object-cover" loading="lazy"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    ) : (
                      <span className="text-lg font-bold text-zinc-600">{c.name.charAt(0)}</span>
                    )}
                    {isOut && <div className="absolute inset-0 bg-black/60 flex items-center justify-center"><X size={12} className="text-red-400" /></div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-white truncate">{c.name}</h3>
                    <p className="text-zinc-500 text-[11px] font-medium truncate">
                      {c.ingredients.filter(i => categorizeIngredient(i) === 'Spirit').join(' · ') || 'House Mix'}
                    </p>
                  </div>
                  <ChevronRight size={16} className="text-zinc-700 shrink-0" />
                </div>
              );
            })
          )}
        </div>

        {/* Toast */}
        <Toast isVisible={!!toastMessage} message={toastMessage} onHide={() => setToastMessage('')} type={toastType} />

        {/* Pickup notification */}
        {pickupNotification && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/70 backdrop-blur-md animate-fadeIn">
            <div className="bg-zinc-900 border border-zinc-800/60 p-8 rounded-[32px] w-full max-w-sm text-center space-y-6 shadow-2xl animate-scaleIn">
              <div className="w-20 h-20 bg-emerald-500 rounded-full flex items-center justify-center mx-auto text-white shadow-[0_0_40px_rgba(34,197,94,0.3)] animate-ringPulse">
                <Bell size={36} strokeWidth={2.5} />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-bold text-white">Your drink is ready!</h3>
                <p className="text-zinc-400 text-[15px] leading-relaxed">
                  <span className="text-amber-400 font-semibold">{pickupNotification.cocktailName}</span> is waiting for you at the bar.
                </p>
              </div>
              <button
                onClick={() => setPickupNotification(null)}
                className="w-full h-14 bg-white text-zinc-950 rounded-2xl font-semibold text-base active:scale-[0.97] transition-transform"
              >
                On my way!
              </button>
            </div>
          </div>
        )}

        {/* Cocktail detail */}
        <BottomSheet isOpen={!!selectedCocktail && !isConfirmingOrder} onClose={() => setSelectedCocktail(null)} title={selectedCocktail?.name || ''}
          footer={
            <Button
              onClick={() => setIsConfirmingOrder(true)}
              disabled={!!isUnavailable}
              className={isUnavailable ? 'bg-zinc-800 text-zinc-500' : 'bg-amber-500 text-zinc-950 h-[52px] font-semibold'}
            >
              {isUnavailable ? 'Currently Unavailable' : 'Order This Cocktail'}
            </Button>
          }
        >
          <div className="space-y-5 max-w-2xl mx-auto">
            <div className="aspect-[16/10] rounded-2xl overflow-hidden bg-zinc-800 relative flex items-center justify-center">
              {selectedCocktail?.imageUrl ? (
                <img src={selectedCocktail.imageUrl} className="w-full h-full object-cover object-[center_60%]" loading="lazy"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              ) : (
                <Wine size={48} className="text-zinc-700" />
              )}
              {selectedCocktail?.tasteProfiles?.length > 0 && (
                <div className="absolute top-3 left-3 flex gap-1.5 flex-wrap">
                  {selectedCocktail.tasteProfiles.map(p => (
                    <span key={p} className="px-2.5 py-1 bg-black/50 backdrop-blur-md text-white text-[10px] font-semibold uppercase tracking-wider rounded-lg border border-white/10">
                      {p}
                    </span>
                  ))}
                </div>
              )}
            </div>
            {selectedCocktail?.description && (
              <div className="space-y-1.5">
                <h4 className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">About</h4>
                <p className="text-zinc-300 text-sm leading-relaxed">{selectedCocktail.description}</p>
              </div>
            )}
            <div className="space-y-2">
              <h4 className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Ingredients</h4>
              <div className="space-y-1.5">
                {selectedCocktail?.ingredients.filter(i => i.length > 1).map(ing => (
                  <div key={ing} className={`flex items-center gap-3 p-3 rounded-xl text-sm ${
                    availability[ing] ? 'bg-red-500/8 text-red-400 ring-1 ring-red-500/15' : 'bg-zinc-800/40 text-zinc-200'
                  }`}>
                    {availability[ing] ? <X size={14} className="shrink-0" /> : <Check size={14} className="text-emerald-500 shrink-0" />}
                    <span className="font-medium">{ing}</span>
                    {availability[ing] && <span className="ml-auto text-[9px] font-semibold uppercase text-red-500/70">Out</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </BottomSheet>

        {/* Confirm order */}
        <BottomSheet isOpen={isConfirmingOrder} onClose={() => setIsConfirmingOrder(false)} title="Confirm Order"
          footer={
            <div className="flex flex-col gap-2 max-w-sm mx-auto w-full">
              <Button onClick={placeOrder} disabled={isSubmittingOrder || connectionState === 'offline'} className="bg-amber-500 text-zinc-950 h-[52px] font-semibold">{isSubmittingOrder ? 'Sending...' : 'Confirm Order'}</Button>
              <Button onClick={() => setIsConfirmingOrder(false)} disabled={isSubmittingOrder} variant="ghost" className="text-zinc-500 h-10 text-sm">Cancel</Button>
            </div>
          }
        >
          <div className="py-6 text-center space-y-4">
            <div className="w-16 h-16 bg-amber-500/10 text-amber-500 rounded-2xl flex items-center justify-center mx-auto">
              <Beer size={32} />
            </div>
            <div className="space-y-1">
              <p className="text-zinc-500 text-xs uppercase tracking-wider font-semibold">Ordering</p>
              <p className="text-xl font-bold text-white">{selectedCocktail?.name}</p>
            </div>
          </div>
        </BottomSheet>
      </div>
    );
  }

  // ════════════════════════════════════════════════
  // ██  BARTENDER DASHBOARD  ██
  // ════════════════════════════════════════════════
  if (view === 'bartender' && session) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col">
        {/* Header */}
        <header className="px-5 py-3.5 glass border-b border-zinc-800/40 flex justify-between items-center sticky top-0 z-40">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-amber-400 to-amber-600 rounded-xl flex items-center justify-center text-zinc-950 shadow-lg shadow-amber-500/15">
              <Wine size={17} strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="text-[15px] font-bold text-white tracking-tight leading-none">{session.eventCode}</h1>
              <p className={`text-[10px] font-medium mt-0.5 ${connectionState === 'offline' ? 'text-red-400' : 'text-zinc-500'}`}>{connectionState === 'online' ? 'Live - synced just now' : connectionState === 'offline' ? 'Offline - reconnecting' : 'Connecting...'}</p>
            </div>
          </div>
          <div className="flex gap-1.5">
            <button onClick={() => setShowQrCode(true)} className="w-9 h-9 flex items-center justify-center rounded-xl bg-zinc-800/60 text-zinc-400 hover:text-white transition-colors active:scale-95">
              <QrCode size={17} />
            </button>
            <button onClick={refreshData} className="w-9 h-9 flex items-center justify-center rounded-xl bg-zinc-800/60 text-zinc-400 hover:text-white transition-colors active:scale-95">
              <RefreshCw size={17} className={isRefreshing ? 'animate-spin' : ''} />
            </button>
            <button onClick={handleExit} className="w-9 h-9 flex items-center justify-center rounded-xl bg-zinc-800/60 text-zinc-400 hover:text-white transition-colors active:scale-95">
              <X size={17} />
            </button>
          </div>
        </header>

        {/* QR Modal */}
        {showQrCode && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 overlay" onClick={() => setShowQrCode(false)}>
            <div className="bg-white p-8 rounded-[28px] w-full max-w-sm flex flex-col items-center space-y-5 animate-scaleIn" onClick={e => e.stopPropagation()}>
              <div className="text-center space-y-1">
                <h3 className="text-xl font-bold text-zinc-950">Share Session</h3>
                <p className="text-zinc-500 text-sm">Guests can scan to join</p>
              </div>
              <div className="p-3 bg-white rounded-2xl">
                <QRCodeSVG
                  value={`${Capacitor.isNativePlatform() ? 'https://casa-michele.mic-gritzbach.workers.dev' : window.location.origin}?code=${session.eventCode}`}
                  size={180}
                  level="H"
                  includeMargin
                />
              </div>
              <div className="w-full bg-zinc-100 p-4 rounded-xl text-center">
                <p className="text-zinc-400 text-[10px] font-semibold uppercase tracking-widest mb-1">Session Code</p>
                <p className="text-2xl font-bold text-zinc-950 tracking-[0.15em]">{session.eventCode}</p>
              </div>
              <button
                onClick={() => setShowQrCode(false)}
                className="w-full h-12 bg-zinc-950 text-white rounded-2xl font-semibold active:scale-[0.97] transition-transform"
              >
                Done
              </button>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto pb-24">
          {/* ── STOCK TAB ── */}
          {activeTab === 'ingredients' && (
            <div>
              <div className="sticky top-[57px] z-20 bg-zinc-950/90 backdrop-blur-xl p-4 space-y-3 border-b border-zinc-800/30">
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
                  <input
                    type="text"
                    placeholder="Search ingredients..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full h-11 pl-10 pr-4 bg-zinc-900/80 rounded-xl ring-1 ring-zinc-800/60 focus:ring-2 focus:ring-amber-500/40 outline-none transition-all text-sm text-white placeholder:text-zinc-600"
                  />
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setFilterUnavailableOnly(!filterUnavailableOnly)}
                    className={`pill ${filterUnavailableOnly ? 'bg-red-500/15 text-red-400 border-red-500/30' : 'pill-inactive'}`}
                  >
                    Out Only{outOfStockCount > 0 ? ` (${outOfStockCount})` : ''}
                  </button>
                  {outOfStockCount > 0 && (
                    <button onClick={copyShoppingList} className="pill bg-zinc-800/60 text-zinc-300 border-zinc-700/50">
                      <Copy size={12} /> Shopping List
                    </button>
                  )}
                  {INGREDIENT_CATEGORIES.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setActiveCategories(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat])}
                      className={`pill ${activeCategories.includes(cat) ? 'bg-zinc-100 text-zinc-950 border-zinc-100' : 'pill-inactive'}`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1.5">
                {filteredIngredients.map((ing) => {
                  const isOut = !!availability[ing];
                  return (
                    <div
                      key={ing}
                      className={`flex items-center justify-between h-[56px] px-4 rounded-2xl cursor-pointer transition-all duration-200 border select-none ${
                        isOut
                          ? 'bg-red-500/5 border-red-500/15 hover:bg-red-500/10'
                          : 'bg-zinc-900/60 border-zinc-800/50 hover:bg-zinc-800/60'
                      }`}
                    >
                      <div className="flex flex-col">
                        <span className={`text-[13px] font-semibold ${isOut ? 'text-red-400' : 'text-zinc-200'}`}>{ing}</span>
                        <span className="text-[9px] font-medium text-zinc-600 uppercase tracking-wider">{categorizeIngredient(ing)}</span>
                      </div>
                      <Toggle on={!isOut} onToggle={() => toggleAvailability(ing)} size="md" />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── ORDERS TAB ── */}
          {activeTab === 'orders' && (
            <div className="p-4 space-y-4 max-w-4xl mx-auto w-full">
              {/* Stats bar */}
              <div className="flex justify-between items-center px-1">
                <div>
                  <h2 className="text-lg font-bold text-white tracking-tight">Orders</h2>
                  {orders.length > 0 && (
                    <div className="flex items-center gap-3 mt-1">
                      <span className="flex items-center gap-1.5 text-xs font-medium text-amber-400">
                        <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-gentlePulse" />
                        {pendingOrderCount} pending
                      </span>
                      <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                        {completedOrderCount} done
                      </span>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setBartenderViewMode(bartenderViewMode === 'grid' ? 'list' : 'grid')}
                  className="w-9 h-9 flex items-center justify-center bg-zinc-800/60 rounded-xl text-zinc-400 active:scale-95 transition-transform"
                >
                  {bartenderViewMode === 'grid' ? <ListIcon size={16} /> : <LayoutGrid size={16} />}
                </button>
              </div>

              {orders.length === 0 ? (
                <div className="py-24 text-center space-y-4 animate-fadeIn">
                  <div className="w-16 h-16 bg-zinc-900 rounded-2xl flex items-center justify-center mx-auto text-zinc-700 border border-zinc-800/50">
                    <ClipboardList size={28} />
                  </div>
                  <div>
                    <p className="text-zinc-400 font-semibold text-base">No orders yet</p>
                    <p className="text-zinc-600 text-sm mt-1">Orders from guests appear here in real-time</p>
                  </div>
                </div>
              ) : (
                <div className={`grid ${bartenderViewMode === 'grid' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1'} gap-3`}>
                  {[...orders].sort((a, b) => {
                      if (a.status === 'pending' && b.status !== 'pending') return -1;
                      if (a.status !== 'pending' && b.status === 'pending') return 1;
                      return (b.timestamp || 0) - (a.timestamp || 0);
                    })
                    .map(o => {
                      const minutesOld = o.timestamp ? Math.floor((Date.now() - o.timestamp) / 60000) : 0;
                      const isUrgent = o.status === 'pending' && minutesOld > 10;
                      const isWarning = o.status === 'pending' && minutesOld > 5 && !isUrgent;

                      return (
                        <div
                          key={o.id}
                          className={`card-elevated p-4 relative overflow-hidden transition-all duration-200 ${
                            isUrgent ? '!border-red-500/40 !border-l-4' : isWarning ? '!border-amber-500/40 !border-l-4' : ''
                          }`}
                          style={{ borderRadius: 20 }}
                        >
                          {/* Accent corner for pending */}
                          {o.status === 'pending' && (
                            <div className="absolute top-0 right-0 w-16 h-16 bg-amber-500/8 rounded-bl-[60px] -mr-4 -mt-4 pointer-events-none" />
                          )}

                          <div className="flex justify-between items-start mb-3">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <h3 className="font-bold text-white text-base">{o.cocktailName}</h3>
                                {o.status === 'pending' && <span className="w-2 h-2 bg-amber-500 rounded-full animate-gentlePulse" />}
                              </div>
                              <div className="flex items-center gap-2 text-zinc-500 text-[11px] font-medium">
                                <UserCircle size={12} />
                                <span>{o.guestName}</span>
                                {o.timestamp && (
                                  <span className={`${isUrgent ? 'text-red-400' : isWarning ? 'text-amber-400' : ''}`}>
                                    · {timeAgo(o.timestamp)}
                                  </span>
                                )}
                              </div>
                            </div>
                            <Badge variant={o.status === 'completed' ? 'success' : o.status === 'pending' ? 'warning' : 'neutral'}>
                              {o.status === 'completed' ? 'Done' : o.status}
                            </Badge>
                          </div>

                          {/* Action buttons */}
                          <div className="flex gap-2">
                            {o.status === 'pending' ? (
                              <>
                                <button
                                  onClick={() => { updateOrder(o.id, 'completed'); if (navigator.vibrate) navigator.vibrate(50); }}
                                  className="flex-1 h-[52px] bg-emerald-500 text-white rounded-2xl font-bold text-sm tracking-wide hover:bg-emerald-400 active:scale-[0.97] transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/15"
                                >
                                  <Check size={20} strokeWidth={3} /> Done
                                </button>
                                <button
                                  onClick={() => openRecipeForOrder(o)}
                                  className="w-[52px] h-[52px] bg-zinc-800/60 text-zinc-400 rounded-2xl flex items-center justify-center hover:bg-zinc-700 hover:text-white transition-all active:scale-95"
                                >
                                  <BookOpen size={18} />
                                </button>
                              </>
                            ) : (
                              <>
                                {o.guestPhone && o.status === 'completed' && (
                                  <button
                                    onClick={() => {
                                      const text = `Hey ${o.guestName}! Your ${o.cocktailName} is ready at the bar!`;
                                      window.open(`https://wa.me/${o.guestPhone}?text=${encodeURIComponent(text)}`, '_blank');
                                    }}
                                    className="w-12 h-12 bg-emerald-500 text-white rounded-2xl flex items-center justify-center active:scale-90 transition-all shadow-lg shadow-emerald-500/15"
                                  >
                                    <MessageCircle size={20} fill="currentColor" />
                                  </button>
                                )}
                                {o.status === 'completed' && (
                                  <button
                                    onClick={() => updateOrder(o.id, 'pending')}
                                    className="flex-1 h-12 bg-zinc-800/50 text-zinc-400 rounded-2xl font-semibold text-xs hover:bg-zinc-700 hover:text-white transition-all"
                                  >
                                    Undo
                                  </button>
                                )}
                                <button
                                  onClick={() => updateOrder(o.id, 'deleted')}
                                  className="w-12 h-12 bg-zinc-900 border border-zinc-800/50 text-zinc-600 rounded-2xl flex items-center justify-center hover:text-red-400 hover:border-red-500/20 transition-all"
                                >
                                  <Trash2 size={18} />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          )}

          {/* ── INSTRUCTIONS TAB ── */}
          {activeTab === 'instructions' && (
            <div className="p-4 space-y-3 max-w-4xl mx-auto w-full">
              <h2 className="text-lg font-bold text-white tracking-tight px-1 mb-1">Recipes</h2>
              {cocktails.map(c => (
                <div
                  key={c.id}
                  onClick={() => setSelectedCocktail(c)}
                  className="flex items-center gap-3.5 p-3 card-flat cursor-pointer hover:bg-zinc-800/40 transition-colors"
                >
                  <div className="w-11 h-11 bg-zinc-800 rounded-xl overflow-hidden shrink-0 flex items-center justify-center">
                    {c.imageUrl ? (
                      <img src={c.imageUrl} className="w-full h-full object-cover" loading="lazy"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    ) : (
                      <span className="text-sm font-bold text-zinc-600">{c.name.charAt(0)}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-white text-sm truncate">{c.name}</h3>
                    <p className="text-zinc-500 text-[10px] font-medium uppercase tracking-wider truncate">
                      {c.ingredients.filter(i => categorizeIngredient(i) === 'Spirit').join(' · ') || 'House'}
                    </p>
                  </div>
                  <ChevronRight size={16} className="text-zinc-700 shrink-0" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recipe Bottom Sheet */}
        <BottomSheet isOpen={!!selectedCocktail} onClose={() => setSelectedCocktail(null)} title={selectedCocktail?.name || ''}>
          <div className="space-y-5 max-w-3xl mx-auto">
            <div className="space-y-2">
              <h4 className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Ingredients</h4>
              <div className="flex flex-wrap gap-1.5">
                {selectedCocktail?.ingredients.filter(i => i.length > 1).map(ing => (
                  <div key={ing} className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 ${
                    availability[ing] ? 'bg-red-500/8 ring-1 ring-red-500/15 text-red-400' : 'bg-zinc-800/50 text-zinc-200'
                  }`}>
                    {availability[ing] ? <X size={11} strokeWidth={3} /> : <Check size={11} strokeWidth={3} className="text-emerald-500" />}
                    {ing}
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <h4 className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Instructions</h4>
              <div className="p-4 bg-zinc-800/30 rounded-2xl border border-zinc-800/40">
                <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">{selectedCocktail?.instructions}</p>
              </div>
            </div>
          </div>
        </BottomSheet>

        {/* Navigation */}
        <nav className="nav-bar safe-bottom">
          <div className="flex justify-around items-center h-[72px] px-4 max-w-lg mx-auto">
            {([
              { id: 'ingredients' as const, icon: ClipboardList, label: 'Stock' },
              { id: 'orders' as const, icon: Wine, label: 'Orders', featured: true },
              { id: 'instructions' as const, icon: BookOpen, label: 'Recipes' },
            ]).map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="nav-item"
                style={{ color: activeTab === tab.id ? '#f59e0b' : '#52525b' }}
              >
                {tab.featured ? (
                  <div className={`p-3 rounded-2xl -mt-10 shadow-xl transition-all duration-200 ${
                    activeTab === tab.id
                      ? 'bg-gradient-to-br from-amber-400 to-amber-600 text-zinc-950 scale-105'
                      : 'bg-zinc-800 text-zinc-400'
                  }`}>
                    <tab.icon size={22} strokeWidth={2.5} />
                    {pendingOrderCount > 0 && (
                      <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[9px] font-bold rounded-full border-2 border-zinc-900 flex items-center justify-center">
                        {pendingOrderCount}
                      </div>
                    )}
                  </div>
                ) : (
                  <tab.icon size={20} strokeWidth={activeTab === tab.id ? 2.5 : 2} />
                )}
                <span className="nav-item-label">{tab.label}</span>
              </button>
            ))}
          </div>
        </nav>

        <Toast isVisible={!!toastMessage} message={toastMessage} onHide={() => setToastMessage('')} type={toastType} />
      </div>
    );
  }

  return null;
};

export default App;
